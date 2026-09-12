"""add race session schedule columns

f1db carries the full weekend schedule (practice, qualifying, sprint) as
date/time pairs in UTC, but only for the seasons around the present day. Each
session is stored here as a single naive-UTC timestamp: the pair is always
either both present or both absent in the source, and one column per session
keeps the read path free of date/time recombination.

Revision ID: c3f81a2d5e47
Revises: b7d2f81a6c40
Create Date: 2026-09-12 16:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f81a2d5e47"
down_revision: str | Sequence[str] | None = "b7d2f81a6c40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SESSION_COLUMNS = (
    "fp1_at",
    "fp2_at",
    "fp3_at",
    "qualifying_at",
    "sprint_qualifying_at",
    "sprint_race_at",
)


def upgrade() -> None:
    """Upgrade schema."""
    for column in _SESSION_COLUMNS:
        op.add_column("races", sa.Column(column, sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for column in reversed(_SESSION_COLUMNS):
        op.drop_column("races", column)
