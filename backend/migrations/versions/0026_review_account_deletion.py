"""Preserve review history without blocking the existing account deletion workflow."""

from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(
        "fk_labor_market_review_actor_id_learner",
        "labor_market_review",
        type_="foreignkey",
    )
    op.alter_column(
        "labor_market_review", "actor_id", existing_type=sa.Uuid(), nullable=True
    )
    op.create_foreign_key(
        "fk_labor_market_review_actor_id_learner",
        "labor_market_review",
        "learner",
        ["actor_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    # A deleted account cannot be reconstructed; NOT NULL refuses unsafe reversal.
    op.alter_column(
        "labor_market_review", "actor_id", existing_type=sa.Uuid(), nullable=False
    )
    op.drop_constraint(
        "fk_labor_market_review_actor_id_learner",
        "labor_market_review",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_labor_market_review_actor_id_learner",
        "labor_market_review",
        "learner",
        ["actor_id"],
        ["id"],
        ondelete="RESTRICT",
    )
