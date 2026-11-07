"""The TSP email repair accepts both released variants of revision 0022."""
import importlib.util
from datetime import timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text

from tesda_track.models import Learner, utcnow
from tesda_track.models.identity import LearnerIdentity, TspPendingSignIn


@pytest.mark.parametrize("legacy_email", [False, True], ids=["reviewed-0022", "early-0022"])
def test_tsp_email_repair_preserves_pending_sign_ins(session, monkeypatch, legacy_email):
    pending = TspPendingSignIn(id="migration-test", subject="test-subject", scopes=["profile"],
                               profile={"personal_information": {"first_name": "Test"}},
                               expires_at=utcnow() + timedelta(minutes=10))
    session.add(pending)
    linked = Learner(email="legacy-tsp@example.invalid", password_hash=None,
                     full_name="Legacy TSP learner", privacy_consent_at=utcnow())
    ordinary = Learner(email="password@example.invalid", password_hash="existing-password-hash",
                       full_name="Password learner", privacy_consent_at=utcnow())
    session.add_all([linked, ordinary])
    session.flush()
    for learner in (linked, ordinary):
        session.add(LearnerIdentity(provider="tsp", subject=str(learner.id), learner_id=learner.id,
                                    scopes=["profile"], profile={}, linked_at=utcnow(), last_signed_in_at=utcnow()))
    session.flush()
    if legacy_email:
        session.execute(text("ALTER TABLE tsp_pending_sign_in ADD COLUMN email VARCHAR(254)"))
        session.execute(text("UPDATE tsp_pending_sign_in SET email = :email WHERE id = :id"),
                        {"email": "test@example.invalid", "id": pending.id})

    path = Path(__file__).resolve().parents[1] / "migrations/versions/0023_remove_legacy_tsp_email.py"
    spec = importlib.util.spec_from_file_location("tsp_email_repair", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(session.connection())))
    migration.upgrade()
    assert "email" not in {column["name"] for column in inspect(session.connection()).get_columns("tsp_pending_sign_in")}
    session.expire_all()
    assert session.get(Learner, linked.id).email is None
    assert session.get(Learner, ordinary.id).email == "password@example.invalid"
    assert session.get(TspPendingSignIn, "migration-test").profile == {
        "personal_information": {"first_name": "Test"}}
    migration.downgrade()
    assert "email" not in {column["name"] for column in inspect(session.connection()).get_columns("tsp_pending_sign_in")}
