"""Recorded provision is not confirmed; examples are excluded and unknown quantities stay unknown."""
from datetime import timedelta

import pytest
from sqlmodel import select

from backend.tests.conftest import available_fixture
from tesda_track.models import AssessmentApplication, AssessmentSchedule, Learner, Region
from tesda_track.services import supply_statistics as supply

CODE = "SMAW-NC-II"


def test_recorded_is_not_confirmed(session, make_program):
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
    assert s.remaining_assessment_seats.sources == ["recorded-listings", "verification"]


def test_region_filter_uses_site_region(session, make_provider, make_program):
    other = session.exec(select(Region).where(Region.code != "NCR").order_by(Region.code)).first().code
    make_program(make_provider(region_code="NCR"))
    make_program(make_provider(name="Elsewhere", region_code=other))
    s = supply.supply_evidence(session, CODE, "NCR")
    assert s.registered_training_programs.value == 1
    assert s.registered_training_programs.geography.region_code == "NCR"
    everywhere = supply.supply_evidence(session, CODE)
    assert everywhere.registered_training_programs.value == 2
    assert everywhere.registered_training_programs.geography.label == "Active non-example sites in this dataset"
    assert "Registry-wide market coverage is unknown." in everywhere.registered_training_programs.limitations


def test_window_limits_assessment_schedules(session, make_schedule, make_center):
    center = make_center()
    make_schedule(center, days_ahead=5)
    make_schedule(center, days_ahead=40)
    from datetime import date
    before = date.today() + timedelta(days=20)
    s = supply.supply_evidence(session, CODE, scheduled_before=before)
    assert s.confirmed_assessment_schedules.value == 1


def test_unknown_availability_leaves_confirmed_denominator_unknown(session, make_program):
    make_program(verified=False)
    s = supply.supply_evidence(session, CODE)
    m = s.confirmed_training_offerings
    assert (m.value, m.eligible_record_count, m.known_record_count, m.unknown_count, m.coverage) == (0, 1, 0, 1, 0.0)
    assert s.completeness["confirmed_training_offerings"] == 0.0
    assert m.statement == "0 confirmed offerings of 1 recorded candidate; 0 of 1 have a current availability check."


def test_current_availability_with_unverified_authority_is_known_not_confirmed(session, make_program):
    make_program(verified=False, **available_fixture())
    m = supply.supply_evidence(session, CODE).confirmed_training_offerings
    assert (m.value, m.eligible_record_count, m.known_record_count) == (0, 1, 1)


def test_assessment_candidates_are_the_denominator(session, make_schedule, make_center):
    center = make_center()
    make_schedule(center)
    make_schedule(center, verified=False, availability_status="unknown", availability_source=None,
                  availability_checked_at=None, availability_valid_until=None)
    m = supply.supply_evidence(session, CODE).confirmed_assessment_schedules
    assert (m.value, m.eligible_record_count, m.known_record_count, m.coverage) == (1, 2, 1, 0.5)


def test_regional_label_is_the_region_name_and_unknown_region_is_rejected(session):
    from tesda_track.errors import InvalidRequestError

    region = session.get(Region, "NCR")
    assert supply.supply_evidence(session, CODE, "NCR").registered_training_sites.geography.label == region.name
    with pytest.raises(InvalidRequestError, match="Unknown region."):
        supply.supply_evidence(session, CODE, "NOPE")


@pytest.mark.parametrize("example_on", ["site", "listing"])
def test_example_training_site_or_program_never_contributes_to_supply(
    session, make_provider, make_program, example_on,
):
    provider = make_provider(data_status="example" if example_on == "site" else "incomplete")
    # Independent authority and affirmative availability cannot make a demonstration listing real.
    make_program(provider, slots=99, data_status="example" if example_on == "listing" else "incomplete",
                 **available_fixture())
    result = supply.supply_evidence(session, CODE)
    assert result.registered_training_sites.value == 0
    assert result.registered_training_programs.value == 0
    confirmed = result.confirmed_training_offerings
    assert (confirmed.value, confirmed.eligible_record_count, confirmed.known_record_count,
            confirmed.unknown_count, confirmed.coverage) == (0, 0, 0, 0, None)
    assert result.published_training_slots.value is None
    assert result.published_training_slots.eligible_record_count == 0
    assert result.remaining_training_seats.eligible_record_count == 0


@pytest.mark.parametrize("example_on", ["site", "listing"])
def test_example_assessment_site_or_schedule_never_contributes_to_supply(
    session, make_center, make_schedule, example_on,
):
    center = make_center(data_status="example" if example_on == "site" else "incomplete")
    make_schedule(center, slots=99, data_status="example" if example_on == "listing" else "incomplete")
    result = supply.supply_evidence(session, CODE)
    confirmed = result.confirmed_assessment_schedules
    assert (confirmed.value, confirmed.eligible_record_count, confirmed.known_record_count,
            confirmed.unknown_count, confirmed.coverage) == (0, 0, 0, 0, None)
    assert result.confirmed_assessment_sites.value == 0
    assert result.remaining_assessment_seats.value is None
    assert result.remaining_assessment_seats.eligible_record_count == 0


def test_incomplete_source_backed_listings_remain_recorded_without_claiming_registration(
    session, make_provider, make_program,
):
    provider = make_provider(data_status="incomplete", source_name="Original registry workbook",
                             source_reference="Training providers sheet, row 2")
    make_program(provider, verified=False, data_status="incomplete", source_name="Original registry workbook",
                 source_reference="Registered programs sheet, row 3")
    result = supply.supply_evidence(session, CODE, "NCR")
    assert result.registered_training_sites.value == result.registered_training_programs.value == 1
    assert result.registered_training_sites.statement == "1 recorded training site in this dataset extent."
    assert result.registered_training_programs.statement == "1 recorded training program listing in this dataset extent."
    assert result.registered_training_programs.sources == ["recorded-listings"]
    assert supply.RECORDED_PROVISION_LIMITATION in result.registered_training_programs.limitations
    assert supply.NO_MARKET_COVERAGE in result.registered_training_programs.limitations
    assert result.confirmed_training_offerings.value == 0
    assert result.confirmed_training_offerings.unknown_count == 1
    assert result.confirmed_training_offerings.coverage == 0
