"""Service-specific verification, prerequisites and independently observed availability.

Existing rows deliberately remain unknown; active status is not authoritative evidence.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("service_verification",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("training_provider.id", ondelete="CASCADE")),
        sa.Column("center_id", sa.Integer(), sa.ForeignKey("assessment_center.id", ondelete="CASCADE")),
        sa.Column("qualification_id", sa.Integer(), sa.ForeignKey("qualification.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("source_name", sa.String(200)),
        sa.Column("source_reference", sa.String(500)),
        sa.Column("source_record_id", sa.String(200)),
        sa.Column("source_version", sa.String(100)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("review_due_at", sa.DateTime(timezone=True)),
        sa.Column("valid_from", sa.DateTime(timezone=True)),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("is_synthetic", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requirements_reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requirements", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("(provider_id IS NULL) <> (center_id IS NULL)", name="one_site"),
        sa.UniqueConstraint("provider_id", "qualification_id", name="uq_verification_provider_qualification"),
        sa.UniqueConstraint("center_id", "qualification_id", name="uq_verification_center_qualification"),
        sa.CheckConstraint("status IN ('unknown', 'verified', 'unavailable', 'expired')", name="status_valid"),
        sa.CheckConstraint("status <> 'verified' OR (NOT is_synthetic AND source_reference IS NOT NULL "
                           "AND source_name IS NOT NULL AND reviewed_at IS NOT NULL AND review_due_at IS NOT NULL)",
                           name="verified_evidence"),
        sa.CheckConstraint("review_due_at IS NULL OR reviewed_at IS NULL OR review_due_at > reviewed_at", name="review_dates"),
        sa.CheckConstraint("valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from", name="valid_dates"),
    )
    op.create_index("ix_service_verification_qualification_id", "service_verification", ["qualification_id"])
    for table in ("training_program", "assessment_schedule"):
        op.add_column(table, sa.Column("availability_status", sa.String(20), nullable=False, server_default="unknown"))
        op.add_column(table, sa.Column("availability_source", sa.String(500)))
        op.add_column(table, sa.Column("availability_checked_at", sa.DateTime(timezone=True)))
        op.add_column(table, sa.Column("availability_valid_until", sa.DateTime(timezone=True)))
        op.create_check_constraint("availability_status_valid", table,
                                   "availability_status IN ('unknown', 'available', 'unavailable')")
        op.create_check_constraint("availability_evidence", table,
            "availability_status = 'unknown' OR (availability_source IS NOT NULL AND availability_checked_at IS NOT NULL "
            "AND availability_valid_until IS NOT NULL AND availability_valid_until > availability_checked_at)")


def downgrade():
    for table in ("assessment_schedule", "training_program"):
        op.drop_constraint(op.f(f"ck_{table}_availability_evidence"), table, type_="check")
        op.drop_constraint(op.f(f"ck_{table}_availability_status_valid"), table, type_="check")
        for column in ("availability_valid_until", "availability_checked_at", "availability_source", "availability_status"):
            op.drop_column(table, column)
    op.drop_table("service_verification")
