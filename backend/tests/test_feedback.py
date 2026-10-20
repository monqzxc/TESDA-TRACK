"""Feedback on a recommendation: the answer kept with the numbers behind it, never the goal's words or the account."""
import uuid
from datetime import timedelta

import pytest
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import RecommendationFeedback, utcnow
from tesda_track.services.ranking import goal_fingerprint

GOAL = "I want to be a welder."
PATH = "/api/v1/feedback/recommendations"


@pytest.fixture
def welder(client, competency_ids):
    """What the finder sends for the welder goal, with half of SMAW's skills rated confident."""
    profile = client.post("/api/v1/analysis/goal", json={"query": GOAL}).json()["profile"]
    ids = competency_ids("SMAW-NC-II")
    answers = {str(i): "confident" if n < len(ids) // 2 else "not_familiar" for n, i in enumerate(ids)}

    def body(**changes):
        return {"query": GOAL, "profile": profile, "qualification_code": "SMAW-NC-II", "answers": answers,
                "satisfied": True, **changes}
    return body


def give(client, body, **kwargs):
    response = client.post(PATH, json=body, **kwargs)
    assert response.status_code == 201, response.text
    return response.json()


def rows(session):
    return session.exec(select(RecommendationFeedback)).all()


def test_a_guest_answer_is_kept_with_what_matching_and_readiness_gave(client, session, welder):
    body = welder()
    answer = give(client, body)

    assert answer == {"id": answer["id"], "satisfied": True, "reason": None}
    matches = client.post("/api/v1/analysis/matches", json={"query": GOAL, "profile": body["profile"]}).json()
    readiness = client.post("/api/v1/analysis/readiness",
                            json={"qualification_code": "SMAW-NC-II", "answers": body["answers"]}).json()
    [row] = rows(session)
    assert matches["matches"][0]["qualification"]["code"] == "SMAW-NC-II"
    assert (row.satisfied, row.signed_in, row.rank, row.score, row.match_count) == (
        True, False, 1, matches["matches"][0]["score"], len(matches["matches"]))
    assert (row.intent, row.experience_years, row.has_certification) == (
        matches["profile"]["intent"], None, None)
    assert row.keyword > 0
    assert (row.readiness_score, row.readiness_level) == (readiness["score"], readiness["level"])
    assert (row.z_score, row.model, row.params) == (None, None, None), "semantic search is off in tests"


def test_the_goal_is_kept_only_as_a_keyed_hash(client, session, welder):
    give(client, welder())

    [row] = rows(session)
    assert row.query_hash == goal_fingerprint(GOAL, get_settings().secret_key.get_secret_value())
    assert "welder" not in repr(row.model_dump()).lower()


def test_with_the_model_the_answer_keeps_the_z_score_model_and_parameters(client, session, semantic, welder):
    give(client, welder())

    [row] = rows(session)
    assert row.model == "test-bag-of-words"
    assert row.z_score > 0
    assert row.params == {"z_floor": 0.0, "z_ceiling": 1.0, "keyword_weight": 0.5, "min_score": 20}


def test_a_qualification_picked_from_the_library_has_no_place_among_the_matches(client, session, competency_ids,
                                                                                welder):
    answers = {str(i): "confident" for i in competency_ids("COOKERY-NC-II")}
    give(client, welder(qualification_code="COOKERY-NC-II", answers=answers, satisfied=False))

    [row] = rows(session)
    assert (row.rank, row.score, row.keyword) == (None, None, 0.0)
    assert row.match_count > 0


def test_a_signed_in_answer_says_so_without_naming_the_learner(client, session, learner, welder):
    give(client, welder(), headers=learner)

    [row] = rows(session)
    assert row.signed_in is True
    assert not any("learner" in column for column in RecommendationFeedback.model_fields)


def test_after_no_a_reason_can_follow(client, session, welder):
    answer = give(client, welder(satisfied=False))

    response = client.patch(f"{PATH}/{answer['id']}", json={"reason": "readiness_off"})

    assert response.status_code == 200, response.text
    assert response.json() == {"id": answer["id"], "satisfied": False, "reason": "readiness_off"}
    assert rows(session)[0].reason == "readiness_off"


def test_a_yes_takes_no_reason(client, welder):
    answer = give(client, welder())
    assert client.patch(f"{PATH}/{answer['id']}", json={"reason": "readiness_off"}).status_code == 409


def test_reasons_are_fixed_and_the_answer_must_exist(client, welder):
    answer = give(client, welder(satisfied=False))
    assert client.patch(f"{PATH}/{answer['id']}", json={"reason": "other"}).status_code == 422
    assert client.patch(f"{PATH}/{uuid.uuid4()}", json={"reason": "readiness_off"}).status_code == 404


def test_an_answer_needs_a_known_qualification_and_a_complete_check(client, session, welder):
    assert client.post(PATH, json=welder(qualification_code="NOPE")).status_code == 404
    assert client.post(PATH, json=welder(answers={})).status_code == 422
    assert rows(session) == []


def test_answers_count_against_the_client_limit(client, welder, monkeypatch):
    monkeypatch.setattr(get_settings(), "feedback_rate_limit_per_minute", 1)
    give(client, welder(satisfied=False))

    response = client.post(PATH, json=welder())

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60


def test_the_report_counts_answers_by_place_reason_model_and_qualification(client, admin, competency_ids, welder):
    give(client, welder())
    unsure = give(client, welder(satisfied=False))
    client.patch(f"{PATH}/{unsure['id']}", json={"reason": "wrong_qualification"})
    give(client, welder(qualification_code="COOKERY-NC-II", satisfied=False,
                        answers={str(i): "confident" for i in competency_ids("COOKERY-NC-II")}))

    response = client.get("/api/v1/admin/reports/feedback", headers=admin)

    assert response.status_code == 200, response.text
    report = response.json()
    assert (report["answers"], report["satisfied"]) == (3, 1)
    assert report["by_place"] == {"top_match": {"answers": 2, "satisfied": 1},
                                  "other_match": {"answers": 0, "satisfied": 0},
                                  "own_choice": {"answers": 1, "satisfied": 0}}
    assert report["reasons"] == {"wrong_qualification": 1, "readiness_off": 0, "pathway_not_helpful": 0, "none": 1}
    assert report["by_model"] == [{"model": None, "answers": 3, "satisfied": 1}]
    assert [(row["qualification"]["code"], row["answers"], row["satisfied"])
            for row in report["by_qualification"]] == [("SMAW-NC-II", 2, 1), ("COOKERY-NC-II", 1, 0)]


def test_the_report_counts_only_the_period(client, admin, welder):
    give(client, welder())
    before = (utcnow() - timedelta(days=2)).date().isoformat()

    report = client.get("/api/v1/admin/reports/feedback", headers=admin, params={"date_to": before}).json()

    assert (report["answers"], report["by_model"], report["by_qualification"]) == (0, [], [])
