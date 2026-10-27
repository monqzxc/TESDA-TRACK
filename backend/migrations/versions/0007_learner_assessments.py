"""Immutable structured learner assessment revisions and saved recommendation references."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("learner_assessment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("learner_id", sa.Uuid(), sa.ForeignKey("learner.id", ondelete="CASCADE"), nullable=False),
        sa.Column("series_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("previous_revision_id", sa.Uuid(), sa.ForeignKey("learner_assessment.id", ondelete="SET NULL")),
        sa.Column("answers", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("series_id", "revision", name="uq_assessment_series_revision"),
        sa.CheckConstraint("revision > 0", name="revision_positive"))
    op.create_index("ix_learner_assessment_learner_id", "learner_assessment", ["learner_id"])
    op.create_index("ix_learner_assessment_series_id", "learner_assessment", ["series_id"])
    op.add_column("recommendation_session", sa.Column("assessment_id", sa.Uuid()))
    op.create_foreign_key("fk_recommendation_session_assessment_id_learner_assessment", "recommendation_session",
                          "learner_assessment", ["assessment_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_recommendation_session_assessment_id", "recommendation_session", ["assessment_id"])
    op.add_column("ranking_audit", sa.Column("assessment_id", sa.Uuid()))
    op.create_foreign_key("fk_ranking_audit_assessment_id_learner_assessment", "ranking_audit", "learner_assessment",
                          ["assessment_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_ranking_audit_assessment_id", "ranking_audit", ["assessment_id"])


def downgrade():
    op.drop_index("ix_ranking_audit_assessment_id", table_name="ranking_audit")
    op.drop_constraint("fk_ranking_audit_assessment_id_learner_assessment", "ranking_audit", type_="foreignkey")
    op.drop_column("ranking_audit", "assessment_id")
    op.drop_index("ix_recommendation_session_assessment_id", table_name="recommendation_session")
    op.drop_constraint("fk_recommendation_session_assessment_id_learner_assessment", "recommendation_session", type_="foreignkey")
    op.drop_column("recommendation_session", "assessment_id")
    op.drop_table("learner_assessment")
