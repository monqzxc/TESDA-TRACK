"""Synthetic evidence fixtures live only in the disposable test database."""
from datetime import timedelta

import pytest
from sqlmodel import select

from tesda_track.models import Certification, Learner, Qualification, ServiceVerification, utcnow

CODE = "SMAW-NC-II"
BASE = "/api/v1/admin/service-verifications"


def evidence(**changes):
    return {"status": "verified", "source_name": "Isolated test authority",
            "source_reference": "https://example.invalid/test-evidence", "requirements_reviewed": True,
            "reviewed_at": (utcnow() - timedelta(days=1)).isoformat(),
            "review_due_at": (utcnow() + timedelta(days=30)).isoformat(), **changes}


def availability(**changes):
    return {"availability_status": "available", "availability_source": "Test-only intake evidence",
            "availability_checked_at": (utcnow() - timedelta(minutes=1)).isoformat(),
            "availability_valid_until": (utcnow() + timedelta(days=1)).isoformat(), **changes}


def ranking(client, learner=None, **body):
    response = client.post("/api/v1/recommendations/training", headers=learner,
                           json={"qualification_code": CODE, **body})
    assert response.status_code == 200, response.text
    return response.json()


def put(client, admin, site_id, kind="training", **changes):
    return client.put(f"{BASE}/{kind}/{site_id}/{CODE}", headers=admin, json=evidence(**changes))


def prerequisite(kind="verified_certification"):
    return {"kind": kind, "description": "Required entry qualification" if kind != "manual_review" else "Official entry documents",
            "source_reference": "https://example.invalid/test-prerequisite",
            **({"qualification_code": "CSS-NC-II"} if kind == "verified_certification" else {})}


def certificate(session, email="juan@example.com", verified=True, expired=False, **changes):
    learner = session.exec(select(Learner).where(Learner.email == email)).one()
    qualification = session.exec(select(Qualification).where(Qualification.code == "CSS-NC-II")).one()
    session.add(Certification(learner_id=learner.id, qualification_id=qualification.id, title="Test prerequisite",
        verified=verified, issued_on=utcnow().date() - timedelta(days=10),
        expires_on=utcnow().date() + timedelta(days=-1 if expired else 10), **changes))
    session.flush()


def test_existing_active_records_are_unknown_not_confirmed(client, make_program):
    program = make_program(verified=False)
    result = ranking(client)
    assert result["results"] == []
    pending = result["requires_verification"][0]
    assert pending["program"]["id"] == program["id"]
    assert pending["program"]["verification"]["status"] == "unknown"
    assert pending["eligibility"]["status"] == "unknown"
    assert "score" not in pending


@pytest.mark.parametrize("changes,status", [
    ({"status": "unavailable"}, "unavailable"),
    ({"status": "expired"}, "expired"),
    ({"valid_until": (utcnow() - timedelta(minutes=1)).isoformat()}, "expired"),
    ({"review_due_at": (utcnow() - timedelta(minutes=1)).isoformat()}, "expired"),
])
def test_failed_verification_is_excluded(client, admin, make_program, changes, status):
    program = make_program()
    response = put(client, admin, program["provider"]["id"], **changes)
    assert response.status_code == 200
    assert response.json()["status"] == status
    result = ranking(client)
    assert not result["results"] and not result["requires_verification"]


def test_future_authorization_and_unreviewed_prerequisites_are_unknown(client, admin, make_program):
    program = make_program()
    put(client, admin, program["provider"]["id"], valid_from=(utcnow() + timedelta(days=2)).isoformat())
    assert ranking(client)["requires_verification"][0]["program"]["verification"]["status"] == "unknown"
    put(client, admin, program["provider"]["id"], requirements_reviewed=False)
    assert not ranking(client)["results"]


@pytest.mark.parametrize("change", [
    {"source_reference": None}, {"source_name": " "}, {"reviewed_at": None}, {"review_due_at": None},
    {"reviewed_at": (utcnow() + timedelta(days=1)).isoformat()}, {"is_synthetic": True},
    {"requirements": [{"kind": "unknown_rule", "description": "x", "source_reference": "x"}]},
    {"requirements": [{"kind": "verified_certification", "description": "x", "source_reference": "x"}]},
])
def test_admin_cannot_mark_incomplete_or_synthetic_evidence_verified(client, admin, make_provider, change):
    provider = make_provider()
    assert put(client, admin, provider["id"], **change).status_code == 422


def test_only_admin_can_write_source_evidence(client, learner, make_provider):
    provider = make_provider()
    url = f"{BASE}/training/{provider['id']}/{CODE}"
    assert client.put(url, json=evidence()).status_code == 401
    assert client.put(url, headers=learner, json=evidence()).status_code == 403
    assert client.get(url, headers=learner).status_code == 403


def test_verification_is_qualification_and_service_specific(client, admin, make_provider, make_center, make_program, make_schedule):
    provider, center = make_provider(), make_center()
    make_program(provider=provider)
    unverified = make_program(provider=provider, qualification_code="CSS-NC-II", verified=False)
    result = client.post("/api/v1/recommendations/training", json={"qualification_code": "CSS-NC-II"}).json()
    assert result["requires_verification"][0]["program"]["id"] == unverified["id"]
    schedule = make_schedule(center=center, verified=False)
    assert schedule["verification"]["status"] == "unknown"
    assert ranking(client)["results"][0]["components"]["assessment"] == 0


@pytest.mark.parametrize("state,expected", [("missing", "unknown"), ("self_reported", "unknown"),
                                         ("expired", "unsatisfied"), ("verified", "satisfied")])
def test_certificate_prerequisites_use_only_current_verified_owned_records(client, admin, learner, session,
                                                                         make_program, state, expected):
    program = make_program()
    put(client, admin, program["provider"]["id"], requirements=[prerequisite()])
    if state != "missing":
        certificate(session, verified=state != "self_reported", expired=state == "expired")
    result = ranking(client, learner)
    if expected == "satisfied":
        assert result["results"][0]["eligibility"]["status"] == expected
    elif expected == "unknown":
        assert result["requires_verification"][0]["eligibility"]["status"] == expected
        assert not result["results"]
    else:
        assert not result["results"] and not result["requires_verification"]


def test_other_learners_certificate_cannot_satisfy_prerequisite(client, admin, learner, other_learner, session, make_program):
    program = make_program()
    put(client, admin, program["provider"]["id"], requirements=[prerequisite()])
    certificate(session, email="maria@example.com")
    assert not ranking(client, learner)["results"]
    assert ranking(client, other_learner)["results"]
    assert not ranking(client)["results"]


def test_manual_prerequisites_never_auto_pass(client, admin, learner, make_program):
    program = make_program()
    put(client, admin, program["provider"]["id"], requirements=[prerequisite("manual_review")])
    assert ranking(client, learner)["requires_verification"][0]["eligibility"]["status"] == "unknown"


def test_unknown_dates_and_availability_are_not_open_intake(client, make_program):
    make_program()
    item = ranking(client)["results"][0]
    assert item["components"]["schedule"] == 0
    assert item["program"]["availability"]["status"] == "unknown"
    assert "Open intake" not in item["explanation"]
    assert "Current intake availability requires confirmation" in item["explanation"]
    strict = ranking(client, require_confirmed_availability=True)
    assert not strict["results"] and strict["requires_verification"]


def test_unavailable_and_stale_intakes_do_not_satisfy_confirmed_availability(client, make_program):
    make_program(**availability(availability_status="unavailable"))
    assert not ranking(client)["results"]
    make_program(**availability(availability_checked_at=(utcnow() - timedelta(days=3)).isoformat(),
                                availability_valid_until=(utcnow() - timedelta(days=1)).isoformat()))
    result = ranking(client, require_confirmed_availability=True)
    assert not result["results"] and len(result["requires_verification"]) == 1


def test_filtering_does_not_stop_at_first_hundred_unverified_candidates(client, session, make_provider, make_program):
    from tesda_track.models import TrainingProgram
    provider = make_provider()
    qualification = session.exec(select(Qualification).where(Qualification.code == CODE)).one()
    for number in range(101):
        session.add(TrainingProgram(provider_id=provider["id"], qualification_id=qualification.id,
                                    title=f"Unverified fixture {number}", delivery_mode="online"))
    session.flush()
    valid = make_program()
    result = ranking(client)
    assert [r["program"]["id"] for r in result["results"]] == [valid["id"]]
    assert len(result["requires_verification"]) == 10


@pytest.mark.parametrize("failure", ["unknown", "expired", "unavailable", "prerequisite", "inactive", "availability"])
def test_assessment_application_enforces_evidence(client, admin, learner, make_schedule, failure):
    schedule = make_schedule(verified=failure != "unknown")
    if failure in ("expired", "unavailable"):
        put(client, admin, schedule["center"]["id"], kind="assessment", status=failure)
    elif failure == "prerequisite":
        put(client, admin, schedule["center"]["id"], kind="assessment", requirements=[prerequisite()])
    elif failure == "inactive":
        client.patch(f"/api/v1/admin/assessment-centers/{schedule['center']['id']}", headers=admin, json={"is_active": False})
    elif failure == "availability":
        client.patch(f"/api/v1/admin/assessment-schedules/{schedule['id']}", headers=admin,
                     json={"availability_status": "unknown"})
    response = client.post("/api/v1/me/assessment-applications", headers=learner, json={"schedule_id": schedule["id"]})
    assert response.status_code == 422


def test_approval_rechecks_revoked_authorization(client, admin, learner, make_schedule):
    schedule = make_schedule()
    application = client.post("/api/v1/me/assessment-applications", headers=learner,
                              json={"schedule_id": schedule["id"]}).json()
    put(client, admin, schedule["center"]["id"], kind="assessment", status="unavailable")
    response = client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin,
                            json={"status": "approved"})
    assert response.status_code == 422


def test_current_authorization_must_cover_the_scheduled_assessment(client, admin, learner, make_schedule):
    schedule = make_schedule(days_ahead=14)
    assert put(client, admin, schedule["center"]["id"], kind="assessment",
               valid_until=(utcnow() + timedelta(days=7)).isoformat()).status_code == 200
    response = client.post("/api/v1/me/assessment-applications", headers=learner,
                           json={"schedule_id": schedule["id"]})
    assert response.status_code == 422
    assert "scheduled assessment date" in response.json()["detail"]


def test_current_certificate_that_expires_before_assessment_cannot_satisfy_entry_requirement(
        client, admin, learner, session, make_schedule):
    schedule = make_schedule(days_ahead=14)
    put(client, admin, schedule["center"]["id"], kind="assessment", requirements=[prerequisite()])
    certificate(session)  # Valid now, expires in ten days, before this assessment.
    response = client.post("/api/v1/me/assessment-applications", headers=learner,
                           json={"schedule_id": schedule["id"]})
    assert response.status_code == 422


def test_training_authorization_must_cover_published_dates(client, admin, make_program):
    program = make_program(start_date=(utcnow().date() + timedelta(days=2)).isoformat(),
                           end_date=(utcnow().date() + timedelta(days=30)).isoformat())
    put(client, admin, program["provider"]["id"], valid_until=(utcnow() + timedelta(days=10)).isoformat())
    result = ranking(client)
    assert not result["results"]
    assert any("published training dates" in reason for reason in result["requires_verification"][0]["reasons"])


def test_editing_an_intake_requires_new_availability_evidence(client, admin, make_schedule):
    schedule = make_schedule()
    response = client.patch(f"/api/v1/admin/assessment-schedules/{schedule['id']}", headers=admin,
                            json={"slots": 5, "availability_status": "available"})
    assert response.status_code == 200
    assert response.json()["availability"]["status"] == "unknown"
    response = client.patch(f"/api/v1/admin/assessment-schedules/{schedule['id']}", headers=admin,
                            json={"slots": 6, **availability()})
    assert response.json()["availability"]["status"] == "available"


def test_import_dry_run_atomicity_and_idempotence(client, admin, make_provider, session):
    provider = make_provider()
    row = {"kind": "training", "site_id": provider["id"], "qualification_code": CODE, "evidence": evidence()}
    response = client.post(f"{BASE}/import", headers=admin, json={"records": [row]})
    assert response.status_code == 200 and response.json()["saved"] == 0
    assert session.exec(select(ServiceVerification)).all() == []
    for _ in range(2):
        response = client.post(f"{BASE}/import", headers=admin, json={"dry_run": False, "records": [row]})
        assert response.status_code == 200
    assert len(session.exec(select(ServiceVerification)).all()) == 1
    failed = client.post(f"{BASE}/import", headers=admin, json={"dry_run": False, "records": [
        {**row, "evidence": evidence(status="unavailable")}, {**row, "site_id": 999999}]})
    assert failed.status_code == 422
    session.expire_all()
    assert session.exec(select(ServiceVerification)).one().status == "verified"
    duplicate = client.post(f"{BASE}/import", headers=admin, json={"records": [row, row]})
    assert duplicate.status_code == 422


def test_migration_preserves_existing_offerings_as_unknown(session, make_program):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text

    program = make_program(verified=False)
    config = Config(Path(__file__).resolve().parents[1] / "alembic.ini")
    config.attributes.update(connection=session.connection(), configure_logger=False)
    command.downgrade(config, "0005")
    command.upgrade(config, "head")
    row = session.exec(text("SELECT title, availability_status FROM training_program WHERE id = :id").bindparams(id=program["id"])).one()
    assert row == (program["title"], "unknown")
    assert session.exec(select(ServiceVerification)).all() == []
