"""Rankings run for a partner client record which client asked."""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ranking_audit", sa.Column("api_client_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(op.f("fk_ranking_audit_api_client_id_api_client"), "ranking_audit", "api_client",
                          ["api_client_id"], ["id"], ondelete="RESTRICT")
    op.create_index(op.f("ix_ranking_audit_api_client_id"), "ranking_audit", ["api_client_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_ranking_audit_api_client_id"), table_name="ranking_audit")
    op.drop_constraint(op.f("fk_ranking_audit_api_client_id_api_client"), "ranking_audit", type_="foreignkey")
    op.drop_column("ranking_audit", "api_client_id")
