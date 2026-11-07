"""Remove the temporary email column from the early deployed 0022 schema.

The reviewed 0022 migration never creates this column. Earlier builds did, so
this forward repair supports both existing deployments and fresh installations.
"""
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tsp_pending_sign_in DROP COLUMN IF EXISTS email")
    # Early builds also copied the address into newly created, passwordless TSP
    # accounts. Preserve ordinary password accounts and remove only that legacy copy.
    op.execute("""
        UPDATE learner SET email = NULL
        WHERE password_hash IS NULL
          AND EXISTS (
              SELECT 1 FROM learner_identity
              WHERE learner_identity.learner_id = learner.id
                AND learner_identity.provider = 'tsp'
          )
    """)


def downgrade():
    # The canonical 0022 schema also has no email column. Do not restore contact data.
    pass
