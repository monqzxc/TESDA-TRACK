"""Durable, account-scoped retry receipts for learner writes."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("write_receipt",
        sa.Column("learner_id", sa.Uuid(), sa.ForeignKey("learner.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("operation", sa.String(40), primary_key=True),
        sa.Column("request_id", sa.Uuid(), primary_key=True),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False))


def downgrade():
    op.drop_table("write_receipt")
