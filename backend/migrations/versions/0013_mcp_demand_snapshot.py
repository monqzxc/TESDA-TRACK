"""Frozen quarterly demand figures served to partners."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mcp_demand_snapshot",
        sa.Column("quarter", sa.String(length=7), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rows", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("quarter", name=op.f("pk_mcp_demand_snapshot")),
    )


def downgrade():
    op.drop_table("mcp_demand_snapshot")
