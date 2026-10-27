"""Partner API clients that sign in to the MCP server with the client credentials grant."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("api_client",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("organisation", sa.String(length=200), nullable=False),
        sa.Column("contact_email", sa.String(length=254), nullable=True),
        sa.Column("declared_purpose", sa.Text(), nullable=False),
        sa.Column("expected_tools", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("scopes", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False),
        sa.Column("secret_hash", sa.String(length=255), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_token_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("rate_limit_per_minute > 0", name=op.f("ck_api_client_rate_limit_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_api_client")),
        sa.UniqueConstraint("name", name=op.f("uq_api_client_name")))


def downgrade():
    op.drop_table("api_client")
