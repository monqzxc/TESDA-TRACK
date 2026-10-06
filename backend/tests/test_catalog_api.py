from sqlmodel import select

from tesda_track.models import Qualification


def test_lists_active_qualifications_with_public_fields_only(client):
    response = client.get("/api/v1/qualifications")
    assert response.status_code == 200
    body = response.json()
    assert [q["code"] for q in body] == ["SMAW-NC-II", "CSS-NC-II", "EIM-NC-II", "COOKERY-NC-II", "FBS-NC-II"]
    smaw = body[0]
    assert smaw["name"] == "Shielded Metal Arc Welding (SMAW) NC II"
    assert smaw["sector"] == "Metals and Engineering"
    assert smaw["possible_jobs"] == ["Welder", "Fabricator", "Structural Welder"]
    assert [c["position"] for c in smaw["competencies"]] == [1, 2, 3, 4, 5, 6]
    assert set(smaw["competencies"][0]) == {"id", "position", "name", "category"}
    assert "career_keywords" not in smaw and "skill_label" not in smaw


def test_archived_qualifications_and_competencies_are_hidden(client, session):
    fbs = session.exec(select(Qualification).where(Qualification.code == "FBS-NC-II")).one()
    fbs.is_active = False
    smaw = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
    smaw.competencies[5].is_active = False
    session.flush()
    body = client.get("/api/v1/qualifications").json()
    assert "FBS-NC-II" not in [q["code"] for q in body]
    assert len(body[0]["competencies"]) == 5
    assert client.get("/api/v1/qualifications/FBS-NC-II").status_code == 404


def test_gets_one_qualification_by_code(client):
    response = client.get("/api/v1/qualifications/CSS-NC-II")
    assert response.status_code == 200
    assert response.json()["name"] == "Computer Systems Servicing NC II"


def test_unknown_qualification_code_is_404(client):
    response = client.get("/api/v1/qualifications/ASTRONAUT-NC-IV")
    assert response.status_code == 404
    assert response.json() == {"detail": "Qualification 'ASTRONAUT-NC-IV' was not found."}
