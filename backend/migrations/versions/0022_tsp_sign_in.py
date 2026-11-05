"""Learners signed in through TESDA Skill Passport: their identity link, pending consents and the audit trail.

Such learners have neither a password nor an email, so both columns of learner become nullable. Downgrading is
refused while any exist: the older schema can't hold them, and deleting them would take everything they own.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

EVENTS = "'consent_requested', 'linked', 'signed_in', 'consent_declined', 'uli_mismatch'"


def upgrade():
    op.alter_column("learner", "email", existing_type=sa.String(length=254), nullable=True)
    op.alter_column("learner", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.create_table(
        "learner_identity",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("uli", sa.String(length=64), nullable=True),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("profile", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_signed_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["learner_id"], ["learner.id"], name=op.f("fk_learner_identity_learner_id_learner"),
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_learner_identity")),
        sa.UniqueConstraint("learner_id", name=op.f("uq_learner_identity_learner_id")),
        sa.UniqueConstraint("provider", "subject", name="uq_learner_identity_provider_subject"),
    )
    op.create_table(
        "tsp_pending_sign_in",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("uli", sa.String(length=64), nullable=True),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("profile", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tsp_pending_sign_in")),
    )
    op.create_index(op.f("ix_tsp_pending_sign_in_expires_at"), "tsp_pending_sign_in", ["expires_at"])
    op.create_table(
        "tsp_sign_in_audit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=True),
        sa.Column("event", sa.String(length=30), nullable=False),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.CheckConstraint(f"event IN ({EVENTS})", name=op.f("ck_tsp_sign_in_audit_event_valid")),
        sa.ForeignKeyConstraint(["learner_id"], ["learner.id"], name=op.f("fk_tsp_sign_in_audit_learner_id_learner"),
                                ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tsp_sign_in_audit")),
    )
    op.create_index(op.f("ix_tsp_sign_in_audit_subject"), "tsp_sign_in_audit", ["subject"])


def downgrade():
    if op.get_bind().execute(sa.text(
        "SELECT count(*) FROM learner WHERE password_hash IS NULL OR email IS NULL"
    )).scalar():
        raise RuntimeError("TSP-linked learners exist; delete or migrate them before downgrading 0022.")
    op.drop_index(op.f("ix_tsp_sign_in_audit_subject"), table_name="tsp_sign_in_audit")
    op.drop_table("tsp_sign_in_audit")
    op.drop_index(op.f("ix_tsp_pending_sign_in_expires_at"), table_name="tsp_pending_sign_in")
    op.drop_table("tsp_pending_sign_in")
    op.drop_table("learner_identity")
    op.alter_column("learner", "password_hash", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("learner", "email", existing_type=sa.String(length=254), nullable=False)
