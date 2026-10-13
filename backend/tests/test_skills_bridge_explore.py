"""Skills Explorer in one request, through the full app and the PostgreSQL cache. Skills Bridge itself is faked."""
from datetime import timedelta

import pytest
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import CacheEntry, utcnow
from tesda_track.routers.skills_bridge import bridge_client
from tesda_track.services.skills_bridge_mcp import SkillsBridgeMCPError

SENTENCE = "I want to be a welder, I know blueprint reading and welding."


class Bridge:
    """Stands in for SkillsBridgeMCPClient and records every argument it is given."""

    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def __call__(self):  # Used as the dependency: every request gets this same instance.
        return self

    def __enter__(self):
        if self.fail:
            raise SkillsBridgeMCPError("Skills Bridge is unavailable right now. Please try again shortly.")
        return self

    def __exit__(self, *_):
        pass

    def search_occupations(self, occupations, limit):
        self.calls.append(("search_occupations", {"occupations": occupations, "limit": limit}))
        return {"unmatched": [], "resolution": [{"term": "welder", "matched_occupations": 1, "strength": "exact"}],
                "occupations": [{"occupation_id": 37, "title": "Welder", "sector": "Metals and Engineering",
                                 "score": 1.0, "terms_matched": ["welder"], "open_posts": 2}]}

    def match_skills(self, skills, limit):
        self.calls.append(("match_skills", {"skills": skills, "limit": limit}))
        return {"unmatched": ["welding"], "resolution": [{"term": "blueprint reading", "matched_skills": 8,
                                                     "strength": "strong"}],
                "occupations": [{"occupation_id": 37, "title": "Welder", "score": 0.5},
                                {"occupation_id": 760, "title": "Ice Plant Refrigeration Technician", "score": 0.5,
                                 "terms_matched": ["blueprint reading"], "open_posts": 0}],
                "qualifications": [{"code": "HEA-NC3-0008", "title": "Ice Plant Refrigeration Servicing",
                                    "level_label": "NC III", "status": "promulgated", "skill_share": 0.022,
                                    "terms_matched": ["blueprint reading"]}]}


@pytest.fixture
def bridge(app, monkeypatch):
    monkeypatch.setattr(get_settings(), "skills_bridge_cache_ttl_seconds", 3600)
    fake = Bridge()
    app.dependency_overrides[bridge_client] = fake
    return fake


def test_explore_extracts_terms_and_combines_both_lookups(client, bridge):
    response = client.post("/api/v1/skills-bridge/explore", json={"text": SENTENCE})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["searched"] is True and body["reason"] is None
    assert body["terms"] == ["welder", "blueprint reading", "welding"]
    assert body["occupation_terms"] == ["welder"]
    assert [(item["occupation_id"], item["match_kind"]) for item in body["occupations"]] == [
        (37, "occupation"), (760, "skill")]
    assert body["qualifications"][0]["code"] == "HEA-NC3-0008"
    assert body["source"] == "Skills Bridge" and body["retrieved_at"].endswith("+00:00")


def test_only_the_extracted_terms_reach_skills_bridge(client, bridge):
    client.post("/api/v1/skills-bridge/explore", json={"text": SENTENCE})
    terms = client.post("/api/v1/skills-bridge/explore", json={"text": SENTENCE}).json()["terms"]
    # The second request is answered from the cache.
    assert bridge.calls == [("search_occupations", {"occupations": ["welder"], "limit": 6}),
                            ("match_skills", {"skills": ["blueprint reading", "welding"], "limit": 6})]
    sent = [term for _, arguments in bridge.calls for value in arguments.values() if isinstance(value, list)
            for term in value]
    assert sorted(sent) == sorted(terms)
    assert all(SENTENCE not in str(arguments) for _, arguments in bridge.calls)


def test_lookups_are_cached_in_postgres_without_the_text_or_terms_in_keys(client, bridge, session):
    assert client.post("/api/v1/skills-bridge/explore", json={"text": SENTENCE}).status_code == 200
    entries = session.exec(select(CacheEntry).where(CacheEntry.key.startswith("sbmcp:"))).all()
    assert len(entries) == 2
    for entry in entries:
        assert "welder" not in entry.key.lower() and "blueprint" not in entry.key.lower()
        assert SENTENCE not in str(entry.value)
        assert entry.expires_at > utcnow() + timedelta(minutes=59)


def test_text_without_terms_does_not_contact_skills_bridge(client, bridge):
    response = client.post("/api/v1/skills-bridge/explore", json={"text": "?!"})
    assert response.status_code == 200
    assert response.json()["searched"] is False and response.json()["reason"] == "no_terms"
    assert bridge.calls == []


@pytest.mark.parametrize("text", ["", "   ", "x" * 501], ids=["empty", "blank", "too-long"])
def test_text_outside_the_bounds_is_refused(client, bridge, text):
    assert client.post("/api/v1/skills-bridge/explore", json={"text": text}).status_code == 422
    assert bridge.calls == []


def test_an_unreachable_skills_bridge_returns_503(app, client):
    app.dependency_overrides[bridge_client] = Bridge(fail=True)
    response = client.post("/api/v1/skills-bridge/explore", json={"text": "welding"})
    assert response.status_code == 503
    assert "Skills Bridge" in response.json()["detail"]


def test_each_lookup_counts_against_the_client_limit(client, bridge, monkeypatch):
    monkeypatch.setattr(get_settings(), "skills_bridge_rate_limit_per_minute", 2)
    assert client.post("/api/v1/skills-bridge/explore", json={"text": "welder, welding"}).status_code == 200
    response = client.post("/api/v1/skills-bridge/explore", json={"text": "welding"})
    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60
