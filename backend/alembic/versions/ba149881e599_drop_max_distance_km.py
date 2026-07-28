"""drop max_distance_km column - distance filter removed

Revision ID: ba149881e599
Revises: 98ff6cec292a
Create Date: 2026-07-27 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba149881e599'
down_revision: Union[str, None] = '98ff6cec292a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('profiles', 'max_distance_km')


def downgrade() -> None:
    op.add_column('profiles', sa.Column('max_distance_km', sa.Integer(), nullable=True, server_default='50'))
