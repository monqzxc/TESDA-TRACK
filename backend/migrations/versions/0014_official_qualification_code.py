"""TESDA's official qualification codes, linked to the TESDA-TRACK qualifications they stand for."""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "official_qualification_code",
        sa.Column("official_code", sa.String(length=20), nullable=False),
        sa.Column("qualification_id", sa.Integer(), nullable=False),
        sa.Column("relation", sa.String(length=20), nullable=False),
        sa.Column("official_title", sa.String(length=200), nullable=False),
        sa.Column("level", sa.String(length=5), nullable=False),
        sa.Column("promulgated", sa.Date(), nullable=True),
        sa.Column("enabled_in_t2mis", sa.Boolean(), nullable=False),
        sa.CheckConstraint("relation IN ('same', 'covers', 'superseded_by')",
                           name=op.f("ck_official_qualification_code_relation_valid")),
        sa.ForeignKeyConstraint(["qualification_id"], ["qualification.id"],
                                name=op.f("fk_official_qualification_code_qualification_id_qualification"),
                                ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("official_code", "qualification_id", name=op.f("pk_official_qualification_code")),
    )
    op.create_index(op.f("ix_official_qualification_code_qualification_id"), "official_qualification_code",
                    ["qualification_id"])


def downgrade():
    op.drop_table("official_qualification_code")
