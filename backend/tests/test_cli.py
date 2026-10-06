from sqlmodel import select

from tesda_track.cli import create_or_promote_admin
from tesda_track.models import Learner


def test_creates_an_admin_who_can_log_in(client, session, login):
    create_or_promote_admin(session, email="Admin@Example.com", full_name="Pilot Admin",
                            password="correct horse battery")
    session.flush()
    headers = login("admin@example.com")
    assert client.get("/api/v1/me", headers=headers).json()["role"] == "admin"


def test_promotes_an_existing_learner_without_changing_their_password(session, register, login):
    register("juan@example.com")
    create_or_promote_admin(session, email="juan@example.com", full_name="ignored", password=None)
    session.flush()
    learner = session.exec(select(Learner).where(Learner.email == "juan@example.com")).one()
    assert learner.role == "admin" and learner.full_name == "Juan Dela Cruz"
    assert login("juan@example.com")
