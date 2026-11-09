"""Skill and job search: a list of skills or job titles, each term matched on its own and never adding up."""
import pytest
from sqlmodel import select

from tesda_track.models import RecommendationFeedback

MATCHES = "/api/v1/analysis/matches"
# A list carries no goal sentence to read a profile from: the finder sends what the goal analysis gave.
PROFILE = {"career_goal": None, "possible_sector": None, "existing_skills": [], "experience_years": None,
           "has_certification": None, "intent": "unknown"}


def search(client, text, mode="skills"):
    response = client.post(MATCHES, json={"query": text, "profile": PROFILE, "mode": mode})
    assert response.status_code == 200, response.text
    return response.json()


def codes(body):
    return [m["qualification"]["code"] for m in body["matches"]]


def score_of(body, code):
    return next(m["score"] for m in body["matches"] if m["qualification"]["code"] == code)


@pytest.fixture(params=["keywords", "semantic"])
def matching(request):
    """Every rule holds with the keyword rules alone and with the (test) model."""
    if request.param == "semantic":
        request.getfixturevalue("semantic")
    return request.param


def test_a_single_skill_finds_its_qualification(client, matching):
    body = search(client, "welding")

    assert codes(body)[0] == "SMAW-NC-II"
    assert body["search"] == {"terms": ["welding"], "unmatched": []}
    assert body["matches"][0]["reason"] == "Matched your skill or job: welding"


def test_several_skills_for_one_trade_say_how_many_matched(client, matching):
    body = search(client, "welding, metal fabrication")

    assert codes(body)[0] == "SMAW-NC-II"
    assert body["search"]["terms"] == ["welding", "metal fabrication"]
    assert body["matches"][0]["reason"] == "Matched 2 of your 2 skills or jobs: welding, metal fabrication"


@pytest.mark.parametrize("job, code", [("electrician", "EIM-NC-II"), ("cook", "COOKERY-NC-II"),
                                       ("waiter", "FBS-NC-II"), ("computer technician", "CSS-NC-II")])
def test_a_job_title_finds_the_qualification_a_goal_would(client, matching, job, code):
    goal = client.post(MATCHES, json={"query": f"I want to be a {job}.", "profile": PROFILE}).json()

    assert codes(search(client, job))[0] == code == codes(goal)[0]


def test_skills_from_two_trades_show_both(client, matching):
    found = codes(search(client, "cooking, wiring"))

    assert {"COOKERY-NC-II", "EIM-NC-II"} <= set(found)


def test_more_terms_for_the_same_qualification_never_raise_its_score(client, matching):
    singles = [score_of(search(client, term), "SMAW-NC-II") for term in ("welding", "welder", "fabricator")]
    together = search(client, "welding, welder, fabricator")

    assert score_of(together, "SMAW-NC-II") <= max(singles)
    assert codes(together)[0] == "SMAW-NC-II"


def test_an_unrelated_term_neither_lifts_nor_hides_the_match(client, matching):
    alone = search(client, "welding")
    mixed = search(client, "welding, basketball")

    assert codes(mixed)[0] == "SMAW-NC-II"
    assert score_of(mixed, "SMAW-NC-II") == score_of(alone, "SMAW-NC-II")
    assert mixed["matches"][0]["reason"] == "Matched 1 of your 2 skills or jobs: welding"


IRRELEVANT = ["I want to be rich", "asdfgh", "Facebook", "basketball", "astronaut"]


@pytest.mark.parametrize("text", IRRELEVANT)
def test_words_naming_no_trade_match_nothing(client, text):
    assert search(client, text)["matches"] == []


@pytest.mark.parametrize("text", IRRELEVANT)
def test_with_the_model_irrelevant_words_match_no_more_than_as_a_goal(client, semantic, text):
    # The test model is a hashed bag of words over five qualifications, so a stray word can land on one; the real
    # model's rate is measured by evaluation/skill_search.py. Here: a list is never looser than a goal.
    goal = client.post(MATCHES, json={"query": text, "profile": PROFILE}).json()

    assert set(codes(search(client, text))) <= set(codes(goal))


def test_careers_tesda_does_not_train_for_are_listed_as_unused(client):
    body = search(client, "doctor, welding")

    assert body["search"] == {"terms": ["welding"], "unmatched": ["doctor"]}
    assert codes(body)[0] == "SMAW-NC-II"


def test_text_with_no_skill_or_job_in_it_matches_nothing(client):
    body = search(client, "and the")

    assert body == {"profile": body["profile"], "matches": [], "search": {"terms": [], "unmatched": []}}


def test_up_to_five_qualifications_are_shown(client):
    body = search(client, "welding, computer, wiring, cooking, waiter, restaurant")

    assert len(body["matches"]) == 5


def test_a_goal_request_is_unchanged_without_a_mode(client):
    goal = "I want to be a welder."
    without = client.post(MATCHES, json={"query": goal, "profile": PROFILE}).json()
    explicit = search(client, goal, mode="goal")

    assert without == explicit
    assert "search" not in without
    assert len(without["matches"]) <= 3


def test_an_unknown_mode_is_refused(client):
    response = client.post(MATCHES, json={"query": "welding", "profile": PROFILE, "mode": "jobs"})

    assert response.status_code == 422


def test_feedback_re_scores_the_skills_search_and_keeps_its_mode(client, session, competency_ids):
    ids = competency_ids("SMAW-NC-II")
    response = client.post("/api/v1/feedback/recommendations", json={
        "query": "welding, metal fabrication", "profile": PROFILE, "qualification_code": "SMAW-NC-II",
        "answers": {str(i): "confident" for i in ids}, "satisfied": True, "mode": "skills"})
    assert response.status_code == 201, response.text

    [row] = session.exec(select(RecommendationFeedback)).all()
    assert (row.search_mode, row.rank) == ("skills", 1)
    assert row.score == score_of(search(client, "welding, metal fabrication"), "SMAW-NC-II")


def test_goal_feedback_is_recorded_as_a_goal_search(client, session, competency_ids):
    ids = competency_ids("SMAW-NC-II")
    client.post("/api/v1/feedback/recommendations", json={
        "query": "I want to be a welder.", "profile": PROFILE, "qualification_code": "SMAW-NC-II",
        "answers": {str(i): "confident" for i in ids}, "satisfied": True})

    [row] = session.exec(select(RecommendationFeedback)).all()
    assert row.search_mode == "goal"


def test_the_report_matches_the_skills_search_the_learner_saw(client):
    response = client.post("/api/v1/recommendations/report", json={
        "query": "welding, metal fabrication", "profile": PROFILE, "qualification_code": "SMAW-NC-II",
        "mode": "skills"})
    assert response.status_code == 200, response.text

    match = response.json()["match"]
    assert (match["strength"], match["rank"]) == ("named", 1)
    assert match["score"] == score_of(search(client, "welding, metal fabrication"), "SMAW-NC-II")
