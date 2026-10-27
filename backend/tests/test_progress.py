def test_progress_summarizes_a_learners_journey(client, admin, learner, other_learner, competency_ids,
                                               make_schedule):
    smaw_ids = competency_ids("SMAW-NC-II")
    for answer in ("not_familiar", "confident", "some_experience"):
        client.post("/api/v1/me/readiness-checks", headers=learner, json={
            "qualification_code": "SMAW-NC-II", "answers": {str(i): answer for i in smaw_ids}})
    client.post("/api/v1/me/readiness-checks", headers=other_learner, json={
        "qualification_code": "SMAW-NC-II", "answers": {str(i): "confident" for i in smaw_ids}})

    pathway = client.get("/api/v1/pathways", params={"qualification_code": "SMAW-NC-II",
                                                     "route": "ASSESSMENT_READINESS"}).json()[0]
    enrollment = client.post("/api/v1/me/pathways", headers=learner, json={"pathway_id": pathway["id"]}).json()
    client.patch(f"/api/v1/me/pathways/{enrollment['id']}/steps/{pathway['steps'][0]['id']}", headers=learner,
                 json={"status": "completed"})

    schedule = make_schedule()
    application = client.post("/api/v1/me/assessment-applications", headers=learner,
                              json={"schedule_id": schedule["id"]}).json()
    client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin,
                 json={"status": "approved"})
    client.post("/api/v1/me/certifications", headers=learner, json={"title": "SMAW NC I"})
    client.post("/api/v1/me/goals", headers=learner, json={"title": "Weld ships"})

    response = client.get("/api/v1/me/progress", headers=learner)
    assert response.status_code == 200
    progress = response.json()
    readiness = progress["readiness"]
    assert len(readiness) == 1
    assert readiness[0]["qualification"]["code"] == "SMAW-NC-II"
    assert (readiness[0]["latest_score"], readiness[0]["best_score"], readiness[0]["checks"]) == (50, 100, 3)
    assert readiness[0]["latest_level"] == "Moderate Readiness"
    assert progress["pathways"][0]["completion_percent"] == 25
    assert progress["pathways"][0]["next_step"]["position"] == 2
    assert progress["assessment_applications"] == {"approved": 1}
    assert progress["certifications"] == {"total": 1, "verified": 0}
    assert progress["goals"] == {"active": 1}


def test_progress_is_empty_for_a_new_learner(client, learner):
    assert client.get("/api/v1/me/progress", headers=learner).json() == {
        "readiness": [], "pathways": [], "assessment_applications": {}, "certifications": {"total": 0, "verified": 0},
        "goals": {}}


def test_export_includes_pathways_and_applications(client, learner, make_schedule):
    pathway = client.get("/api/v1/pathways", params={"qualification_code": "SMAW-NC-II"}).json()[0]
    client.post("/api/v1/me/pathways", headers=learner, json={"pathway_id": pathway["id"]})
    client.post("/api/v1/me/assessment-applications", headers=learner, json={"schedule_id": make_schedule()["id"]})
    export = client.get("/api/v1/me/export", headers=learner).json()
    assert [e["pathway"]["id"] for e in export["pathway_enrollments"]] == [pathway["id"]]
    assert [a["status"] for a in export["assessment_applications"]] == ["pending"]
