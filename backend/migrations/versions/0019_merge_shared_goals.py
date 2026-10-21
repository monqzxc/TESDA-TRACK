"""Join dynamic roles and record provenance with shared recommendation goals.

Both lines start at 0016 and change separate tables or columns. Databases on 0018 apply
0017_shared_goals before this merge; databases on 0017_shared_goals apply 0017 and 0018 first.

Main originally called its shared-goal revision 0017, which collided with dynamic roles.
That revision is now 0017_shared_goals. A database stamped 0017 by the original main line
needs its actual schema checked and version history reconciled before upgrading; do not
interpret that stamp as proof that dynamic roles were applied.
"""

revision = "0019"
down_revision = ("0018", "0017_shared_goals")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
