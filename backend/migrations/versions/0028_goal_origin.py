"""Record where a goal came from: typed by the learner, or a TSP profile suggestion they tapped.

Adds funnel_daily_stat (per-day totals by origin and step, nothing a learner typed) and a nullable origin on
recommendation sessions and feedback answers. Existing rows keep NULL: they were recorded before the origin was,
so they are unknown rather than typed.
"""
import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

ORIGINS = "'typed', 'suggestion'"
EVENTS = "'suggestions_shown', 'suggestions_empty', 'goal_started', 'readiness_checked'"


def upgrade():
    op.create_table(
        "funnel_daily_stat",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("origin", sa.String(length=10), nullable=False),
        sa.Column("event", sa.String(length=30), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.CheckConstraint(f"origin IN ({ORIGINS})", name=op.f("ck_funnel_daily_stat_origin_valid")),
        sa.CheckConstraint(f"event IN ({EVENTS})", name=op.f("ck_funnel_daily_stat_event_valid")),
        sa.PrimaryKeyConstraint("date", "origin", "event", name=op.f("pk_funnel_daily_stat")),
    )
    for table in ("recommendation_session", "recommendation_feedback"):
        op.add_column(table, sa.Column("origin", sa.String(length=10), nullable=True))
        op.create_check_constraint(op.f(f"ck_{table}_origin_valid"), table,
                                   f"origin IS NULL OR origin IN ({ORIGINS})")


def downgrade():
    for table in ("recommendation_feedback", "recommendation_session"):
        op.drop_constraint(op.f(f"ck_{table}_origin_valid"), table, type_="check")
        op.drop_column(table, "origin")
    op.drop_table("funnel_daily_stat")
