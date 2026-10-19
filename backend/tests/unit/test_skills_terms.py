"""Database-free checks of Skills Explorer's term extraction and lookups. Run with --confcutdir=backend/tests/unit."""
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tesda_track.config import Settings, get_settings
from tesda_track.routers.skills_bridge import BridgeLimits, bridge_cache, bridge_client, router
from tesda_track.services.skills_bridge_mcp import SkillsBridgeMCPError
from tesda_track.services.skills_terms import classify_terms, explore, extract_skill_terms

SENTENCE = "I want to be a welder and programmer, I know JavaScript and network configuration"
TERMS = ["welder", "programmer", "JavaScript", "network configuration"]


# Ported from frontend/tests/test_skills_bridge_ui.py, which keeps its copy until the Streamlit app is retired.
@pytest.mark.parametrize("text,expected", [
    ("I want to be a welder and programmer", ["welder", "programmer"]),
    ("I want to become a front-end web developer", ["front-end web developer"]),
    ("I have programming, cooking, and JavaScript", ["programming", "cooking", "JavaScript"]),
    ("network configuration; Python", ["network configuration", "Python"]),
    ("Skills: welding\nblueprint reading.", ["welding", "blueprint reading"]),
    ("welding, welding, Welding", ["welding", "Welding"]),
    (SENTENCE, TERMS),
    ("", []), (" , ;\n?!", []),
])
def test_natural_language_skill_terms_are_extracted(text, expected):
    assert extract_skill_terms(text) == expected


def test_job_titles_use_occupation_lookup_and_capabilities_use_skill_lookup():
    assert classify_terms(["welder", "programmer", "welding", "JavaScript"]) == (
        ["welder", "programmer"], ["welding", "JavaScript"])
    assert classify_terms(["Front-end Web Developer", "web development"]) == (
        ["Front-end Web Developer"], ["web development"])


TITLE_ANSWER = {"source": "Skills Bridge", "source_url": "https://skills-bridge.ph",
                "retrieved_at": "2026-10-07T01:00:00+00:00", "data": {
                    "unmatched": ["programmer"],
                    "resolution": [{"term": "welder", "matched_occupations": 1, "strength": "exact"},
                                   {"term": "programmer", "matched_occupations": 0, "strength": "unmatched"}],
                    "occupations": [{"occupation_id": 37, "title": "Welder", "sector": "Metals and Engineering",
                                     "score": 1.0, "terms_matched": ["welder"], "open_posts": 2}]}}
SKILL_ANSWER = {"source": "Skills Bridge", "source_url": "https://skills-bridge.ph",
                "retrieved_at": "2026-10-07T02:00:00+00:00", "data": {
                    "unmatched": ["programmer", "network configuration"],
                    "resolution": [{"term": "JavaScript", "matched_skills": 5, "strength": "strong"}],
                    "occupations": [{"occupation_id": 37, "title": "Welder", "score": 0.5},
                                    {"occupation_id": 133, "title": "Front-end Web Developer", "score": 0.5,
                                     "terms_matched": ["JavaScript"]},
                                    {"title": "A record without an id"}],
                    "qualifications": [{"code": "INF-NC3-0004", "title": "Web Development", "level_label": "NC III",
                                        "status": "promulgated", "skill_share": 0.1, "terms_matched": ["JavaScript"],
                                        "evidence": [{"term": "JavaScript", "skills": ["DOM manipulation"]}]}]}}


class FakeLookup:
    def __init__(self):
        self.calls = []

    def __call__(self, operation, **arguments):
        self.calls.append((operation, arguments))
        return {"search_occupations": TITLE_ANSWER, "match_skills": SKILL_ANSWER}[operation]


def test_title_and_skill_matches_are_combined_title_matches_first():
    lookup = FakeLookup()
    result = explore(SENTENCE, lookup)
    assert lookup.calls == [("search_occupations", {"occupations": ["welder", "programmer"], "limit": 6}),
                            ("match_skills", {"skills": ["JavaScript", "network configuration"], "limit": 6})]
    assert result.searched and result.reason is None
    assert result.terms == TERMS
    assert (result.occupation_terms, result.skill_terms) == (["welder", "programmer"],
                                                             ["JavaScript", "network configuration"])
    # Welder came back from both lookups and keeps its title match; the record without an id is skipped.
    assert [(item.occupation_id, item.match_kind) for item in result.occupations] == [(37, "occupation"),
                                                                                      (133, "skill")]
    assert result.unmatched == ["programmer", "network configuration"]
    assert [item.term for item in result.resolution] == ["welder", "programmer", "JavaScript"]
    assert result.qualifications[0].evidence[0].skills == ["DOM manipulation"]
    assert result.retrieved_at == "2026-10-07T01:00:00+00:00"


def test_only_the_lookup_that_has_terms_runs():
    lookup = FakeLookup()
    result = explore("I want to be a welder", lookup)
    assert lookup.calls == [("search_occupations", {"occupations": ["welder"], "limit": 6})]
    assert result.qualifications == [] and result.skill_terms == []
    lookup = FakeLookup()
    result = explore("JavaScript, javascript", lookup)
    # Repeats differing only in case are sent once, as /matches would, so both share cached answers.
    assert lookup.calls == [("match_skills", {"skills": ["JavaScript"], "limit": 6})]
    assert result.terms == ["JavaScript", "javascript"]
    assert result.retrieved_at == "2026-10-07T02:00:00+00:00"


@pytest.mark.parametrize("text,reason", [
    (", ;", "no_terms"),
    ("?!", "no_terms"),
    (",".join(f"skill{i}" for i in range(26)), "too_many_terms"),
    (",".join(f"cook{i} cook" for i in range(11)), "too_many_terms"),
    ("x" * 81, "term_too_long"),
])
def test_unusable_terms_stay_local(text, reason):
    lookup = FakeLookup()
    result = explore(text, lookup)
    assert not result.searched and result.reason == reason
    assert result.occupations == [] and result.retrieved_at is None
    assert lookup.calls == []


# The endpoint, with a fake Skills Bridge client and an in-memory cache.

class FakeClient:
    def __init__(self):
        self.calls = []
        self.fail = False

    def __enter__(self):
        if self.fail:
            raise SkillsBridgeMCPError("Skills Bridge is currently disabled. Your TESDA Track pathways are still available.")
        return self

    def __exit__(self, *_):
        pass

    def match_skills(self, skills, limit):
        self.calls.append(("match_skills", skills, limit))
        return SKILL_ANSWER["data"]

    def search_occupations(self, occupations, limit):
        self.calls.append(("search_occupations", occupations, limit))
        return TITLE_ANSWER["data"]


class DictCache:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def put(self, key, value):
        self.values[key] = value


def make_api(**overrides):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.state.skills_bridge_limits = BridgeLimits()
    fake, response_cache = FakeClient(), DictCache()
    test_settings = Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                             skills_bridge_mcp_url="https://bridge.example.test/mcp", **overrides)
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[bridge_client] = lambda: fake
    app.dependency_overrides[bridge_cache] = lambda: response_cache
    return app, fake, response_cache


def test_only_extracted_terms_reach_skills_bridge(caplog):
    app, fake, response_cache = make_api()
    caplog.set_level(logging.DEBUG)
    with TestClient(app) as client:
        response = client.post("/api/v1/skills-bridge/explore", json={"text": f"  {SENTENCE}  "})
    assert response.status_code == 200
    body = response.json()
    assert body["terms"] == TERMS and body["searched"] is True
    assert [item["occupation_id"] for item in body["occupations"]] == [37, 133]
    sent = [term for call in fake.calls for term in call[1]]
    assert sorted(sent) == sorted(TERMS)
    assert fake.calls == [("search_occupations", ["welder", "programmer"], 6),
                          ("match_skills", ["JavaScript", "network configuration"], 6)]
    # The sentence is not a cache key, stored in the cache, or logged.
    assert len(response_cache.values) == 2
    for key, value in response_cache.values.items():
        assert key.startswith("sbmcp:") and "welder" not in key
        assert "want to be" not in str(value)
    assert "want to be" not in caplog.text


def test_explore_shares_cached_answers_with_the_lookup_endpoints():
    app, fake, _ = make_api()
    with TestClient(app) as client:
        assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["JavaScript"]}).status_code == 200
        assert client.post("/api/v1/skills-bridge/explore", json={"text": "I have JavaScript"}).status_code == 200
    assert fake.calls == [("match_skills", ["JavaScript"], 6)]


def test_text_without_terms_returns_a_reason_and_skips_skills_bridge():
    app, fake, _ = make_api(skills_bridge_rate_limit_per_minute=1)
    with TestClient(app) as client:
        response = client.post("/api/v1/skills-bridge/explore", json={"text": " ... "})
        assert response.status_code == 200
        assert response.json()["searched"] is False and response.json()["reason"] == "no_terms"
        assert response.json()["terms"] == [] and response.json()["occupations"] == []
        # Nothing was looked up, so the limit is untouched.
        assert client.post("/api/v1/skills-bridge/explore", json={"text": "welding"}).status_code == 200
    assert fake.calls == [("match_skills", ["welding"], 6)]


@pytest.mark.parametrize("body", [{"text": ""}, {"text": "   "}, {"text": "x" * 501}, {}, {"text": "welding", "limit": 3}])
def test_invalid_explore_requests_never_reach_provider(body):
    app, fake, _ = make_api()
    with TestClient(app) as client:
        assert client.post("/api/v1/skills-bridge/explore", json=body).status_code == 422
    assert fake.calls == []


def test_text_of_500_characters_after_trimming_is_accepted():
    app, _, _ = make_api()
    with TestClient(app) as client:
        assert client.post("/api/v1/skills-bridge/explore", json={"text": "  " + "a" * 500 + "  "}).status_code == 200


def test_explore_reports_a_disabled_or_unreachable_skills_bridge_like_the_other_endpoints():
    app, fake, _ = make_api()
    fake.fail = True
    with TestClient(app) as client:
        response = client.post("/api/v1/skills-bridge/explore", json={"text": "welding"})
    assert response.status_code == 503
    assert response.json()["detail"].startswith("Skills Bridge is currently disabled")


def test_each_lookup_counts_against_the_client_limit():
    app, fake, _ = make_api(skills_bridge_rate_limit_per_minute=3)
    with TestClient(app, client=("203.0.113.5", 50000)) as client:
        # A title and a skill: two lookups, as the Streamlit app makes two calls.
        assert client.post("/api/v1/skills-bridge/explore", json={"text": "welder, welding"}).status_code == 200
        assert client.post("/api/v1/skills-bridge/explore", json={"text": "cooking"}).status_code == 200
        response = client.post("/api/v1/skills-bridge/explore", json={"text": "baking"})
    assert response.status_code == 429
    assert "minute" in response.json()["detail"]
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    assert [call[1] for call in fake.calls] == [["welder"], ["welding"], ["cooking"]]


def test_overall_provider_budget_applies_per_uncached_lookup():
    app, fake, _ = make_api(skills_bridge_upstream_per_minute=1)
    with TestClient(app) as client:
        busy = client.post("/api/v1/skills-bridge/explore", json={"text": "welder, welding"})
    assert busy.status_code == 429
    assert "Skills Bridge" in busy.json()["detail"] and "Retry-After" in busy.headers
    assert fake.calls == [("search_occupations", ["welder"], 6)]
