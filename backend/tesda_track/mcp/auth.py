"""Bearer tokens on the MCP endpoint: the partner access tokens the client-credentials token endpoint issues."""
import anyio
from fastapi import FastAPI
from mcp.server.auth.provider import AccessToken

from tesda_track.config import get_settings
from tesda_track.mcp.deps import open_session
from tesda_track.services import mcp_usage
from tesda_track.services.partner_clients import InvalidPartnerToken, mcp_resource_url, verify_access_token


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
                mcp_usage.record_call(session, client_id=denied.client_id, method="http", outcome="denied_token",
                                      error_code=denied.reason, latency_ms=0)
                return None
        return AccessToken(token=token, client_id=str(principal.client_id), scopes=sorted(principal.scopes),
                           expires_at=principal.expires_at, resource=mcp_resource_url(settings),
                           claims={"name": principal.name, "expected_tools": list(principal.expected_tools),
                                   "rate_limit_per_minute": principal.rate_limit_per_minute})
