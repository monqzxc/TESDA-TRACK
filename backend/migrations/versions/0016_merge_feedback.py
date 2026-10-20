"""Join the recommendation feedback line (0005_feedback, from the React frontend) to the main line.

Both started from 0004 and touch different tables, so there is nothing to do but make them one head again. A
database at 0005_feedback upgrades through 0005-0015 and then here; one at 0015 runs 0005_feedback first.
"""

revision = "0016"
down_revision = ("0015", "0005_feedback")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
