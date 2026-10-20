"""Bearer tokens on the MCP endpoint: the partner access tokens the client-credentials token endpoint issues."""
import threading

import anyio
from fastapi import FastAPI
from mcp.server.auth.provider import AccessToken

from tesda_track.config import get_settings
from tesda_track.mcp.deps import open_session
from tesda_track.services import mcp_usage
from tesda_track.services.rate_limit import RateLimiter
from tesda_track.services.partner_clients import InvalidPartnerToken, mcp_resource_url, verify_access_token


# Denials that name no known client cost the caller nothing, so they share one budget instead of one commit each.
# Those over the budget are counted, and the next one written carries the count in a "suppressed" summary row.
_unattributed_denials = RateLimiter()
UNATTRIBUTED_DENIALS_PER_MINUTE = 60
_suppressed = 0
_suppressed_lock = threading.Lock()


# A revoked or deactivated client holding a token that has not expired is capped too, per client and counted apart.
_attributed_denials = RateLimiter()
ATTRIBUTED_DENIALS_PER_MINUTE = 20
_suppressed_attributed: dict[str, int] = {}


def _suppress_or_take_count(client_id=None) -> tuple[bool, int]:
    """(True, 0) when this denial is over budget and is counted; else (False, denials counted since the last write).
    The budget is shared by all unattributed denials, and one apiece for each client named."""
    global _suppressed
    with _suppressed_lock:
        if client_id is None:
            if _unattributed_denials.hit("all", UNATTRIBUTED_DENIALS_PER_MINUTE):
                _suppressed += 1
                return True, 0
            suppressed, _suppressed = _suppressed, 0
            return False, suppressed
        key = str(client_id)
        if _attributed_denials.hit(key, ATTRIBUTED_DENIALS_PER_MINUTE):
            _suppressed_attributed[key] = _suppressed_attributed.get(key, 0) + 1
            return True, 0
        return False, _suppressed_attributed.pop(key, 0)


class PartnerTokenVerifier:
    """None for a bad, expired, foreign or revoked token; the SDK answers 401 with the resource metadata URL."""

    def __init__(self, app: FastAPI):
        self.app = app

    async def verify_token(self, token: str) -> AccessToken | None:
        return await anyio.to_thread.run_sync(self._verify, token)

    def _verify(self, token: str) -> AccessToken | None:
        settings = get_settings()
        with open_session(self.app) as session:
            try:
                principal = verify_access_token(session, token, settings)
            except InvalidPartnerToken as denied:
                over_budget, suppressed = _suppress_or_take_count(denied.client_id)
                if over_budget:
                    return None
                if suppressed:
                    mcp_usage.record_call(session, client_id=denied.client_id, method="http", outcome="denied_token",
                                          error_code=mcp_usage.SUPPRESSED, result_count=suppressed, latency_ms=0)
                mcp_usage.record_call(session, client_id=denied.client_id, method="http", outcome="denied_token",
                                      error_code=denied.reason, latency_ms=0)
                return None
        return AccessToken(token=token, client_id=str(principal.client_id), scopes=sorted(principal.scopes),
                           expires_at=principal.expires_at, resource=mcp_resource_url(settings),
                           claims={"name": principal.name, "expected_tools": list(principal.expected_tools),
                                   "rate_limit_per_minute": principal.rate_limit_per_minute})
