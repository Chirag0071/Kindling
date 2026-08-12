"""add end-to-end encryption support (public keys + encrypted messages)

Revision ID: a9f813420621
Revises: ba149881e599
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9f813420621'
down_revision: Union[str, None] = 'ba149881e599'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('public_key', sa.Text(), nullable=True))

    op.add_column('messages', sa.Column('is_encrypted', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('messages', sa.Column('iv', sa.String(), nullable=True))
    op.add_column('messages', sa.Column('encrypted_key_user1', sa.Text(), nullable=True))
    op.add_column('messages', sa.Column('encrypted_key_user2', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'encrypted_key_user2')
    op.drop_column('messages', 'encrypted_key_user1')
    op.drop_column('messages', 'iv')
    op.drop_column('messages', 'is_encrypted')

    op.drop_column('users', 'public_key')