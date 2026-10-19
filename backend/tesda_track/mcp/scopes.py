"""The scope each MCP tool needs, how often one client may call it each minute, and the check on both list and call."""
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.shared.exceptions import MCPError

TOOL_SCOPES: dict[str, str] = {
    "match_qualifications": "recommend:run",
    "get_qualification": "catalog:read",
    "recommend_route": "recommend:run",
    "check_readiness": "recommend:run",
    "rank_training_programs": "recommend:run",
    "rank_assessment_schedules": "recommend:run",
    "search_training_programs": "catalog:read",
    "get_regional_supply": "catalog:read",
    "get_qualification_demand": "reports:read",
}

TOOL_LIMITS: dict[str, int] = {
    "match_qualifications": 30,
    "get_qualification": 120,
    "recommend_route": 60,
    "check_readiness": 60,
    "rank_training_programs": 30,
    "rank_assessment_schedules": 30,
    "search_training_programs": 60,
    "get_regional_supply": 10,
    "get_qualification_demand": 10,
}


class ScopeMiddleware:
    """A tool outside the token's scopes isn't listed, and calling it gets the same error as an unknown tool."""

    async def __call__(self, ctx: ServerRequestContext, call_next: CallNext) -> HandlerResult:
        token = get_access_token()
        granted = frozenset(token.scopes) if token else frozenset()
        if ctx.method == "tools/call":
            name = ctx.params.get("name") if isinstance(ctx.params, dict) else None
            # Anything but a string fails the SDK's params validation further in.
            if isinstance(name, str) and TOOL_SCOPES.get(name) not in granted:
                raise MCPError(code=-32602, message=f"Unknown tool: {name}")
        result = await call_next(ctx)
        if ctx.method == "tools/list":
            result["tools"] = [tool for tool in result["tools"] if TOOL_SCOPES.get(tool["name"]) in granted]
        return result
