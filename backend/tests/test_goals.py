def create_goal(client, headers, **body):
    response = client.post("/api/v1/me/goals", headers=headers, json={"title": "Become a welder", **body})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_goal_with_target_qualification(client, learner):
    goal = create_goal(client, learner, target_qualification_code="SMAW-NC-II", target_date="2027-06-30")
    assert goal["status"] == "active" and goal["target_date"] == "2027-06-30"
    assert goal["target_qualification"] == {"code": "SMAW-NC-II", "name": "Shielded Metal Arc Welding (SMAW) NC II",
                                            "sector": "Metals and Engineering"}


def test_goal_with_unknown_qualification_is_rejected(client, learner):
    response = client.post("/api/v1/me/goals", headers=learner,
                           json={"title": "Fly", "target_qualification_code": "ASTRONAUT-NC-IV"})
    assert response.status_code == 422
    assert response.json() == {"detail": "Qualification 'ASTRONAUT-NC-IV' was not found."}


def test_goals_are_listed_newest_first_and_only_for_their_owner(client, learner, other_learner):
    create_goal(client, learner, title="First")
    create_goal(client, learner, title="Second")
    create_goal(client, other_learner, title="Not mine")
    assert [g["title"] for g in client.get("/api/v1/me/goals", headers=learner).json()] == ["Second", "First"]


def test_update_goal_status_and_clear_target(client, learner):
    goal = create_goal(client, learner, target_qualification_code="SMAW-NC-II")
    response = client.patch(f"/api/v1/me/goals/{goal['id']}", headers=learner,
                            json={"status": "achieved", "target_qualification_code": None})
    assert response.status_code == 200
    assert response.json()["status"] == "achieved" and response.json()["target_qualification"] is None


def test_partial_update_leaves_other_fields_alone(client, learner):
    goal = create_goal(client, learner, target_qualification_code="SMAW-NC-II")
    response = client.patch(f"/api/v1/me/goals/{goal['id']}", headers=learner, json={"title": "Weld ships"})
    assert response.json()["title"] == "Weld ships"
    assert response.json()["target_qualification"]["code"] == "SMAW-NC-II"


def test_invalid_goal_status_is_rejected(client, learner):
    goal = create_goal(client, learner)
    assert client.patch(f"/api/v1/me/goals/{goal['id']}", headers=learner,
                        json={"status": "abandoned"}).status_code == 422


def test_other_learners_goals_are_invisible(client, learner, other_learner):
    goal = create_goal(client, other_learner)
    path = f"/api/v1/me/goals/{goal['id']}"
    assert client.get(path, headers=learner).status_code == 404
    assert client.patch(path, headers=learner, json={"title": "Mine now"}).status_code == 404
    assert client.delete(path, headers=learner).status_code == 404
    assert client.get(path, headers=other_learner).json()["title"] == "Become a welder"


def test_delete_goal(client, learner):
    goal = create_goal(client, learner)
    assert client.delete(f"/api/v1/me/goals/{goal['id']}", headers=learner).status_code == 204
    assert client.get(f"/api/v1/me/goals/{goal['id']}", headers=learner).status_code == 404


def test_goals_require_authentication(client):
    assert client.get("/api/v1/me/goals").status_code == 401
