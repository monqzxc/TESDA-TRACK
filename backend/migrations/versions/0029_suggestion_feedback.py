"""Anonymous per-result ratings and wrong-suggestion reports."""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "suggestion_feedback",
        sa.Column("receipt", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(6), nullable=False),
        sa.Column("result_kind", sa.String(13), nullable=False),
        sa.Column("result_key", sa.String(40), nullable=False),
        sa.Column("result_name", sa.Text(), nullable=False),
        sa.Column("qualification_code", sa.String(40), nullable=True),
        sa.Column("helpful", sa.Boolean(), nullable=True),
        sa.Column("reason", sa.String(24), nullable=True),
        sa.Column("shared_goal", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "result_kind IN ('qualification', 'training', 'assessment')",
            name=op.f("ck_suggestion_feedback_kind_valid"),
        ),
        sa.CheckConstraint(
            "(action = 'rating' AND helpful IS NOT NULL AND reason IS NULL AND shared_goal IS NULL) OR "
            "(action = 'report' AND helpful IS NULL AND reason IS NOT NULL AND reason IN "
            "('wrong_qualification', 'wrong_center', 'outdated_information', 'not_relevant', 'other'))",
            name=op.f("ck_suggestion_feedback_action_valid"),
        ),
        sa.PrimaryKeyConstraint("receipt", "action", name=op.f("pk_suggestion_feedback")),
    )


def downgrade():
    op.drop_table("suggestion_feedback")
