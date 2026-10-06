"""Training recommendations ranked by the configurable weighted score (defaults 50/20/15/10/5)."""
from datetime import date, timedelta

import pytest

from tesda_track.models import RankingAudit

CEBU_CITY = (10.3157, 123.8854)
QUEZON_CITY = (14.6760, 121.0437)  # about 10.7 km from the Manila default location
GOAL = "I have welded gates for 4 years"


def rank(client, headers=None, **body):
    response = client.post("/api/v1/recommendations/training", headers=headers,
                           json={"qualification_code": "SMAW-NC-II", **body})
    assert response.status_code == 200, response.text
    return response.json()


def soon(days):
    return (date.today() + timedelta(days=days)).isoformat()


def test_options_are_ranked_by_the_weighted_components(client, make_provider, make_program, make_schedule):
    cebu = make_provider(name="Cebu Skills Center", region_code="VII", location=CEBU_CITY)
    cebu_program = make_program(provider=cebu, title="Cebu batch")
    manila_program = make_program(title="Manila batch", start_date=soon(30))
    make_schedule()  # Manila assessment center, near the Manila provider only

    ranked = rank(client, goal=GOAL, near_lat=QUEZON_CITY[0], near_lon=QUEZON_CITY[1])
    assert ranked["weights"] == {"semantic": 0.5, "proximity": 0.2, "assessment": 0.15, "schedule": 0.1,
                                 "preference": 0.05}
    assert ranked["semantic_used"] is False
    first, second = ranked["results"]
    assert first["program"]["id"] == manila_program["id"] and second["program"]["id"] == cebu_program["id"]
    # Manila: semantic 1 (no model: every program of the qualification is relevant), proximity 1 - 10.7/100,
    # assessment 1, schedule 1 (starts within 60 days), no preference given.
    assert first["components"]["proximity"] == pytest.approx(0.893, abs=0.01)
    assert (first["components"]["assessment"], first["components"]["schedule"], first["components"]["preference"]) \
        == (1, 1, 0)
    assert first["score"] == 93
    # Cebu: about 570 km away, no assessment nearby, no start date (rolling intake counts half).
    assert second["components"] == {"semantic": 1, "proximity": 0, "assessment": 0, "schedule": 0.5, "preference": 0}
    assert second["score"] == 55
    assert any("km" in reason for reason in first["explanation"])


def test_stated_preferences_add_their_share(client, make_program):
    online = make_program(title="Online batch", delivery_mode="online", scholarship_available=True)
    classroom = make_program(title="Classroom batch")
    ranked = rank(client, preferred_delivery_mode="online", needs_scholarship=True)
    scores = {r["program"]["id"]: r for r in ranked["results"]}
    assert scores[online["id"]]["components"]["preference"] == 1
    assert scores[classroom["id"]]["components"]["preference"] == 0
    assert scores[online["id"]]["score"] - scores[classroom["id"]]["score"] == 5


def test_schedule_timing_is_scored_and_finished_programs_are_left_out(client, make_program):
    later = make_program(title="Starts in 4 months", start_date=soon(120))
    running = make_program(title="Already running", start_date=soon(-10), end_date=soon(30))
    make_program(title="Finished", start_date=soon(-90), end_date=soon(-1))
    components = {r["program"]["title"]: r["components"]["schedule"] for r in rank(client)["results"]}
    assert components == {"Starts in 4 months": 0.7, "Already running": 0.2}
    assert {later["title"], running["title"]} == set(components)


def test_semantic_similarity_separates_programs_of_the_same_qualification(client, semantic, make_program):
    pipes = make_program(title="Pipe welding", description="Pipe welding for shipbuilding yards")
    gates = make_program(title="Gate fabrication", description="Welding gates and grills for homes")
    ranked = rank(client, goal="I weld gates and grills")
    assert ranked["semantic_used"] is True
    order = [r["program"]["id"] for r in ranked["results"]]
    assert order == [gates["id"], pipes["id"]]
    assert ranked["results"][0]["components"]["semantic"] > ranked["results"][1]["components"]["semantic"]


def test_each_ranking_is_audited_without_storing_the_goal_text(client, session, learner, make_program):
    make_program()
    anonymous = rank(client, goal=GOAL, near_lat=QUEZON_CITY[0], near_lon=QUEZON_CITY[1])
    signed_in = rank(client, headers=learner, goal=GOAL)
    audit = session.get(RankingAudit, anonymous["audit_id"])
    assert audit.learner_id is None
    assert len(audit.query_hash) == 64 and GOAL not in str(audit.results) + str(audit.weights)
    assert (audit.near_lat, audit.near_lon) == (14.7, 121.0), "locations are kept only to about 10 km"
    assert audit.results[0]["components"]["assessment"] == 0
    assert session.get(RankingAudit, signed_in["audit_id"]).learner_id is not None


def test_deleting_an_account_anonymizes_its_audits(client, session, learner, make_program):
    make_program()
    audit_id = rank(client, headers=learner, goal=GOAL)["audit_id"]
    client.delete("/api/v1/me", headers=learner)
    session.expire_all()
    assert session.get(RankingAudit, audit_id).learner_id is None


def test_ranking_needs_a_known_qualification(client):
    response = client.post("/api/v1/recommendations/training", json={"qualification_code": "NOPE"})
    assert response.status_code == 404


def test_goal_hash_is_keyed_so_it_cannot_be_reversed_by_guessing(client, session, make_program):
    import hashlib

    make_program()
    audit = session.get(RankingAudit, rank(client, goal=GOAL)["audit_id"])
    plain = hashlib.sha256(GOAL.lower().encode()).hexdigest()
    assert audit.query_hash != plain, "an unkeyed hash of a short sentence can be reversed with a word list"
    again = session.get(RankingAudit, rank(client, goal=GOAL)["audit_id"])
    assert again.query_hash == audit.query_hash, "the same goal still hashes the same, for counting repeats"


def test_precise_locations_never_shape_stored_results(client, session, make_program):
    """Ranking from two points in the same ~10 km cell must store identical numbers (no trilateration)."""
    make_program()
    first = rank(client, near_lat=14.6760, near_lon=121.0437)
    second = rank(client, near_lat=14.7240, near_lon=120.9610)
    assert first["results"][0]["components"] == second["results"][0]["components"]
    assert first["results"][0]["program"]["distance_km"] == second["results"][0]["program"]["distance_km"]
    stored = [session.get(RankingAudit, r["audit_id"]).results for r in (first, second)]
    assert stored[0] == stored[1]


def test_learners_export_includes_their_rankings(client, learner, make_program):
    make_program()
    rank(client, headers=learner, goal=GOAL)
    export = client.get("/api/v1/me/export", headers=learner).json()
    assert [r["qualification_code"] for r in export["training_rankings"]] == ["SMAW-NC-II"]
    assert "query_hash" not in export["training_rankings"][0]
