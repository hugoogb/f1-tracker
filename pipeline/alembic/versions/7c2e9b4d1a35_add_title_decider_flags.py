"""add title decider flags

f1db marks the race at which each championship was mathematically settled
(`driversChampionshipDecider` / `constructorsChampionshipDecider`). It is the
only exact source for that before 1991: under the "best N results" rules a
points lead can be unassailable well before the arithmetic on the visible
totals says so, and the N changed from season to season, so it cannot be
re-derived.

Revision ID: 7c2e9b4d1a35
Revises: 5afae14369d7
Create Date: 2026-10-20 22:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c2e9b4d1a35"
down_revision: str | Sequence[str] | None = "5afae14369d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "races",
        sa.Column(
            "drivers_title_decider", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "races",
        sa.Column(
            "constructors_title_decider",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("races", "constructors_title_decider")
    op.drop_column("races", "drivers_title_decider")
