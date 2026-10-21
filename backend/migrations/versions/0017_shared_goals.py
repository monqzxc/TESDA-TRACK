"""After "wrong qualification", the qualification the learner wanted; and the goals learners chose to share.

A shared goal is kept apart from the answer it came with (no link, only the day it was shared), for testing and
training matching after review.
"""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("recommendation_feedback", sa.Column("wanted_qualification_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_recommendation_feedback_wanted_qualification", "recommendation_feedback",
                          "qualification", ["wanted_qualification_id"], ["id"], ondelete="RESTRICT")
    op.create_check_constraint(op.f("ck_recommendation_feedback_wanted_only_when_wrong"), "recommendation_feedback",
                               "wanted_qualification_id IS NULL OR reason = 'wrong_qualification'")
    op.create_table(
        "shared_goal",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("goal", sa.String(length=1000), nullable=False),
        sa.Column("qualification_id", sa.Integer(), nullable=False),
        sa.Column("shown_qualification_id", sa.Integer(), nullable=True),
        sa.Column("consent_version", sa.String(length=20), nullable=False),
        sa.Column("shared_on", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["qualification_id"], ["qualification.id"],
                                name=op.f("fk_shared_goal_qualification_id_qualification"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["shown_qualification_id"], ["qualification.id"],
                                name=op.f("fk_shared_goal_shown_qualification_id_qualification"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shared_goal")),
    )


def downgrade():
    op.drop_table("shared_goal")
    op.drop_constraint(op.f("ck_recommendation_feedback_wanted_only_when_wrong"), "recommendation_feedback",
                       type_="check")
    op.drop_constraint("fk_recommendation_feedback_wanted_qualification", "recommendation_feedback",
                       type_="foreignkey")
    op.drop_column("recommendation_feedback", "wanted_qualification_id")
