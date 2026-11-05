"""Learner accounts linked to TESDA Skill Passport: they have no password, and may have no email."""
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from tesda_track.models import Learner, utcnow
from tesda_track.models.identity import TSP_PROVIDER, LearnerIdentity
from tesda_track.schemas.accounts import LearnerPublic


def tsp_learner(session, email=None):
    learner = Learner(email=email, password_hash=None, full_name="Ana Santos", privacy_consent_at=utcnow())
    session.add(learner)
    session.flush()
    return learner


def identity(learner, subject="sso-abc"):
    return LearnerIdentity(provider=TSP_PROVIDER, subject=subject, learner_id=learner.id, scopes=["profile"],
                           profile={}, linked_at=utcnow(), last_signed_in_at=utcnow())


def test_tsp_learner_without_email_or_password_can_be_stored(session):
    learner = tsp_learner(session)
    session.expire_all()
    stored = session.get(Learner, learner.id)
    assert stored.email is None and stored.password_hash is None


def test_password_sign_in_refused_for_tsp_account(client, session):
    tsp_learner(session, email="ana@example.com")
    unknown = client.post("/api/v1/auth/token", data={"username": "nobody@example.com", "password": "anything-at-all"})
    linked = client.post("/api/v1/auth/token", data={"username": "ana@example.com", "password": "anything-at-all"})
    assert linked.status_code == unknown.status_code == 401
    assert linked.json() == unknown.json()


def test_learner_public_allows_no_email(session):
    assert LearnerPublic.model_validate(tsp_learner(session)).email is None


def test_identity_subject_is_unique_per_provider(session):
    session.add(identity(tsp_learner(session)))
    session.flush()
    session.add(identity(tsp_learner(session)))
    with pytest.raises(IntegrityError):
        session.flush()


def test_deleting_the_learner_deletes_the_identity(session):
    learner = tsp_learner(session)
    link = identity(learner)
    session.add(link)
    session.flush()
    link_id: uuid.UUID = link.id
    session.delete(learner)
    session.flush()
    session.expire_all()
    assert session.get(LearnerIdentity, link_id) is None


def test_downgrade_refuses_while_tsp_learners_exist(session):
    """Rolling back must not quietly delete learners and everything they own."""
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    tsp_learner(session)
    config = Config(Path(__file__).resolve().parents[1] / "alembic.ini")
    config.attributes.update(connection=session.connection(), configure_logger=False)
    with pytest.raises(RuntimeError, match="TSP-linked learners exist"):
        command.downgrade(config, "0021")
