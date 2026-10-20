"""Logs and rate-limits every MCP request. The log holds the shape of each call (which arguments were sent, how many
results came back), never what the partner sent."""
import re
import time
import uuid
from collections.abc import Mapping

import anyio
from fastapi import FastAPI
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.shared.exceptions import MCPError
from pydantic import ValidationError
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.mcp import deps
from tesda_track.models import OfficialQualificationCode, Qualification, Region
from tesda_track.mcp.scopes import TOOL_LIMITS, TOOL_SCOPES, ScopeRefusal
from tesda_track.services import mcp_usage
from tesda_track.services.ranking import goal_fingerprint

QUALIFICATION_CODE = re.compile(r"[A-Za-z0-9-]{1,40}")
TOOL_NAME = re.compile(r"[A-Za-z0-9_.-]{1,64}")
REGION_CODE = re.compile(r"[A-Za-z0-9-]{1,20}")
KNOWN_METHODS = frozenset({
    "initialize", "ping", "notifications/initialized", "server/discover", "tools/list", "tools/call",
    "resources/list", "resources/templates/list", "resources/read", "prompts/list", "prompts/get",
    "completion/complete", "logging/setLevel"})
RESULT_LISTS = ("matches", "results", "programs", "regions", "rows", "competencies")
RATE_LIMITED = -32000


def _code(value, pattern: re.Pattern) -> str | None:
    return value if isinstance(value, str) and pattern.fullmatch(value) else None


def _result_count(result) -> int | None:
    content = result.get("structuredContent") if isinstance(result, Mapping) else None
    if isinstance(content, Mapping):
        for key in RESULT_LISTS:
            if isinstance(content.get(key), list):
                return len(content[key])
    return None


def _shape(arguments: Mapping) -> dict:
    """What a tools/call logs about its arguments: their names, two catalog codes and the goal's keyed hash."""
    goal = arguments.get("goal")
    offset = arguments.get("offset")
    return {
        "inputs_sent": sorted(str(name) for name, value in arguments.items() if value is not None),
        "qualification_code": _code(arguments.get("qualification_code", arguments.get("code")), QUALIFICATION_CODE),
        "region_code": _code(arguments.get("region_code"), REGION_CODE),
        "goal_fingerprint": goal_fingerprint(goal, get_settings().secret_key.get_secret_value())
        if isinstance(goal, str) and goal else None,
        "page_offset": offset if isinstance(offset, int) and not isinstance(offset, bool) else None,
    }


class UsageMiddleware:
    """Outermost: it limits the call before anything runs and sees the outcome of everything inside it."""

    def __init__(self, app: FastAPI):
        self.app = app

    async def __call__(self, ctx: ServerRequestContext, call_next: CallNext) -> HandlerResult:
        params = ctx.params if isinstance(ctx.params, Mapping) else {}
        is_call = ctx.method == "tools/call"
        asked = _code(params.get("name"), TOOL_NAME) if is_call else None
        name = (asked if asked in TOOL_SCOPES else "unknown") if is_call else None
        arguments = params.get("arguments") if is_call and isinstance(params.get("arguments"), Mapping) else {}
        # Only names the tool itself declares are kept: anything else is the partner's own text.
        declared = self._argument_names(name)
        arguments = {key: value for key, value in arguments.items() if key in declared}
        token = get_access_token()
        fields = {"client_id": uuid.UUID(token.client_id) if token else None, "method": ctx.method if ctx.method in KNOWN_METHODS else "other",
                  "tool": name, "protocol_version": ctx.protocol_version}
        if is_call:
            fields.update(_shape(arguments))
        started = time.perf_counter()
        result = None
        try:
            if not ctx.method.startswith("notifications/"):
                self._enforce_limits(asked)
            deps.begin_ranking_audit()
            result = await call_next(ctx)
            fields["outcome"] = "tool_error" if isinstance(result, Mapping) and result.get("isError") else "ok"
        except MCPError as error:
            fields["error_code"] = str(error.error.code)
            if isinstance(error, ScopeRefusal):
                fields["outcome"] = "denied_scope"
            else:
                fields["outcome"] = "rate_limited" if error.error.code == RATE_LIMITED else "invalid_request"
            raise
        except ValidationError:
            fields["outcome"] = "invalid_request"
            raise
        except Exception as error:
            fields["outcome"] = "server_error"
            fields["error_code"] = type(error).__name__[:64]
            raise
        finally:
            fields["latency_ms"] = round((time.perf_counter() - started) * 1000)
            if "outcome" in fields:
                if ctx.method == "tools/list" and fields["outcome"] == "ok":
                    fields["result_count"] = len(result["tools"])
                elif is_call:
                    fields["result_count"] = _result_count(result)
                fields["ranking_audit_id"] = deps.take_ranking_audit()
                await anyio.to_thread.run_sync(self._record, fields)
        return result

    def _argument_names(self, tool: str | None) -> frozenset[str]:
        server = getattr(self.app.state, "mcp_server", None)
        for registered in server._tool_manager.list_tools() if server else ():
            if registered.name == tool:
                return frozenset(registered.fn_metadata.arg_model.model_fields)
        return frozenset()

    def _enforce_limits(self, tool: str | None) -> None:
        token = get_access_token()
        if token is None:
            return
        principal = deps.principal()
        limiter = self.app.state.mcp_limits
        client = str(principal.client_id)
        wait = limiter.hit(f"{client}:*", principal.rate_limit_per_minute)
        if not wait and tool in TOOL_LIMITS:
            wait = limiter.hit(f"{client}:{tool}", TOOL_LIMITS[tool])
        if wait:
            seconds = max(1, round(wait))
            raise MCPError(code=RATE_LIMITED, message=f"Rate limit exceeded; retry in {seconds} seconds.",
                           data={"retry_after": seconds})

    def _record(self, fields: dict) -> None:
        with deps.open_session(self.app) as session:
            self._keep_known_codes(session, fields)
            mcp_usage.record_call(session, **fields)

    @staticmethod
    def _keep_known_codes(session, fields: dict) -> None:
        """A code is logged only when it names a real qualification or region: anything else is partner-chosen text."""
        try:
            code = fields.get("qualification_code")
            if code and not session.exec(select(Qualification.id).where(Qualification.code == code)).first():
                official = session.exec(select(OfficialQualificationCode.official_code).where(
                    OfficialQualificationCode.official_code == code.upper())).first()
                fields["qualification_code"] = official
            region = fields.get("region_code")
            if region and session.get(Region, region) is None:
                fields["region_code"] = None
        except Exception:
            session.rollback()
            fields["qualification_code"] = fields["region_code"] = None
