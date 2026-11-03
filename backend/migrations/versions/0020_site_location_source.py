"""Record where a provider's or center's map point came from when it isn't the registry's.

NULL keeps today's meaning: the point came with the record (registry import, seed or the original entry).
'google_geocoding' marks a point moved by `python -m tesda_track.cli geocode-centers`, and 'manual' one an
administrator corrected. Registry refreshes keep both instead of restoring the registry's point.
"""
from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

TABLES = ("training_provider", "assessment_center")


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column("location_source", sa.String(30)))
        op.create_check_constraint("location_source_valid", table,
                                   "location_source IS NULL OR location_source IN ('google_geocoding', 'manual')")


def downgrade():
    for table in TABLES:
        op.drop_constraint(op.f(f"ck_{table}_location_source_valid"), table, type_="check")
        op.drop_column(table, "location_source")
