"""The MCP endpoint (/mcp) and its protected resource metadata, served from the API's own app."""
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.routing import Route
from starlette.types import ASGIApp, Receive, Scope, Send

from tesda_track.config import get_settings
from tesda_track.mcp import tools_catalog, tools_recommend, tools_reports
from tesda_track.mcp.auth import PartnerTokenVerifier
from tesda_track.mcp.deps import hide_inputs_in_errors
from tesda_track.mcp.scopes import ScopeMiddleware
from tesda_track.mcp.usage import UsageMiddleware
from tesda_track.services.partner_clients import mcp_resource_url
from tesda_track.services.rate_limit import RateLimiter

# The paths the SDK's app serves. Only these reach it, so the API keeps its own 404s, 405s and redirects.
MCP_PATHS = ("/mcp", "/.well-known/oauth-protected-resource/mcp")

INSTRUCTIONS = (
    "TESDA-TRACK answers questions about TESDA qualifications, training programs and the training and assessment "
    "supply in each region, and suggests qualifications and next steps toward a learner's goal. "
    "What you send about a person (a goal, answers or a location) is used only to answer the call and is never "
    "stored.")


def _server(app: FastAPI) -> MCPServer:
    settings = get_settings()
    # MCPServer calls logging.basicConfig(INFO), which would print every library's INFO records, httpx's request
    # URLs among them (a directions request's URL holds the learner's coordinates). Keep the app's own setup.
    root = logging.getLogger()
    handlers, level = list(root.handlers), root.level
    try:
        return MCPServer(
            name="tesda-track", version="1.0.0", instructions=INSTRUCTIONS, token_verifier=PartnerTokenVerifier(app),
            auth=AuthSettings(issuer_url=settings.public_base_url, resource_server_url=mcp_resource_url(settings),
                              validate_token_resource=True),
            middleware=[UsageMiddleware(app), ScopeMiddleware()])
    finally:
        root.handlers[:] = handlers
        root.setLevel(level)


class _PerLifespanApp:
    """The SDK runs a session manager once only, so every app lifespan gets the MCP app built afresh. Lifespans are
    expected one after another: production has one, the tests one per TestClient. When TestClients nest, MCP
    requests reach the innermost one's app until it ends, then the enclosing one's again."""

    def __init__(self, server: MCPServer, build: Callable[[], ASGIApp]):
        self.server = server
        self.build = build
        self.current = build()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.current(scope, receive, send)

    @asynccontextmanager
    async def running(self) -> AsyncIterator[None]:
        previous, self.current = self.current, self.build()
        try:
            async with self.server.session_manager.run():
                yield
        finally:
            self.current = previous


@asynccontextmanager
async def run_mcp(app: FastAPI) -> AsyncIterator[None]:
    """Serves MCP requests for the app's lifespan; does nothing when the server isn't installed."""
    mcp_app = getattr(app.state, "mcp_app", None)
    if mcp_app is None:
        yield
        return
    async with mcp_app.running():
        yield


def install_mcp(app: FastAPI) -> MCPServer | None:
    """Routes MCP_PATHS, any method, to the MCP app (raw ASGI routes stay out of the OpenAPI schema)."""
    settings = get_settings()
    if not settings.mcp_enabled:
        return None
    app.state.mcp_limits = RateLimiter()
    server = _server(app)
    tools_catalog.register(server, app)
    tools_recommend.register(server, app)
    tools_reports.register(server, app)
    hide_inputs_in_errors(server)
    security = TransportSecuritySettings(
        allowed_hosts=[urlsplit(settings.public_base_url).netloc, *settings.mcp_allowed_hosts])
    mcp_app = _PerLifespanApp(server, lambda: server.streamable_http_app(
        streamable_http_path="/mcp", stateless_http=True, json_response=True, transport_security=security))
    for path in MCP_PATHS:
        app.router.routes.append(Route(path, endpoint=mcp_app, include_in_schema=False))
    app.state.mcp_server = server
    app.state.mcp_app = mcp_app
    return server
