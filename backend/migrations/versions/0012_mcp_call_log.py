"""The log of every MCP call (shapes only) and the daily counts old rows are folded into."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

OUTCOMES = "'ok', 'tool_error', 'denied_token', 'denied_scope', 'rate_limited', 'invalid_request', 'server_error'"


def upgrade():
    op.create_table(
        "mcp_call_log",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column("called_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=40), nullable=False),
        sa.Column("tool", sa.String(length=64), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=False),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("result_count", sa.Integer(), nullable=True),
        sa.Column("qualification_code", sa.String(length=40), nullable=True),
        sa.Column("region_code", sa.String(length=20), nullable=True),
        sa.Column("inputs_sent", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("goal_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("page_offset", sa.Integer(), nullable=True),
        sa.Column("ranking_audit_id", sa.BigInteger(), nullable=True),
        sa.Column("protocol_version", sa.String(length=20), nullable=True),
        sa.CheckConstraint(f"outcome IN ({OUTCOMES})", name=op.f("ck_mcp_call_log_outcome_known")),
        sa.ForeignKeyConstraint(["client_id"], ["api_client.id"], name=op.f("fk_mcp_call_log_client_id_api_client"),
                                ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["ranking_audit_id"], ["ranking_audit.id"],
                                name=op.f("fk_mcp_call_log_ranking_audit_id_ranking_audit"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mcp_call_log")),
    )
    op.create_index(op.f("ix_mcp_call_log_client_id"), "mcp_call_log", ["client_id"], unique=False)
    op.create_index(op.f("ix_mcp_call_log_called_at"), "mcp_call_log", ["called_at"], unique=False)
    op.create_table(
        "mcp_call_daily",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("tool", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=20), nullable=False),
        sa.Column("calls", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("date", "client_id", "tool", "outcome", name=op.f("pk_mcp_call_daily")),
    )


def downgrade():
    op.drop_table("mcp_call_daily")
    op.drop_index(op.f("ix_mcp_call_log_called_at"), table_name="mcp_call_log")
    op.drop_index(op.f("ix_mcp_call_log_client_id"), table_name="mcp_call_log")
    op.drop_table("mcp_call_log")
