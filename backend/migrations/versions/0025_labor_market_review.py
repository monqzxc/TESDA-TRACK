"""Version-safe occupation evidence, review history and account career-goal selection."""

from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade():
    op.drop_constraint(
        "uq_labor_market_evidence_occurrence_key",
        "labor_market_evidence",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_labor_market_evidence_version_occurrence",
        "labor_market_evidence",
        ["dataset_id", "occurrence_key"],
    )
    op.create_index(
        "ix_labor_market_evidence_occurrence_key",
        "labor_market_evidence",
        ["occurrence_key"],
    )
    op.alter_column(
        "labor_market_mapping",
        "mapping_key",
        type_=sa.String(220),
        existing_type=sa.String(60),
    )
    op.create_table(
        "labor_market_review",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "mapping_id",
            sa.Integer(),
            sa.ForeignKey("labor_market_mapping.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "dataset_id",
            sa.Integer(),
            sa.ForeignKey("labor_market_dataset.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.Uuid(),
            sa.ForeignKey("learner.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("previous", sa.String(30), nullable=False),
        sa.Column("decision", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        *timestamps()
    )
    for col in ["mapping_id", "dataset_id"]:
        op.create_index("ix_labor_market_review_" + col, "labor_market_review", [col])
    op.create_table(
        "career_goal_selection",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "learner_id",
            sa.Uuid(),
            sa.ForeignKey("learner.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("journey_key", sa.Uuid(), nullable=False),
        sa.Column(
            "goal_id",
            sa.Uuid(),
            sa.ForeignKey("goal.id", ondelete="CASCADE"),
            nullable=False,
        ),
        *timestamps(),
        sa.UniqueConstraint(
            "learner_id", "journey_key", name="uq_career_goal_selection_journey"
        )
    )
    op.create_index(
        "ix_career_goal_selection_learner_id", "career_goal_selection", ["learner_id"]
    )
    op.execute(
        "UPDATE app_role SET permissions=array_append(permissions, 'labor-market:review') WHERE key='admin' AND NOT ('labor-market:review'=ANY(permissions))"
    )


def downgrade():
    op.execute(
        "UPDATE app_role SET permissions=array_remove(permissions, 'labor-market:review')"
    )
    op.drop_table("career_goal_selection")
    op.drop_table("labor_market_review")
    # Downgrade is intentionally guarded: remove parallel versions explicitly before restoring a global key.
    op.drop_index(
        "ix_labor_market_evidence_occurrence_key", table_name="labor_market_evidence"
    )
    op.drop_constraint(
        "uq_labor_market_evidence_version_occurrence",
        "labor_market_evidence",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_labor_market_evidence_occurrence_key",
        "labor_market_evidence",
        ["occurrence_key"],
    )
