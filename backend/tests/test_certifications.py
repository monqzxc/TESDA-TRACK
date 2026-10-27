from sqlmodel import select

from tesda_track.models import Certification


def add(client, headers, **body):
    return client.post("/api/v1/me/certifications", headers=headers, json={"title": "SMAW NC I", **body})


def test_learner_records_a_self_reported_certification(client, learner):
    response = add(client, learner, qualification_code="SMAW-NC-II", certificate_number="17-0001",
                   issued_on="2024-03-01", expires_on="2029-03-01")
    assert response.status_code == 201
    certification = response.json()
    assert certification["verified"] is False and certification["source"] == "self_reported"
    assert certification["issuing_body"] == "TESDA"
    assert certification["qualification"]["code"] == "SMAW-NC-II"


def test_expiry_before_issue_date_is_rejected(client, learner):
    assert add(client, learner, issued_on="2024-03-01", expires_on="2023-03-01").status_code == 422


def test_learner_edits_and_deletes_unverified_certifications(client, learner):
    certification = add(client, learner).json()
    path = f"/api/v1/me/certifications/{certification['id']}"
    assert client.patch(path, headers=learner, json={"certificate_number": "17-0002"}).json()[
        "certificate_number"] == "17-0002"
    assert client.delete(path, headers=learner).status_code == 204
    assert client.get("/api/v1/me/certifications", headers=learner).json() == []


def test_verified_certifications_cannot_be_edited(client, session, learner):
    certification = add(client, learner).json()
    row = session.exec(select(Certification)).one()
    row.verified = True
    session.flush()
    response = client.patch(f"/api/v1/me/certifications/{certification['id']}", headers=learner,
                            json={"title": "SMAW NC II"})
    assert response.status_code == 409


def test_other_learners_certifications_are_invisible(client, learner, other_learner):
    certification = add(client, other_learner).json()
    path = f"/api/v1/me/certifications/{certification['id']}"
    assert client.patch(path, headers=learner, json={"title": "Mine"}).status_code == 404
    assert client.delete(path, headers=learner).status_code == 404
    assert client.get("/api/v1/me/certifications", headers=learner).json() == []
