"""Move roles out of a CHECK constraint and into a table an administrator can add to.

Before this, the role list lived in two places that had to agree: a Literal in tesda_track.rbac and
ck_learner_role_valid. Now app_role holds the roles and the permissions each one grants, learner.role is a
foreign key to it, and the permission vocabulary stays in code because each permission names an endpoint guard.

The six built-in roles are inserted here with exactly the permissions they had before, so existing accounts keep
the access they already have.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

# Frozen copy of tesda_track.rbac.SYSTEM_ROLES as of this revision. Deliberately not imported: a migration has
# to keep describing the past even after the code's vocabulary grows.
SYSTEM_ROLES = [
    ("learner", "Learner", []),
    ("trainer", "Trainer", ["pathways:manage", "training:manage"]),
    ("assessor", "Assessor", ["assessments:manage"]),
    ("verifier", "Verifier", ["verifications:manage"]),
    ("analyst", "Analyst", ["reports:read"]),
    ("admin", "Administrator", ["assessments:manage", "integrations:manage", "mcp:manage", "pathways:manage",
                                "reports:read", "training:manage", "users:manage", "verifications:manage"]),
]
LEGACY_ROLES = "role IN ('learner', 'admin', 'trainer', 'assessor', 'verifier', 'analyst')"


def upgrade():
    app_role = op.create_table("app_role",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("permissions", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_app_role")))
    # The rows have to exist before learner.role can point at them.
    op.bulk_insert(app_role, [{"key": key, "label": label, "description": None, "permissions": permissions,
                               "is_system": True} for key, label, permissions in SYSTEM_ROLES])
    op.drop_constraint(op.f("ck_learner_role_valid"), "learner", type_="check")
    op.alter_column("learner", "role", existing_type=sa.String(length=20), type_=sa.String(length=50),
                    existing_nullable=False)
    op.create_foreign_key(op.f("fk_learner_role_app_role"), "learner", "app_role", ["role"], ["key"],
                          ondelete="RESTRICT")


def downgrade():
    # Roles an administrator composed have no home in the old CHECK constraint, so refuse rather than reassign
    # accounts or drop their access silently.
    custom = op.get_bind().execute(sa.text(
        "SELECT string_agg(DISTINCT role, ', ') FROM learner WHERE NOT (" + LEGACY_ROLES + ")"
    )).scalar()
    if custom:
        raise RuntimeError(f"Accounts still hold roles added after 0017 ({custom}). Move them to a built-in role "
                           f"before downgrading.")
    op.drop_constraint(op.f("fk_learner_role_app_role"), "learner", type_="foreignkey")
    op.alter_column("learner", "role", existing_type=sa.String(length=50), type_=sa.String(length=20),
                    existing_nullable=False)
    op.create_check_constraint(op.f("ck_learner_role_valid"), "learner", LEGACY_ROLES)
    op.drop_table("app_role")
