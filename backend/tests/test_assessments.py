from datetime import datetime, timedelta, timezone

import pytest

CEBU_CITY = (10.3157, 123.8854)
QUEZON_CITY = (14.6760, 121.0437)  # centers made by make_center() default to Manila


def upcoming(client, **params):
    response = client.get("/api/v1/assessment-schedules", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def apply(client, headers, schedule):
    return client.post("/api/v1/me/assessment-applications", headers=headers, json={"schedule_id": schedule["id"]})


def review(client, admin, application, **body):
    return client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin, json=body)


def test_upcoming_open_schedules_are_listed_with_seats_left(client, admin, make_schedule):
    schedule = make_schedule(slots=3, fee="800.00")
    make_schedule(days_ahead=-3)  # already happened
    closed = make_schedule()
    client.patch(f"/api/v1/admin/assessment-schedules/{closed['id']}", headers=admin, json={"status": "closed"})
    listed = upcoming(client, qualification_code="SMAW-NC-II")
    assert [s["id"] for s in listed] == [schedule["id"]]
    assert listed[0]["seats_left"] == 3 and listed[0]["fee"] == "800.00"
    assert listed[0]["center"]["name"] == "Manila Assessment Center"


def test_schedules_can_be_searched_near_a_point(client, make_center, make_schedule):
    cebu = make_center(name="Cebu Assessment Center", region_code="VII", location=CEBU_CITY)
    manila_schedule = make_schedule()
    cebu_schedule = make_schedule(center=cebu)
    near = upcoming(client, near_lat=QUEZON_CITY[0], near_lon=QUEZON_CITY[1], radius_km=100)
    assert [s["id"] for s in near] == [manila_schedule["id"]]
    by_region = upcoming(client, region_code="VII")
    assert [s["id"] for s in by_region] == [cebu_schedule["id"]]


def test_schedules_can_be_listed_for_one_center(client, make_center, make_schedule):
    # A center's details list everything it offers, whatever the learner searched for.
    cebu = make_center(name="Cebu Assessment Center", region_code="VII", location=CEBU_CITY)
    manila_schedule = make_schedule()
    cebu_schedule = make_schedule(center=cebu)
    assert [s["id"] for s in upcoming(client, center_id=cebu["id"])] == [cebu_schedule["id"]]
    assert [s["id"] for s in upcoming(client, center_id=manila_schedule["center"]["id"])] == [manila_schedule["id"]]


def test_centers_can_be_listed_within_a_radius(client, make_center):
    manila = make_center()
    cebu = make_center(name="Cebu Assessment Center", region_code="VII", location=CEBU_CITY)
    make_center(name="Unmapped Assessment Center", location=None)

    def names(**params):
        response = client.get("/api/v1/assessment-centers", params=params)
        assert response.status_code == 200, response.text
        return [center["name"] for center in response.json()]

    assert names() == ["Cebu Assessment Center", "Manila Assessment Center", "Unmapped Assessment Center"]
    # Quezon City to Manila is roughly 11 km; to Cebu City roughly 570 km. Unmapped centers can't be inside it.
    assert names(near_lat=QUEZON_CITY[0], near_lon=QUEZON_CITY[1], radius_km=20) == [manila["name"]]
    assert names(near_lat=CEBU_CITY[0], near_lon=CEBU_CITY[1], radius_km=20, region_code="VII") == [cebu["name"]]
    # A point alone narrows nothing.
    assert len(names(near_lat=QUEZON_CITY[0], near_lon=QUEZON_CITY[1])) == 3


@pytest.mark.parametrize("params", [{"near_lat": 14.6}, {"radius_km": 10}, {"near_lat": 95, "near_lon": 120},
                                    {"near_lat": 14.6, "near_lon": 121, "radius_km": 0}])
def test_a_center_radius_needs_a_complete_valid_point(client, params):
    assert client.get("/api/v1/assessment-centers", params=params).status_code == 422


def test_learner_applies_once_per_schedule(client, learner, make_schedule):
    schedule = make_schedule()
    response = apply(client, learner, schedule)
    assert response.status_code == 201
    assert response.json()["status"] == "pending" and response.json()["schedule"]["id"] == schedule["id"]
    assert apply(client, learner, schedule).status_code == 409


def test_cannot_apply_to_past_or_closed_schedules(client, admin, learner, make_schedule):
    past = make_schedule(days_ahead=-1)
    closed = make_schedule()
    client.patch(f"/api/v1/admin/assessment-schedules/{closed['id']}", headers=admin, json={"status": "closed"})
    assert apply(client, learner, past).status_code == 422
    assert apply(client, learner, closed).status_code == 422
    assert client.post("/api/v1/me/assessment-applications", headers=learner,
                       json={"schedule_id": 999999}).status_code == 422


def test_withdrawn_application_can_be_resubmitted(client, learner, make_schedule):
    schedule = make_schedule()
    application = apply(client, learner, schedule).json()
    withdrawn = client.post(f"/api/v1/me/assessment-applications/{application['id']}/withdraw", headers=learner)
    assert withdrawn.status_code == 200 and withdrawn.json()["status"] == "withdrawn"
    again = apply(client, learner, schedule)
    assert again.status_code == 201 and again.json()["id"] == application["id"] and again.json()["status"] == "pending"


def test_approval_takes_a_seat_and_is_refused_when_full(client, admin, learner, other_learner, make_schedule):
    schedule = make_schedule(slots=1)
    first = apply(client, learner, schedule).json()
    second = apply(client, other_learner, schedule).json()
    assert upcoming(client)[0]["seats_left"] == 1, "pending applications don't hold seats"
    assert review(client, admin, first, status="approved").status_code == 200
    assert upcoming(client)[0]["seats_left"] == 0
    response = review(client, admin, second, status="approved")
    assert response.status_code == 409
    assert response.json() == {"detail": "No seats are left for this schedule."}


def test_competent_result_issues_a_verified_certification(client, admin, learner, make_schedule):
    application = apply(client, learner, make_schedule()).json()
    review(client, admin, application, status="approved")
    response = review(client, admin, application, status="completed", result="competent")
    assert response.status_code == 200 and response.json()["result"] == "competent"
    certifications = client.get("/api/v1/me/certifications", headers=learner).json()
    assert len(certifications) == 1
    assert certifications[0]["verified"] is True and certifications[0]["source"] == "assessment"
    assert certifications[0]["qualification"]["code"] == "SMAW-NC-II"
    assert certifications[0]["title"] == "Shielded Metal Arc Welding (SMAW) NC II"


def test_not_yet_competent_result_issues_no_certification(client, admin, learner, make_schedule):
    application = apply(client, learner, make_schedule()).json()
    review(client, admin, application, status="approved")
    review(client, admin, application, status="completed", result="not_yet_competent")
    assert client.get("/api/v1/me/certifications", headers=learner).json() == []


@pytest.mark.parametrize("body", [
    {"status": "completed"},  # a result is required
    {"status": "approved", "result": "competent"},  # results only come with completion
    {"status": "withdrawn"},  # only the learner withdraws
])
def test_invalid_reviews_are_rejected(client, admin, learner, make_schedule, body):
    application = apply(client, learner, make_schedule()).json()
    assert review(client, admin, application, **body).status_code == 422


def test_pending_application_cannot_be_completed_directly(client, admin, learner, make_schedule):
    application = apply(client, learner, make_schedule()).json()
    assert review(client, admin, application, status="completed", result="competent").status_code == 409


def test_completed_application_cannot_be_withdrawn(client, admin, learner, make_schedule):
    application = apply(client, learner, make_schedule()).json()
    review(client, admin, application, status="approved")
    review(client, admin, application, status="completed", result="competent")
    response = client.post(f"/api/v1/me/assessment-applications/{application['id']}/withdraw", headers=learner)
    assert response.status_code == 409


def test_learners_see_only_their_own_applications(client, learner, other_learner, make_schedule):
    application = apply(client, other_learner, make_schedule()).json()
    assert client.get("/api/v1/me/assessment-applications", headers=learner).json() == []
    assert client.post(f"/api/v1/me/assessment-applications/{application['id']}/withdraw",
                       headers=learner).status_code == 404


def test_admin_lists_applications_by_status_with_learner_details(client, admin, learner, other_learner, make_schedule):
    schedule = make_schedule()
    approved = apply(client, learner, schedule).json()
    apply(client, other_learner, schedule)
    review(client, admin, approved, status="approved")
    pending = client.get("/api/v1/admin/assessment-applications", headers=admin, params={"status": "pending"}).json()
    assert [a["learner"]["email"] for a in pending] == ["maria@example.com"]
    assert client.get("/api/v1/admin/assessment-applications", headers=learner).status_code == 403


def test_schedule_times_must_include_a_timezone(client, admin, make_center):
    center = make_center()
    naive = client.post("/api/v1/admin/assessment-schedules", headers=admin, json={
        "center_id": center["id"], "qualification_code": "SMAW-NC-II", "slots": 5,
        "scheduled_at": "2027-01-15T09:00:00"})
    assert naive.status_code == 422
    aware = (datetime.now(timezone.utc) + timedelta(days=30)).replace(microsecond=0).isoformat()
    created = client.post("/api/v1/admin/assessment-schedules", headers=admin, json={
        "center_id": center["id"], "qualification_code": "SMAW-NC-II", "slots": 5, "scheduled_at": aware})
    assert created.status_code == 201


def accredit(session, center_id, *codes, outcome="accepted", snapshot=None, key=None):
    """Registry history saying the center may assess these qualifications, as the registry importer leaves it."""
    from datetime import date
    from uuid import uuid4

    from sqlmodel import select

    from tesda_track.models import Qualification, RegistryBatch, RegistryLink, RegistryRecord

    snapshot = snapshot or date(2026, 10, 7)
    key = key or uuid4().hex * 2
    batch = RegistryBatch(fingerprint=uuid4().hex * 2, source_name="Assessment registry.xlsx", source_sha256="0" * 64,
                          kind="assessment", sheet="Centers", snapshot_date=snapshot, inspected_on=snapshot,
                          policy_sha256="1" * 64)
    session.add(batch)
    session.flush()
    link = session.exec(select(RegistryLink).where(RegistryLink.center_id == center_id)).first()
    if link is None:
        session.add(RegistryLink(entity_kind="center", external_key=key, center_id=center_id,
                                 last_snapshot_date=snapshot))
    else:
        key, link.last_snapshot_date = link.external_key, snapshot
    for row, code in enumerate(codes):
        qualification = session.exec(select(Qualification).where(Qualification.code == code)).one()
        session.add(RegistryRecord(batch_id=batch.id, row_number=row, site_key=key, outcome=outcome,
                                   qualification_id=qualification.id))
    session.flush()


def centers(client, **params):
    response = client.get("/api/v1/assessment-centers", params=params)
    assert response.status_code == 200, response.text
    return {center["name"]: center["qualification_codes"] for center in response.json()}


def test_centers_say_which_qualifications_the_registry_accredits_them_for(client, session, make_center, make_schedule):
    # The registry lists accreditations, never schedules: a learner must still be pointed to these centers.
    cebu = make_center(name="Cebu Assessment Center", region_code="VII", location=CEBU_CITY)
    accredit(session, cebu["id"], "COOKERY-NC-II", "FBS-NC-II")
    lapsed = make_center(name="Lapsed Assessment Center")
    accredit(session, lapsed["id"], "COOKERY-NC-II", outcome="historical")
    scheduled = make_schedule(center=make_center(name="Scheduled Assessment Center"), qualification_code="COOKERY-NC-II")

    assert centers(client) == {"Cebu Assessment Center": ["COOKERY-NC-II", "FBS-NC-II"],
                               "Lapsed Assessment Center": [], "Scheduled Assessment Center": []}
    # Accredited, or with an open schedule; an expired accreditation or an unknown code finds none.
    assert set(centers(client, qualification_code="COOKERY-NC-II")) == {"Cebu Assessment Center",
                                                                        scheduled["center"]["name"]}
    assert list(centers(client, qualification_code="FBS-NC-II")) == ["Cebu Assessment Center"]
    assert centers(client, qualification_code="SMAW-NC-II") == {}
    assert centers(client, qualification_code="NOPE-NC-II") == {}
    assert centers(client, qualification_code="COOKERY-NC-II", region_code="NCR") == {"Scheduled Assessment Center": []}


def test_only_a_centers_latest_snapshot_says_what_it_is_accredited_for(client, session, make_center):
    from datetime import date

    center = make_center()
    accredit(session, center["id"], "COOKERY-NC-II", snapshot=date(2026, 1, 5))
    accredit(session, center["id"], "EIM-NC-II", snapshot=date(2026, 10, 7))
    assert centers(client) == {"Manila Assessment Center": ["EIM-NC-II"]}
    assert centers(client, qualification_code="COOKERY-NC-II") == {}
