"""Centers a learner bookmarks, with the qualification they were exploring, so My Progress can list them."""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "saved_center",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("learner_id", sa.Uuid(), nullable=False),
        sa.Column("training_provider_id", sa.Integer(), nullable=True),
        sa.Column("assessment_center_id", sa.Integer(), nullable=True),
        sa.Column("qualification_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("(training_provider_id IS NULL) <> (assessment_center_id IS NULL)",
                           name=op.f("ck_saved_center_one_site")),
        sa.ForeignKeyConstraint(["learner_id"], ["learner.id"], ondelete="CASCADE",
                                name=op.f("fk_saved_center_learner_id_learner")),
        sa.ForeignKeyConstraint(["training_provider_id"], ["training_provider.id"], ondelete="CASCADE",
                                name=op.f("fk_saved_center_training_provider_id_training_provider")),
        sa.ForeignKeyConstraint(["assessment_center_id"], ["assessment_center.id"], ondelete="CASCADE",
                                name=op.f("fk_saved_center_assessment_center_id_assessment_center")),
        sa.ForeignKeyConstraint(["qualification_id"], ["qualification.id"], ondelete="SET NULL",
                                name=op.f("fk_saved_center_qualification_id_qualification")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_saved_center")),
        sa.UniqueConstraint("learner_id", "training_provider_id", name="uq_saved_center_learner_provider"),
        sa.UniqueConstraint("learner_id", "assessment_center_id", name="uq_saved_center_learner_assessment"),
    )
    op.create_index(op.f("ix_saved_center_learner_id"), "saved_center", ["learner_id"])


def downgrade():
    op.drop_index(op.f("ix_saved_center_learner_id"), table_name="saved_center")
    op.drop_table("saved_center")
