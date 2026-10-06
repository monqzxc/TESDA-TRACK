from datetime import timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import CacheEntry, utcnow
from tesda_track.services import cache
from tesda_track.services.skills_bridge import (SkillsBridgeClient, SkillsBridgeNotConfigured,
                                                SkillsBridgeUnavailable)


def test_cache_returns_values_until_they_expire(session):
    cache.put(session, "greeting", {"text": "kumusta"}, ttl_seconds=60)
    assert cache.get(session, "greeting") == {"text": "kumusta"}
    session.exec(select(CacheEntry).where(CacheEntry.key == "greeting")).one().expires_at = utcnow() - timedelta(seconds=1)
    session.flush()
    assert cache.get(session, "greeting") is None


def test_get_or_set_loads_once_while_fresh(session):
    calls = []

    def loader():
        calls.append(1)
        return [1, 2, 3]

    assert cache.get_or_set(session, "numbers", 60, loader) == [1, 2, 3]
    assert cache.get_or_set(session, "numbers", 60, loader) == [1, 2, 3]
    assert len(calls) == 1


def test_purge_removes_only_expired_entries(session):
    cache.put(session, "old", 1, ttl_seconds=60)
    cache.put(session, "new", 2, ttl_seconds=60)
    session.exec(select(CacheEntry).where(CacheEntry.key == "old")).one().expires_at = utcnow() - timedelta(seconds=1)
    session.flush()
    assert cache.purge_expired(session) == 1
    assert cache.get(session, "new") == 2


@pytest.fixture
def skills_bridge_settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "skills_bridge_base_url", "https://skills-bridge.example")
    monkeypatch.setattr(settings, "skills_bridge_api_token", SecretStr("secret-token"))
    return settings


def test_client_refuses_to_run_without_configuration(session):
    with pytest.raises(SkillsBridgeNotConfigured):
        SkillsBridgeClient(session, get_settings()).get_json("/api/occupations")


def test_client_sends_the_token_and_caches_responses(session, skills_bridge_settings):
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"title": "Welder"}]})

    client = SkillsBridgeClient(session, skills_bridge_settings, transport=httpx.MockTransport(handler))
    assert client.get_json("/api/occupations", {"q": "weld"}) == {"data": [{"title": "Welder"}]}
    assert client.get_json("/api/occupations", {"q": "weld"}) == {"data": [{"title": "Welder"}]}
    assert len(requests) == 1
    assert requests[0].headers["authorization"] == "Bearer secret-token"
    assert str(requests[0].url) == "https://skills-bridge.example/api/occupations?q=weld"


@pytest.mark.parametrize("handler", [
    lambda request: httpx.Response(503),
    lambda request: (_ for _ in ()).throw(httpx.ConnectTimeout("timed out")),
])
def test_outages_raise_a_single_error_type_and_are_not_cached(session, skills_bridge_settings, handler):
    client = SkillsBridgeClient(session, skills_bridge_settings, transport=httpx.MockTransport(handler))
    with pytest.raises(SkillsBridgeUnavailable):
        client.get_json("/api/occupations")
    assert session.exec(select(CacheEntry)).all() == []


def test_admin_sees_integration_status(client, admin, learner):
    assert client.get("/api/v1/admin/integrations", headers=learner).status_code == 403
    status = client.get("/api/v1/admin/integrations", headers=admin).json()
    assert status["semantic_search"]["enabled"] is False
    assert status["semantic_search"]["qualifications_total"] == 5
    assert status["skills_bridge"] == {"configured": False, "detail": "Set SKILLS_BRIDGE_BASE_URL and "
                                                                       "SKILLS_BRIDGE_API_TOKEN once API access is granted."}


def test_admin_status_counts_embedded_records(client, admin, semantic):
    status = client.get("/api/v1/admin/integrations", headers=admin).json()["semantic_search"]
    assert status["enabled"] is True and status["model"] == "test-bag-of-words"
    assert status["qualifications_embedded"] == 5


def test_admin_triggers_an_embedding_sync(client, admin, semantic, session):
    from tesda_track.models import Qualification

    css = session.exec(select(Qualification).where(Qualification.code == "CSS-NC-II")).one()
    css.name = "Computer Systems Servicing NC II (2026)"
    session.flush()
    response = client.post("/api/v1/admin/embeddings/sync", headers=admin)
    assert response.status_code == 200
    assert response.json()["updated"] == 1


def test_embedding_sync_needs_semantic_search(client, admin):
    assert client.post("/api/v1/admin/embeddings/sync", headers=admin).status_code == 409
