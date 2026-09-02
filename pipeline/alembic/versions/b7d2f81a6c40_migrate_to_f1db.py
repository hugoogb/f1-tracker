"""migrate to f1db: drop url columns and pit stop time_of_day

The dataset moved from the jolpica-f1 (Ergast) API to f1db. f1db carries no
Wikipedia URLs and records pit stop duration rather than wall-clock time of
day; neither was rendered by the frontend.

Driver, constructor and circuit references also change from Ergast ids
("hamilton") to f1db ids ("lewis-hamilton"), which requires a full re-seed
rather than an in-place migration.

Revision ID: b7d2f81a6c40
Revises: a1c4e7b2f903
Create Date: 2026-09-02 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d2f81a6c40"
down_revision: str | Sequence[str] | None = "a1c4e7b2f903"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_URL_TABLES = ("seasons", "circuits", "drivers", "constructors", "races")


def upgrade() -> None:
    """Upgrade schema."""
    for table in _URL_TABLES:
        op.drop_column(table, "url")
    op.drop_column("pit_stops", "time_of_day")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column("pit_stops", sa.Column("time_of_day", sa.String(), nullable=True))
    for table in reversed(_URL_TABLES):
        op.add_column(table, sa.Column("url", sa.String(), nullable=True))
