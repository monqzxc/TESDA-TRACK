"""Registry ingestion provenance and an explicit unknown program delivery mode."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())]


def upgrade():
    op.create_table("registry_batch", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False, unique=True),
        sa.Column("source_name", sa.String(255), nullable=False), sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False), sa.Column("sheet", sa.String(120), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False), sa.Column("inspected_on", sa.Date(), nullable=False),
        sa.Column("policy_sha256", sa.String(64), nullable=False), sa.Column("summary", JSONB(), nullable=False), *timestamps())
    op.create_table("registry_record", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.Uuid(), sa.ForeignKey("registry_batch.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False), sa.Column("source_record_id", sa.String(300)),
        sa.Column("site_key", sa.String(64), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False), sa.Column("reasons", JSONB(), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("qualification_id", sa.Integer(), sa.ForeignKey("qualification.id", ondelete="RESTRICT")), *timestamps(),
        sa.UniqueConstraint("batch_id", "row_number", name="uq_registry_record_batch_row"))
    op.create_index("ix_registry_record_batch_id", "registry_record", ["batch_id"])
    op.create_table("registry_link", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_kind", sa.String(20), nullable=False), sa.Column("external_key", sa.String(64), nullable=False),
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("training_provider.id", ondelete="RESTRICT")),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("training_program.id", ondelete="RESTRICT")),
        sa.Column("center_id", sa.Integer(), sa.ForeignKey("assessment_center.id", ondelete="RESTRICT")),
        sa.Column("last_snapshot_date", sa.Date(), nullable=False), *timestamps(),
        sa.UniqueConstraint("entity_kind", "external_key", name="uq_registry_link_kind_key"),
        sa.CheckConstraint("(entity_kind = 'provider' AND provider_id IS NOT NULL AND program_id IS NULL AND center_id IS NULL) "
            "OR (entity_kind = 'program' AND provider_id IS NULL AND program_id IS NOT NULL AND center_id IS NULL) "
            "OR (entity_kind = 'center' AND provider_id IS NULL AND program_id IS NULL AND center_id IS NOT NULL)", name="target_valid"))
    op.drop_constraint(op.f("ck_training_program_delivery_mode_valid"), "training_program", type_="check")
    op.create_check_constraint("delivery_mode_valid", "training_program",
        "delivery_mode IN ('institution_based', 'enterprise_based', 'community_based', 'online', 'unknown')")


def downgrade():
    # Downgrading must never relabel an unknown mode as a confirmed mode.
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS(SELECT 1 FROM training_program WHERE delivery_mode='unknown')")).scalar():
        raise RuntimeError("Cannot downgrade while imported programs have unknown delivery modes; reconcile those records first.")
    op.drop_constraint(op.f("ck_training_program_delivery_mode_valid"), "training_program", type_="check")
    op.create_check_constraint("delivery_mode_valid", "training_program",
        "delivery_mode IN ('institution_based', 'enterprise_based', 'community_based', 'online')")
    op.drop_table("registry_link")
    op.drop_index("ix_registry_record_batch_id", table_name="registry_record")
    op.drop_table("registry_record")
    op.drop_table("registry_batch")
