"""Exercise the feature upgrade on legacy rows only inside the rolled-back test transaction."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text


def test_upgrade_0006_to_0007_preserves_legacy_owned_records(client, learner, session):
    saved = client.post("/api/v1/me/recommendations", headers=learner, json={"query": "I want to be a welder"})
    assert saved.status_code == 201
    record_id = saved.json()["id"]
    ranking = client.post("/api/v1/recommendations/training", headers=learner, json={"qualification_code": "SMAW-NC-II"})
    assert ranking.status_code == 200
    audit_id = ranking.json()["audit_id"]
    root = Path(__file__).resolve().parents[2]
    config = Config(root / "backend" / "alembic.ini")
    config.attributes["connection"] = session.get_bind()
    config.attributes["configure_logger"] = False
    command.downgrade(config, "0006")
    assert session.execute(text("SELECT count(*) FROM recommendation_session WHERE id=:id"), {"id": record_id}).scalar() == 1
    assert session.execute(text("SELECT count(*) FROM ranking_audit WHERE id=:id"), {"id": audit_id}).scalar() == 1
    command.upgrade(config, "head")
    session.expire_all()
    from alembic.script import ScriptDirectory
    assert session.execute(text("SELECT version_num FROM alembic_version")).scalar() == ScriptDirectory.from_config(config).get_current_head()
    snapshot = client.get(f"/api/v1/me/recommendations/{record_id}", headers=learner)
    assert snapshot.status_code == 200 and snapshot.json()["assessment_id"] is None
    export = client.get("/api/v1/me/export", headers=learner).json()
    assert export["training_rankings"][0]["audit_id"] == audit_id
    assert export["learner_assessments"] == []
    assessment = client.post("/api/v1/learner-assessments", headers=learner, json={"answers": {"interests": ["welding"]}})
    assert assessment.status_code == 201
