"""add lap position

Fast-F1's laps frame carries the driver's position at the end of each lap.
Storing it replaces reconstructing positions from cumulative lap times, which
needs an unbroken chain from lap 1 and so loses a driver's whole line to one
gap in the timing data.

Nullable, and left NULL for every race already ingested: the endpoint falls
back to the old reconstruction where it is absent, so the column fills in
race by race as sessions are re-fetched.

Revision ID: e5b19d3a7c62
Revises: c3f81a2d5e47
Create Date: 2026-09-12 18:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5b19d3a7c62"
down_revision: str | Sequence[str] | None = "c3f81a2d5e47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("lap_times", sa.Column("position", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("lap_times", "position")
