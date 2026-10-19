"""The MCP endpoint (/mcp) and its protected resource metadata, served from the API's own app."""
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.types import ASGIApp, Receive, Scope, Send

from tesda_track.config import get_settings
from tesda_track.mcp import tools_catalog
from tesda_track.mcp.auth import PartnerTokenVerifier
from tesda_track.mcp.scopes import ScopeMiddleware
from tesda_track.services.partner_clients import mcp_resource_url

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
            middleware=[ScopeMiddleware()])
    finally:
        root.handlers[:] = handlers
        root.setLevel(level)


class _MountedApp:
    """The SDK runs a session manager once only, so every app lifespan gets the MCP app built afresh. Production
    has one lifespan; the tests have one per TestClient, sometimes two at once on the same app."""

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
    mounted = getattr(app.state, "mcp_app", None)
    if mounted is None:
        yield
        return
    async with mounted.running():
        yield


def install_mcp(app: FastAPI) -> MCPServer | None:
    """Mounts the MCP app at the root, so call it after every API route: it answers whatever they don't."""
    settings = get_settings()
    if not settings.mcp_enabled:
        return None
    server = _server(app)
    tools_catalog.register(server, app)
    security = TransportSecuritySettings(
        allowed_hosts=[urlsplit(settings.public_base_url).netloc, *settings.mcp_allowed_hosts])
    mounted = _MountedApp(server, lambda: server.streamable_http_app(
        streamable_http_path="/mcp", stateless_http=True, json_response=True, transport_security=security))
    app.mount("/", mounted)
    app.state.mcp_server = server
    app.state.mcp_app = mounted
    return server
