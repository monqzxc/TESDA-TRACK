"""Keep public record provenance without implying a source or expert review date."""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

TABLES = ("qualification", "training_provider", "assessment_center", "training_program", "assessment_schedule")


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column("data_status", sa.String(20), nullable=False, server_default="incomplete"))
        op.add_column(table, sa.Column("source_name", sa.String(255)))
        op.add_column(table, sa.Column("source_reference", sa.String(500)))
        op.add_column(table, sa.Column("source_url", sa.String(1000)))
        op.add_column(table, sa.Column("source_updated_on", sa.Date()))
        op.add_column(table, sa.Column("source_reviewed_at", sa.DateTime(timezone=True)))
        op.create_check_constraint("data_status_valid", table, "data_status IN ('verified', 'incomplete', 'example')")
    # Old fixtures are explicitly examples before the next seed run, including their offerings.
    for table in ("training_provider", "assessment_center"):
        op.execute(sa.text(f"UPDATE {table} SET data_status = 'example', source_name = 'TESDA-TRACK development fixture', "
                           "source_reference = 'backend/seed/delivery_sites.json' WHERE name LIKE '[Seed]%'"))
    op.execute(sa.text("UPDATE training_program SET data_status = 'example' WHERE provider_id IN "
                       "(SELECT id FROM training_provider WHERE data_status = 'example')"))
    op.execute(sa.text("UPDATE assessment_schedule SET data_status = 'example' WHERE center_id IN "
                       "(SELECT id FROM assessment_center WHERE data_status = 'example')"))
    # Preserve available import history for already imported sites. An inspected workbook does
    # not establish a reviewed service, and a non-public workbook has no public URL to invent.
    for table, kind, key in (("training_provider", "provider", "provider_id"),
                             ("assessment_center", "center", "center_id")):
        op.execute(sa.text(f"""
            WITH latest AS (
                SELECT DISTINCT ON (l.{key}) l.{key} AS id, b.source_name, b.snapshot_date,
                       b.sheet || ' · row ' || r.row_number AS reference
                FROM registry_link l JOIN registry_record r ON r.site_key = l.external_key
                JOIN registry_batch b ON b.id = r.batch_id
                WHERE l.entity_kind = '{kind}' AND r.outcome = 'accepted'
                ORDER BY l.{key}, b.snapshot_date DESC, b.created_at DESC, r.row_number
            )
            UPDATE {table} t SET source_name = latest.source_name,
                source_reference = latest.reference, source_updated_on = latest.snapshot_date
            FROM latest WHERE t.id = latest.id AND t.data_status <> 'example'
        """))
    # A provider registration row does not establish the source of every qualification offering,
    # schedule date or fee. Only the known development fixture can be attributed across its rows.
    for table in ("training_program", "assessment_schedule"):
        op.execute(sa.text(f"""
            UPDATE {table} SET source_name = 'TESDA-TRACK development fixture',
                source_reference = 'backend/seed/delivery_sites.json'
            WHERE data_status = 'example'
        """))


def downgrade():
    for table in reversed(TABLES):
        op.drop_constraint(op.f("ck_" + table + "_data_status_valid"), table, type_="check")
        for column in ("source_reviewed_at", "source_updated_on", "source_url", "source_reference", "source_name", "data_status"):
            op.drop_column(table, column)
