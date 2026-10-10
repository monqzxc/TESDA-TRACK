"""Per-day goal-matching counters (requests and no-match), with no learner text or identifiers.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('match_daily_stat',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('requests', sa.Integer(), nullable=False),
    sa.Column('no_match', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('date', name=op.f('pk_match_daily_stat'))
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('match_daily_stat')
