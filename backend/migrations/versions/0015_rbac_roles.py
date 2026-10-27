"""Expand account roles without changing existing assignments."""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(op.f("ck_learner_role_valid"), "learner", type_="check")
    op.create_check_constraint(op.f("ck_learner_role_valid"), "learner",
                               "role IN ('learner', 'admin', 'trainer', 'assessor', 'verifier', 'analyst')")


def downgrade():
    # Never silently promote or erase staff assignments on rollback.
    if op.get_bind().execute(sa.text(
        "SELECT count(*) FROM learner WHERE role NOT IN ('learner', 'admin')"
    )).scalar():
        raise RuntimeError("Reassign staff accounts to learner or admin before downgrading RBAC.")
    op.drop_constraint(op.f("ck_learner_role_valid"), "learner", type_="check")
    op.create_check_constraint(op.f("ck_learner_role_valid"), "learner", "role IN ('learner', 'admin')")
