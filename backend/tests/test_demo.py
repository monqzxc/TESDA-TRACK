import pytest
from sqlmodel import func, select

from tesda_track.config import get_settings
from tesda_track.demo import DEMO_EMAIL_DOMAIN, DEMO_PREFIX, DemoRefused, load, remove
from tesda_track.models import (AssessmentApplication, AssessmentCenter, AssessmentSchedule, Learner, ReadinessCheck,
                                RecommendationSession, TrainingProgram, TrainingProvider)


def count(session, model, *conditions):
    return session.exec(select(func.count()).select_from(model).where(*conditions)).one()


def test_demo_data_is_clearly_marked_and_covers_every_region(session):
    report = load(session, learners=6)
    providers = session.exec(select(TrainingProvider)).all()
    centers = session.exec(select(AssessmentCenter)).all()
    assert providers and all(p.name.startswith(DEMO_PREFIX) for p in providers)
    assert all(c.name.startswith(DEMO_PREFIX) for c in centers)
    assert {p.region_code for p in providers} == {c.region_code for c in centers}
    assert len({p.region_code for p in providers}) == 18
    learners = session.exec(select(Learner)).all()
    assert len(learners) == 6 and all(l.email.endswith("@" + DEMO_EMAIL_DOMAIN) for l in learners)
    assert all(program.description.endswith("Not a real offering.") for program in session.exec(select(TrainingProgram)))
    assert report.learners == 6 and report.programs == count(session, TrainingProgram)


def test_demo_learners_have_activity_for_reports(session):
    load(session, learners=6)
    assert count(session, RecommendationSession) >= 6
    assert count(session, ReadinessCheck) >= 1
    assert count(session, AssessmentSchedule, AssessmentSchedule.status == "open") >= 18


def test_loading_twice_replaces_rather_than_duplicates(session):
    first = load(session, learners=4)
    second = load(session, learners=4)
    assert count(session, TrainingProvider) == second.providers == first.providers
    assert count(session, Learner) == 4


def test_remove_deletes_only_demo_records(client, session, admin):
    real = client.post("/api/v1/admin/training-providers", headers=admin,
                       json={"name": "Real Institute", "region_code": "NCR"}).json()
    load(session, learners=4)
    removed = remove(session)
    assert removed.providers > 0 and removed.learners == 4
    assert [p.id for p in session.exec(select(TrainingProvider)).all()] == [real["id"]]
    assert count(session, AssessmentCenter) == 0 and count(session, AssessmentApplication) == 0
    assert session.exec(select(Learner).where(Learner.email == "admin@example.com")).first() is not None


def test_demo_data_is_refused_in_production(session, monkeypatch):
    monkeypatch.setattr(get_settings(), "environment", "production")
    with pytest.raises(DemoRefused):
        load(session, learners=1)
    assert count(session, TrainingProvider) == 0
