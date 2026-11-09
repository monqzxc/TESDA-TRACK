"""Supply statistics: registered is not confirmed, and unknown quantities stay unknown. Fixtures are test-only."""
from datetime import timedelta

from sqlmodel import select

from backend.tests.conftest import available_fixture
from tesda_track.models import AssessmentApplication, AssessmentSchedule, Learner, Region
from tesda_track.services import supply_statistics as supply

CODE = "SMAW-NC-II"


def test_registered_is_not_confirmed(session, make_program):
    make_program(verified=False)
    s = supply.supply_evidence(session, CODE)
    assert s.registered_training_sites.value == 1 and s.registered_training_programs.value == 1
    assert s.confirmed_training_offerings.value == 0
    assert s.confirmed_training_offerings.evidence_kind == "observed"


def test_partial_slots_report_known_of_eligible(session, make_program, make_provider):
    provider = make_provider()
    make_program(provider, slots=10, **available_fixture())
    make_program(provider, slots=20, **available_fixture())
    make_program(provider, **available_fixture())
    s = supply.supply_evidence(session, CODE)
    m = s.published_training_slots
    assert (m.value, m.known_record_count, m.eligible_record_count) == (30, 2, 3)
    assert m.statement == "30 reported published slots across 2 of 3 offerings; total capacity unknown."
    assert s.registered_training_sites.value == 1 and s.registered_training_programs.value == 3
    assert s.completeness["published_training_slots"] == 2 / 3


def test_full_schedule_contributes_observed_zero(session, make_schedule, learner):
    schedule = make_schedule(slots=1)
    person = session.exec(select(Learner).where(Learner.email == "juan@example.com")).one()
    session.add(AssessmentApplication(learner_id=person.id, schedule_id=schedule["id"], status="approved"))
    session.flush()
    m = supply.supply_evidence(session, CODE).remaining_assessment_seats
    assert m.value == 0 and m.coverage == 1


def test_unknown_training_seats_are_null(session, make_program):
    make_program(slots=10, **available_fixture())
    m = supply.supply_evidence(session, CODE).remaining_training_seats
    assert m.value is None
    assert "Remaining training seats are not recorded; published slots are a separate measure." in m.limitations


def test_training_authority_does_not_confirm_assessment(session, make_program, make_schedule):
    make_program(**available_fixture())  # training authority exists for this qualification
    make_schedule(verified=False)  # but no assessment authority
    s = supply.supply_evidence(session, CODE)
    assert s.confirmed_assessment_schedules.value == 0
    assert s.confirmed_assessment_sites.value == 0


def test_unverified_schedule_is_not_confirmed(session, make_schedule):
    make_schedule(verified=False)
    s = supply.supply_evidence(session, CODE)
    assert s.confirmed_assessment_schedules.value == 0 and s.remaining_assessment_seats.value is None


def test_confirmed_schedule_counts_remaining_seats(session, make_schedule):
    make_schedule(slots=5)
    s = supply.supply_evidence(session, CODE)
    assert s.confirmed_assessment_schedules.value == 1 and s.confirmed_assessment_sites.value == 1
    assert s.remaining_assessment_seats.value == 5
    assert s.remaining_assessment_seats.sources == ["registry", "verification"]


def test_region_filter_uses_site_region(session, make_provider, make_program):
    other = session.exec(select(Region).where(Region.code != "NCR").order_by(Region.code)).first().code
    make_program(make_provider(region_code="NCR"))
    make_program(make_provider(name="Elsewhere", region_code=other))
    s = supply.supply_evidence(session, CODE, "NCR")
    assert s.registered_training_programs.value == 1
    assert s.registered_training_programs.geography.region_code == "NCR"
    everywhere = supply.supply_evidence(session, CODE)
    assert everywhere.registered_training_programs.value == 2
    assert everywhere.registered_training_programs.geography.label == "All registered sites in this dataset"
    assert "Registry-wide market coverage is unknown." in everywhere.registered_training_programs.limitations


def test_window_limits_assessment_schedules(session, make_schedule, make_center):
    center = make_center()
    make_schedule(center, days_ahead=5)
    make_schedule(center, days_ahead=40)
    from datetime import date
    before = date.today() + timedelta(days=20)
    s = supply.supply_evidence(session, CODE, scheduled_before=before)
    assert s.confirmed_assessment_schedules.value == 1
