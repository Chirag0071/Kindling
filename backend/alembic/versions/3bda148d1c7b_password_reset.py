"""add password reset tokens table

Revision ID: 3bda148d1c7b
Revises: a9f813420621
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3bda148d1c7b'
down_revision: Union[str, None] = 'a9f813420621'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=False), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_password_reset_tokens_user_id', 'password_reset_tokens', ['user_id'])
    op.create_unique_constraint('uq_password_reset_tokens_token', 'password_reset_tokens', ['token'])
    op.create_index('ix_password_reset_tokens_token', 'password_reset_tokens', ['token'])


def downgrade() -> None:
    op.drop_table('password_reset_tokens')