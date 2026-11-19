"""US-0017 AC8: the December 2 demo shows labelled sample centers while TESDA's approval of its lists is pending."""
import pytest
from sqlmodel import func, select

from tesda_track.config import get_settings
from tesda_track.models import AssessmentCenter, AssessmentSchedule, Region, TrainingProgram, TrainingProvider
from tesda_track.sample_centers import SAMPLE_PREFIX, SOURCE_NAME, load, remove
from tesda_track.sample_scholarships import SAMPLE_CLOSED_ON
from tesda_track.services import catalog, center_listing


def count(session, model, *conditions):
    return session.exec(select(func.count()).select_from(model).where(*conditions)).one()


@pytest.fixture
def sample_mode(monkeypatch, app):
    settings = get_settings().model_copy(update={"center_data": "sample"})
    monkeypatch.setattr(center_listing, "get_settings", lambda: settings)
    app.dependency_overrides[get_settings] = lambda: settings
    yield settings
    app.dependency_overrides.pop(get_settings, None)


def test_sample_centers_are_labelled_and_cover_every_region(session):
    report = load(session)
    regions = count(session, Region)
    qualifications = len(catalog.active_qualifications(session))
    providers = session.exec(select(TrainingProvider)).all()
    centers = session.exec(select(AssessmentCenter)).all()
    assert len(providers) == report.providers == 2 * regions and len(centers) == report.centers == regions
    for record in [*providers, *centers]:
        assert record.name.startswith(SAMPLE_PREFIX)
        assert (record.data_status, record.source_name) == ("example", SOURCE_NAME)
        assert record.contact_email is None and record.contact_phone is None
    assert report.programs == count(session, TrainingProgram) == regions * qualifications
    assert report.schedules == count(session, AssessmentSchedule) == regions * qualifications
    assert all(p.description.endswith("Not a real offering.") for p in session.exec(select(TrainingProgram)))


def test_loading_twice_replaces_and_remove_keeps_official_records(client, session, make_provider):
    official = make_provider(name="Official Welding Institute")
    first = load(session)
    second = load(session)
    assert count(session, TrainingProvider) == second.providers + 1 == first.providers + 1
    removed = remove(session)
    assert removed.providers == first.providers and removed.centers == first.centers
    assert [p.id for p in session.exec(select(TrainingProvider)).all()] == [official["id"]]


def test_official_mode_never_lists_the_sample_set(client, session, make_provider):
    official = make_provider(name="Official Welding Institute")
    load(session)
    session.commit()
    providers = client.get("/api/v1/training-providers").json()
    assert [p["id"] for p in providers] == [official["id"]]
    assert client.get("/api/v1/assessment-centers").json() == []
    assert client.get("/api/v1/client-config").json()["center_data"] == "official"


def test_sample_mode_lists_only_sample_centers_labelled_as_examples(client, session, make_provider, sample_mode):
    make_provider(name="Official Welding Institute")
    load(session)
    session.commit()
    providers = client.get("/api/v1/training-providers").json()
    centers = client.get("/api/v1/assessment-centers").json()
    assert providers and all(p["name"].startswith(SAMPLE_PREFIX) for p in providers)
    assert centers and all(c["name"].startswith(SAMPLE_PREFIX) for c in centers)
    assert {p["provenance"]["status"] for p in [*providers, *centers]} == {"example"}
    assert {p["provenance"]["source_name"] for p in providers} == {SOURCE_NAME}
    assert client.get("/api/v1/client-config").json()["center_data"] == "sample"


def test_sample_programs_carry_labelled_sample_scholarships_some_already_closed(client, session, sample_mode):
    """QA BUG-02 (US-0019): the demo shows "Scholarship open" on sample centers, labelled as sample data, and hides it
    once a scholarship has closed."""
    load(session)
    session.commit()
    programs = session.exec(select(TrainingProgram)).all()
    assert all(p.scholarship_available and p.scholarship_is_sample for p in programs)
    closed = [p for p in programs if p.scholarship_closes_on == SAMPLE_CLOSED_ON]
    assert 0 < len(closed) < len(programs) / 3
    listed, offset = [], 0
    while page := client.get("/api/v1/training-programs", params={"limit": 100, "offset": offset}).json():
        listed += page
        offset += 100
    assert listed and all(p["scholarship_is_sample"] for p in listed)
    open_now = {p["scholarship_open"] for p in listed}
    assert open_now == {True, False}
    by_qualification = {}
    for p in listed:
        by_qualification.setdefault(p["qualification"]["code"], set()).add(p["scholarship_open"])
    assert all(True in states for states in by_qualification.values())
