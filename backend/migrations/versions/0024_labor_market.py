"""Labor-market information: imported dataset versions, their occupation evidence, and reviewed qualification links.

Nothing in matching, rankings or readiness reads these tables.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def _timestamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade():
    op.create_table(
        "labor_market_dataset",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("publisher", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("publication_label", sa.String(100)),
        sa.Column("publication_date", sa.Date()),
        sa.Column("evidence_class", sa.String(30), nullable=False),
        sa.Column("geographic_scope", sa.String(20), nullable=False),
        sa.Column("region_code", sa.String(20), sa.ForeignKey("region.code", ondelete="RESTRICT",
                                                              name=op.f("fk_labor_market_dataset_region_code_region"))),
        sa.Column("period_label", sa.String(100)),
        sa.Column("period_start_year", sa.Integer()),
        sa.Column("period_end_year", sa.Integer()),
        sa.Column("source_url", sa.String(1000), nullable=False),
        sa.Column("source_url_kind", sa.String(100)),
        sa.Column("file_sha256", sa.String(64)),
        sa.Column("input_sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=False),
        sa.Column("validation", postgresql.JSONB(), nullable=False),
        sa.Column("notes", sa.Text()),
        *_timestamps(),
        sa.CheckConstraint("evidence_class IN ('national_forecast', 'regional_forecast', 'observed_posting', "
                           "'historical_forecast', 'historical_statistics')", name="evidence_class_valid"),
        sa.CheckConstraint("geographic_scope IN ('national', 'regional', 'local')", name="geographic_scope_valid"),
        sa.CheckConstraint("status IN ('active', 'retired')", name="status_valid"),
        sa.CheckConstraint("period_end_year IS NULL OR period_start_year IS NULL OR period_end_year >= period_start_year",
                           name="period_ordered"),
        sa.UniqueConstraint("key", name=op.f("uq_labor_market_dataset_key")),
    )
    op.create_index(op.f("ix_labor_market_dataset_source_id"), "labor_market_dataset", ["source_id"])

    op.create_table(
        "labor_market_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dataset_id", sa.Integer(), sa.ForeignKey(
            "labor_market_dataset.id", ondelete="CASCADE",
            name=op.f("fk_labor_market_evidence_dataset_id_labor_market_dataset")), nullable=False),
        sa.Column("occurrence_key", sa.String(64), nullable=False),
        sa.Column("source_record_id", sa.String(100), nullable=False),
        sa.Column("occupation_title", sa.String(300), nullable=False),
        sa.Column("normalized_title", sa.String(300), nullable=False),
        sa.Column("sector", sa.String(300)),
        sa.Column("classification", sa.String(30), nullable=False),
        sa.Column("geographic_scope", sa.String(20), nullable=False),
        sa.Column("region_code", sa.String(20), sa.ForeignKey("region.code", ondelete="RESTRICT",
                                                              name=op.f("fk_labor_market_evidence_region_code_region"))),
        sa.Column("locality", sa.String(120)),
        sa.Column("period_label", sa.String(100)),
        sa.Column("observed_on", sa.Date()),
        sa.Column("page_pdf", sa.String(20)),
        sa.Column("page_printed", sa.String(20)),
        sa.Column("source_table", sa.String(500)),
        sa.Column("source_url", sa.String(1000)),
        sa.Column("verification", sa.String(200)),
        sa.Column("provenance", postgresql.JSONB(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint("classification IN ('in_demand', 'hard_to_fill', 'cross_cutting', 'observed_posting')",
                           name="classification_valid"),
        sa.CheckConstraint("geographic_scope IN ('national', 'regional', 'local')", name="geographic_scope_valid"),
        sa.UniqueConstraint("occurrence_key", name=op.f("uq_labor_market_evidence_occurrence_key")),
    )
    for column in ("dataset_id", "source_record_id", "normalized_title", "region_code"):
        op.create_index(op.f(f"ix_labor_market_evidence_{column}"), "labor_market_evidence", [column])

    op.create_table(
        "labor_market_mapping",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mapping_key", sa.String(60), nullable=False),
        sa.Column("evidence_id", sa.Integer(), sa.ForeignKey(
            "labor_market_evidence.id", ondelete="CASCADE",
            name=op.f("fk_labor_market_mapping_evidence_id_labor_market_evidence")), nullable=False),
        sa.Column("qualification_id", sa.Integer(), sa.ForeignKey(
            "qualification.id", ondelete="RESTRICT",
            name=op.f("fk_labor_market_mapping_qualification_id_qualification")), nullable=False),
        sa.Column("proposal", sa.String(20), nullable=False),
        sa.Column("evidence_tier", sa.String(60)),
        sa.Column("review_reason", sa.Text()),
        sa.Column("competencies", postgresql.JSONB(), nullable=False),
        sa.Column("training_regulation_url", sa.String(1000)),
        sa.Column("training_regulation_reference", sa.String(300)),
        sa.Column("cautions", sa.Text()),
        sa.Column("decision", sa.String(20), nullable=False),
        sa.Column("decided_by", sa.Uuid(), sa.ForeignKey("learner.id", ondelete="SET NULL",
                                                          name="fk_labor_market_mapping_decided_by_learner")),
        sa.Column("decided_by_label", sa.String(254)),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decision_note", sa.Text()),
        *_timestamps(),
        sa.CheckConstraint("proposal IN ('high_confidence', 'needs_review', 'rejected')", name="proposal_valid"),
        sa.CheckConstraint("decision IN ('pending', 'approved', 'rejected')", name="decision_valid"),
        sa.CheckConstraint("NOT (proposal = 'rejected' AND decision = 'approved')", name="rejected_never_approved"),
        sa.UniqueConstraint("mapping_key", name=op.f("uq_labor_market_mapping_mapping_key")),
        sa.UniqueConstraint("evidence_id", "qualification_id", name="uq_labor_market_mapping_pair"),
    )
    for column in ("evidence_id", "qualification_id", "decision"):
        op.create_index(op.f(f"ix_labor_market_mapping_{column}"), "labor_market_mapping", [column])


def downgrade():
    op.drop_table("labor_market_mapping")
    op.drop_table("labor_market_evidence")
    op.drop_table("labor_market_dataset")
