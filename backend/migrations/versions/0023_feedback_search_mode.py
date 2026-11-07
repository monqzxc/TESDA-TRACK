"""Record how the learner searched with each recommendation answer: a goal sentence, or a list of skills or jobs.

Answers given before this migration keep NULL: they all came from goal searches, but the column says only what was
recorded.
"""
import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("recommendation_feedback", sa.Column("search_mode", sa.String(10), nullable=True))
    op.create_check_constraint("search_mode_valid", "recommendation_feedback",
                               "search_mode IS NULL OR search_mode IN ('goal', 'skills')")


def downgrade():
    op.drop_constraint(op.f("ck_recommendation_feedback_search_mode_valid"), "recommendation_feedback", type_="check")
    op.drop_column("recommendation_feedback", "search_mode")
