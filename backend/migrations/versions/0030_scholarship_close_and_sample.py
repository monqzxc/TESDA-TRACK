"""A training program's scholarship gets a close date and a sample-data marker (US-0019).

"Scholarship open" then means one is listed and its close date, if any, hasn't passed. Existing programs keep their
flag, with no close date and not marked as sample.
"""
import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("training_program", sa.Column("scholarship_closes_on", sa.Date(), nullable=True))
    op.add_column("training_program", sa.Column("scholarship_is_sample", sa.Boolean(), nullable=False,
                                                server_default=sa.false()))


def downgrade():
    op.drop_column("training_program", "scholarship_is_sample")
    op.drop_column("training_program", "scholarship_closes_on")
