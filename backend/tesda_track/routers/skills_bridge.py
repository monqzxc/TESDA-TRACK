import hashlib
import json
import math
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlmodel import Session

from tesda_track.config import Settings, get_settings
from tesda_track.db import SessionDep
from tesda_track.schemas.skills_bridge import SkillsBridgeMatchRequest, SkillsBridgeOccupationSearchRequest
from tesda_track.services import cache
from tesda_track.services.rate_limit import RateLimiter
from tesda_track.services.skills_bridge_mcp import SkillsBridgeMCPClient, SkillsBridgeMCPError

router = APIRouter(prefix="/skills-bridge", tags=["skills bridge"])
SettingsDep = Annotated[Settings, Depends(get_settings)]

CLIENT_LIMITED = "You've made many Skills Bridge lookups in the last minute. Please wait a moment and try again."
UPSTREAM_BUSY = "Skills Bridge is busy right now. Please try again in a minute."


class BridgeLimits:
    """Lookups per client address, and uncached lookups sent to Skills Bridge by all clients together.

    One instance per app (see tesda_track.main). Behind Caddy the client address comes from X-Forwarded-For;
    the Streamlit app forwards the learner's address the same way.
    """

    def __init__(self):
        self.clients = RateLimiter()
        self.upstream = RateLimiter(max_keys=1)


class ResponseCache:
    """Skills Bridge responses in the PostgreSQL cache. Keys are hashes, so search terms never appear in them."""

    def __init__(self, session: Session, ttl_seconds: int):
        self._session = session
        self._ttl = ttl_seconds

    def get(self, key: str) -> Any | None:
        return cache.get(self._session, key) if self._ttl else None

    def put(self, key: str, value: Any) -> None:
        if self._ttl:
            cache.put(self._session, key, value, self._ttl)
            self._session.commit()


def bridge_client(settings: SettingsDep):
    return SkillsBridgeMCPClient(settings)


def bridge_cache(session: SessionDep, settings: SettingsDep) -> ResponseCache:
    return ResponseCache(session, settings.skills_bridge_cache_ttl_seconds)


def _wait(seconds: float, detail: str) -> None:
    if seconds:
        raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(math.ceil(seconds))})


class Lookup:
    """Runs one Skills Bridge lookup within the limits, from the cache when possible.

    Called from the endpoints rather than run as a dependency, so requests that fail validation don't count.
    """

    def __init__(self, request: Request, settings: SettingsDep,
                 client: Annotated[SkillsBridgeMCPClient, Depends(bridge_client)],
                 response_cache: Annotated[ResponseCache, Depends(bridge_cache)]):
        self.request, self.settings, self.client, self.cache = request, settings, client, response_cache

    def __call__(self, operation: str, **arguments) -> dict:
        limits: BridgeLimits = self.request.app.state.skills_bridge_limits
        address = self.request.client.host if self.request.client else "unknown"
        _wait(limits.clients.hit(address, self.settings.skills_bridge_rate_limit_per_minute), CLIENT_LIMITED)
        key = "sbmcp:" + hashlib.sha256(json.dumps([operation, arguments], sort_keys=True).encode()).hexdigest()
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        _wait(limits.upstream.hit("all", self.settings.skills_bridge_upstream_per_minute), UPSTREAM_BUSY)
        try:
            with self.client:
                data = getattr(self.client, operation)(**arguments)
        except SkillsBridgeMCPError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        response = {"source": "Skills Bridge", "source_url": "https://skills-bridge.ph",
                    "retrieved_at": datetime.now(timezone.utc).isoformat(), "data": data}
        if not data.get("warnings"):  # A partly failed lookup is retried next time.
            self.cache.put(key, response)
        return response


LookupDep = Annotated[Lookup, Depends()]


@router.post("/matches")
def match_skills(body: SkillsBridgeMatchRequest, lookup: LookupDep):
    """Read external matches for explicitly supplied skill terms. Only the terms are sent; responses are cached
    without any record of who asked."""
    return lookup("match_skills", skills=body.skills, limit=body.limit)


@router.post("/occupations/search")
def search_occupations(body: SkillsBridgeOccupationSearchRequest, lookup: LookupDep):
    """Find occupations by title; capability terms continue through ``/matches``."""
    return lookup("search_occupations", occupations=body.occupations, limit=body.limit)


@router.get("/occupations/{occupation_id}")
def occupation_details(occupation_id: Annotated[int, Path(ge=1, le=2_147_483_647)], lookup: LookupDep):
    """Qualifications, a bounded skills preview, and existing benchmark mappings for a public occupation id."""
    return lookup("occupation", occupation_id=occupation_id)
