"""Learners' feedback on their recommendation, with the numbers behind it and no goal text or account.

Revision ID: 0005_feedback
Revises: 0004
Create Date: 2026-10-19 12:00:00.000000

Not plain '0005': feature/postgresql-backend uses that ID for match_daily_stat. When the branches meet, join the two
heads with `alembic merge`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0005_feedback'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('recommendation_feedback',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('satisfied', sa.Boolean(), nullable=False),
    sa.Column('reason', sa.String(length=30), nullable=True),
    sa.Column('qualification_id', sa.Integer(), nullable=False),
    sa.Column('query_hash', sa.String(length=64), nullable=False),
    sa.Column('signed_in', sa.Boolean(), nullable=False),
    sa.Column('intent', sa.String(length=40), nullable=False),
    sa.Column('experience_years', sa.Float(), nullable=True),
    sa.Column('has_certification', sa.Boolean(), nullable=True),
    sa.Column('match_count', sa.Integer(), nullable=False),
    sa.Column('rank', sa.Integer(), nullable=True),
    sa.Column('score', sa.Integer(), nullable=True),
    sa.Column('keyword', sa.Float(), nullable=False),
    sa.Column('z_score', sa.Float(), nullable=True),
    sa.Column('model', sa.String(length=100), nullable=True),
    sa.Column('params', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('readiness_score', sa.Float(), nullable=False),
    sa.Column('readiness_level', sa.String(length=30), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("reason IN ('wrong_qualification', 'readiness_off', 'pathway_not_helpful')", name=op.f('ck_recommendation_feedback_reason_valid')),
    sa.CheckConstraint('reason IS NULL OR NOT satisfied', name=op.f('ck_recommendation_feedback_reason_only_when_unsatisfied')),
    sa.ForeignKeyConstraint(['qualification_id'], ['qualification.id'], name=op.f('fk_recommendation_feedback_qualification_id_qualification'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendation_feedback'))
    )
    op.create_index(op.f('ix_recommendation_feedback_qualification_id'), 'recommendation_feedback', ['qualification_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_recommendation_feedback_qualification_id'), table_name='recommendation_feedback')
    op.drop_table('recommendation_feedback')
