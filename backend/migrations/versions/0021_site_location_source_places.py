"""Allow 'google_places': a map point found by searching Google Maps for the center's name.

`python -m tesda_track.cli geocode-centers --by-name` writes it; registry refreshes keep such points like the
geocoded and hand-corrected ones.
"""
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

TABLES = ("training_provider", "assessment_center")


def _replace_check(table: str, values: str) -> None:
    op.drop_constraint(op.f(f"ck_{table}_location_source_valid"), table, type_="check")
    op.create_check_constraint("location_source_valid", table, f"location_source IS NULL OR location_source IN ({values})")


def upgrade():
    for table in TABLES:
        _replace_check(table, "'google_geocoding', 'google_places', 'manual'")


def downgrade():
    for table in TABLES:
        op.execute(f"UPDATE {table} SET location_source = 'google_geocoding' WHERE location_source = 'google_places'")
        _replace_check(table, "'google_geocoding', 'manual'")
