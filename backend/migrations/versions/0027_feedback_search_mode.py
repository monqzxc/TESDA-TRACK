"""Record how the learner searched with each recommendation answer: a goal sentence, or a list of skills or jobs.

Answers given before this migration keep NULL: they all came from goal searches, but the column says only what was
recorded.

This migration was numbered 0023 on the branch it was written on, and reached main beside another 0023
(0023_remove_legacy_tsp_email), which left Alembic two heads it couldn't upgrade. It now runs after 0026. A database
that ran it under the old number already has the column and its rule, so both are added only where they're missing.
"""
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE recommendation_feedback ADD COLUMN IF NOT EXISTS search_mode VARCHAR(10)")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint
                           WHERE conname = 'ck_recommendation_feedback_search_mode_valid') THEN
                ALTER TABLE recommendation_feedback ADD CONSTRAINT ck_recommendation_feedback_search_mode_valid
                    CHECK (search_mode IS NULL OR search_mode IN ('goal', 'skills'));
            END IF;
        END $$
    """)


def downgrade():
    op.drop_constraint(op.f("ck_recommendation_feedback_search_mode_valid"), "recommendation_feedback", type_="check")
    op.drop_column("recommendation_feedback", "search_mode")
