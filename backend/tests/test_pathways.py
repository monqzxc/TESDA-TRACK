from pathlib import Path

import pytest
from sqlmodel import select

from tesda_track.models import Pathway, Qualification
from tesda_track.seed import seed_all

TEST_SEED_DIR = Path(__file__).resolve().parent / "seed"


def pathways_for(client, code, **params):
    response = client.get("/api/v1/pathways", params={"qualification_code": code, **params})
    assert response.status_code == 200, response.text
    return response.json()


def enroll(client, headers, pathway_id):
    return client.post("/api/v1/me/pathways", headers=headers, json={"pathway_id": pathway_id})


def test_every_qualification_gets_a_default_pathway_per_route(client):
    pathways = pathways_for(client, "SMAW-NC-II")
    assert sorted(p["route"] for p in pathways) == ["ASSESSMENT_READINESS", "SKILL_GAP_CHECK",
                                                    "TRAINING_AND_ASSESSMENT"]
    training = next(p for p in pathways if p["route"] == "TRAINING_AND_ASSESSMENT")
    assert [s["position"] for s in training["steps"]] == [1, 2, 3, 4]
    assert training["steps"][0]["title"] == "Enroll in a Shielded Metal Arc Welding (SMAW) NC II training program"


def test_reseeding_keeps_admin_edits_and_adds_pathways_for_new_qualifications(client, admin, session):
    pathway = pathways_for(client, "SMAW-NC-II", route="SKILL_GAP_CHECK")[0]
    client.put(f"/api/v1/admin/pathways/{pathway['id']}", headers=admin, json={"title": "Welding upskilling"})
    reports = seed_all(session, TEST_SEED_DIR)
    assert reports["pathways"].created == 0
    assert pathways_for(client, "SMAW-NC-II", route="SKILL_GAP_CHECK")[0]["title"] == "Welding upskilling"


def test_recommended_pathway_includes_the_curated_steps(client):
    profile = {"experience_years": 4, "has_certification": False, "intent": "assessment_recommendation"}
    response = client.post("/api/v1/analysis/pathway", json={"profile": profile, "qualification_code": "SMAW-NC-II"})
    body = response.json()
    assert body["recommendation"] == "ASSESSMENT_READINESS"
    assert body["pathway"]["title"] == "Turn your experience into a certificate"
    assert body["pathway"]["steps"][0]["kind"] == "self_check"


def test_follow_up_questions_have_no_curated_pathway(client):
    response = client.post("/api/v1/analysis/pathway", json={"profile": {}, "qualification_code": "SMAW-NC-II"})
    assert response.json()["recommendation"] == "ADDITIONAL_QUESTIONS" and response.json()["pathway"] is None


def test_admin_replaces_steps_keeping_ids_of_kept_steps(client, admin):
    pathway = pathways_for(client, "CSS-NC-II", route="TRAINING_AND_ASSESSMENT")[0]
    kept = pathway["steps"][2]
    response = client.put(f"/api/v1/admin/pathways/{pathway['id']}", headers=admin, json={"steps": [
        {"id": kept["id"], "kind": kept["kind"], "title": "Book your assessment early"},
        {"kind": "other", "title": "Join the alumni community"},
    ]})
    assert response.status_code == 200
    steps = response.json()["steps"]
    assert [(s["position"], s["title"]) for s in steps] == [(1, "Book your assessment early"),
                                                           (2, "Join the alumni community")]
    assert steps[0]["id"] == kept["id"]


def test_steps_of_another_pathway_cannot_be_reused(client, admin):
    css = pathways_for(client, "CSS-NC-II", route="TRAINING_AND_ASSESSMENT")[0]
    smaw = pathways_for(client, "SMAW-NC-II", route="TRAINING_AND_ASSESSMENT")[0]
    response = client.put(f"/api/v1/admin/pathways/{css['id']}", headers=admin, json={"steps": [
        {"id": smaw["steps"][0]["id"], "kind": "training", "title": "Borrowed"}]})
    assert response.status_code == 422


def test_duplicate_route_for_a_qualification_is_rejected(client, admin):
    response = client.post("/api/v1/admin/pathways", headers=admin, json={
        "qualification_code": "SMAW-NC-II", "route": "SKILL_GAP_CHECK", "title": "Another",
        "steps": [{"kind": "training", "title": "Train"}]})
    assert response.status_code == 409


def test_admin_creates_a_pathway_for_a_qualification_without_one(client, admin, session):
    for pathway in session.exec(select(Pathway).join(Qualification).where(Qualification.code == "FBS-NC-II")).all():
        session.delete(pathway)
    session.flush()
    response = client.post("/api/v1/admin/pathways", headers=admin, json={
        "qualification_code": "FBS-NC-II", "route": "SKILL_GAP_CHECK", "title": "Service excellence",
        "description": "For working waiters", "steps": [{"kind": "training", "title": "Train"},
                                                         {"kind": "assessment", "title": "Assess"}]})
    assert response.status_code == 201
    assert [s["position"] for s in response.json()["steps"]] == [1, 2]


def test_deactivated_pathways_are_hidden(client, admin):
    pathway = pathways_for(client, "EIM-NC-II", route="SKILL_GAP_CHECK")[0]
    client.put(f"/api/v1/admin/pathways/{pathway['id']}", headers=admin, json={"is_active": False})
    assert pathways_for(client, "EIM-NC-II", route="SKILL_GAP_CHECK") == []


def test_learner_enrolls_and_tracks_step_progress(client, learner):
    pathway = pathways_for(client, "SMAW-NC-II", route="ASSESSMENT_READINESS")[0]
    response = enroll(client, learner, pathway["id"])
    assert response.status_code == 201
    enrollment = response.json()
    assert enrollment["completion_percent"] == 0
    assert [s["status"] for s in enrollment["steps"]] == ["not_started"] * 4

    path = f"/api/v1/me/pathways/{enrollment['id']}/steps"
    client.patch(f"{path}/{pathway['steps'][0]['id']}", headers=learner, json={"status": "completed"})
    updated = client.patch(f"{path}/{pathway['steps'][1]['id']}", headers=learner, json={"status": "in_progress"})
    assert updated.status_code == 200
    assert updated.json()["completion_percent"] == 25
    assert [s["status"] for s in updated.json()["steps"]][:2] == ["completed", "in_progress"]


def test_completing_every_step_completes_the_enrollment(client, learner):
    pathway = pathways_for(client, "SMAW-NC-II", route="SKILL_GAP_CHECK")[0]
    enrollment = enroll(client, learner, pathway["id"]).json()
    path = f"/api/v1/me/pathways/{enrollment['id']}/steps"
    for step in pathway["steps"]:
        result = client.patch(f"{path}/{step['id']}", headers=learner, json={"status": "completed"}).json()
    assert result["status"] == "completed" and result["completion_percent"] == 100
    assert result["completed_at"] is not None
    reopened = client.patch(f"{path}/{pathway['steps'][0]['id']}", headers=learner, json={"status": "in_progress"})
    assert reopened.json()["status"] == "active" and reopened.json()["completed_at"] is None


def test_enrolling_twice_is_a_conflict_and_withdrawal_is_reversible(client, learner):
    pathway = pathways_for(client, "SMAW-NC-II", route="SKILL_GAP_CHECK")[0]
    enrollment = enroll(client, learner, pathway["id"]).json()
    assert enroll(client, learner, pathway["id"]).status_code == 409
    path = f"/api/v1/me/pathways/{enrollment['id']}"
    assert client.patch(path, headers=learner, json={"status": "withdrawn"}).json()["status"] == "withdrawn"
    assert client.patch(path, headers=learner, json={"status": "active"}).json()["status"] == "active"


@pytest.mark.parametrize("pathway_id", [999999])
def test_unknown_pathway_cannot_be_joined(client, learner, pathway_id):
    assert enroll(client, learner, pathway_id).status_code == 422


def test_steps_from_other_pathways_and_other_learners_are_rejected(client, learner, other_learner):
    smaw = pathways_for(client, "SMAW-NC-II", route="SKILL_GAP_CHECK")[0]
    css = pathways_for(client, "CSS-NC-II", route="SKILL_GAP_CHECK")[0]
    enrollment = enroll(client, learner, smaw["id"]).json()
    path = f"/api/v1/me/pathways/{enrollment['id']}/steps"
    assert client.patch(f"{path}/{css['steps'][0]['id']}", headers=learner,
                        json={"status": "completed"}).status_code == 404
    assert client.patch(f"{path}/{smaw['steps'][0]['id']}", headers=other_learner,
                        json={"status": "completed"}).status_code == 404
    assert client.get("/api/v1/me/pathways", headers=other_learner).json() == []
