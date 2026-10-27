def start(client, headers, query="I want to be a welder.", **body):
    response = client.post("/api/v1/me/recommendations", headers=headers, json={"query": query, **body})
    assert response.status_code == 201, response.text
    return response.json()


def test_starting_a_session_stores_analysis_and_matches(client, learner):
    session = start(client, learner)
    assert session["query"] == "I want to be a welder."
    assert session["analysis_source"] == "rules"
    assert session["profile"]["career_goal"] == "Welder" and session["profile"]["experience_years"] is None
    assert session["matches"][0]["qualification"]["code"] == "SMAW-NC-II"
    assert session["selected_qualification"] is None and session["pathway"] is None
    assert client.get(f"/api/v1/me/recommendations/{session['id']}", headers=learner).json() == session


def test_follow_up_answers_and_selection_refine_the_session(client, learner):
    session = start(client, learner)
    response = client.patch(f"/api/v1/me/recommendations/{session['id']}", headers=learner, json={
        "experience_years": 4, "has_certification": False, "qualification_code": "SMAW-NC-II"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["profile"]["intent"] == "assessment_recommendation"
    assert updated["selected_qualification"]["code"] == "SMAW-NC-II"
    assert updated["pathway"]["recommendation"] == "ASSESSMENT_READINESS"


def test_changing_answers_recomputes_from_the_original_analysis(client, learner):
    session = start(client, learner)
    path = f"/api/v1/me/recommendations/{session['id']}"
    client.patch(path, headers=learner, json={"experience_years": 0, "has_certification": False,
                                              "qualification_code": "SMAW-NC-II"})
    updated = client.patch(path, headers=learner, json={"experience_years": 5}).json()
    assert updated["profile"]["experience_years"] == 5
    assert updated["profile"]["has_certification"] is False
    assert updated["profile"]["intent"] == "assessment_recommendation"
    assert updated["pathway"]["recommendation"] == "ASSESSMENT_READINESS"


def test_unknown_qualification_selection_is_rejected(client, learner):
    session = start(client, learner)
    response = client.patch(f"/api/v1/me/recommendations/{session['id']}", headers=learner,
                            json={"qualification_code": "NOPE"})
    assert response.status_code == 422


def test_history_is_newest_first_and_paginated(client, learner, other_learner):
    for query in ("I want to be a welder.", "I want to become a chef", "I want to fix computers"):
        start(client, learner, query)
    start(client, other_learner, "I want to work as a waiter")
    history = client.get("/api/v1/me/recommendations", headers=learner).json()
    assert [s["query"] for s in history] == ["I want to fix computers", "I want to become a chef",
                                            "I want to be a welder."]
    page = client.get("/api/v1/me/recommendations?limit=1&offset=1", headers=learner).json()
    assert [s["query"] for s in page] == ["I want to become a chef"]


def test_sessions_can_be_linked_to_own_goals_only(client, learner, other_learner):
    my_goal = client.post("/api/v1/me/goals", headers=learner, json={"title": "Weld"}).json()
    their_goal = client.post("/api/v1/me/goals", headers=other_learner, json={"title": "Cook"}).json()
    assert start(client, learner, goal_id=my_goal["id"])["goal_id"] == my_goal["id"]
    response = client.post("/api/v1/me/recommendations", headers=learner,
                           json={"query": "I want to be a welder.", "goal_id": their_goal["id"]})
    assert response.status_code == 422


def test_other_learners_sessions_are_invisible_and_delete_works(client, learner, other_learner):
    session = start(client, other_learner)
    path = f"/api/v1/me/recommendations/{session['id']}"
    assert client.get(path, headers=learner).status_code == 404
    assert client.patch(path, headers=learner, json={"experience_years": 1}).status_code == 404
    assert client.delete(path, headers=learner).status_code == 404
    assert client.delete(path, headers=other_learner).status_code == 204
    assert client.get(path, headers=other_learner).status_code == 404
