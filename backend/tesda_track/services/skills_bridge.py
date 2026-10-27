"""Client for Skills Bridge (https://skills-bridge.ph): occupations, skills and competency standards.

Skills Bridge has no public API yet, so this client only knows how to make authenticated, cached GET
requests. Endpoint-specific methods belong here once the Skills Bridge team shares their API documentation.
"""
from typing import Any

import httpx
from sqlmodel import Session

from tesda_track.config import Settings
from tesda_track.services import cache

NOT_CONFIGURED = "Set SKILLS_BRIDGE_BASE_URL and SKILLS_BRIDGE_API_TOKEN once API access is granted."


class SkillsBridgeNotConfigured(Exception):
    pass


class SkillsBridgeUnavailable(Exception):
    pass


def is_configured(settings: Settings) -> bool:
    token = settings.skills_bridge_api_token.get_secret_value() if settings.skills_bridge_api_token else ""
    return bool(settings.skills_bridge_base_url and token)


class SkillsBridgeClient:
    def __init__(self, session: Session, settings: Settings, transport: httpx.BaseTransport | None = None):
        self._session = session
        self._settings = settings
        self._transport = transport

    def get_json(self, path: str, params: dict[str, str] | None = None) -> Any:
        """GET a JSON resource, cached for skills_bridge_cache_ttl_seconds. Failures are never cached."""
        if not is_configured(self._settings):
            raise SkillsBridgeNotConfigured(NOT_CONFIGURED)
        key = "skills_bridge:" + path + ("?" + "&".join(f"{k}={v}" for k, v in sorted(params.items())) if params else "")
        return cache.get_or_set(self._session, key[:255], self._settings.skills_bridge_cache_ttl_seconds,
                                lambda: self._fetch(path, params))

    def _fetch(self, path: str, params: dict[str, str] | None) -> Any:
        headers = {"Authorization": f"Bearer {self._settings.skills_bridge_api_token.get_secret_value()}",
                   "Accept": "application/json"}
        try:
            with httpx.Client(base_url=self._settings.skills_bridge_base_url, headers=headers,
                              timeout=self._settings.skills_bridge_timeout_seconds, transport=self._transport) as http:
                response = http.get(path, params=params)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise SkillsBridgeUnavailable(f"Skills Bridge request failed: {type(error).__name__}") from error
