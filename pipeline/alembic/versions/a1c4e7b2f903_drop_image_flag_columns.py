"""drop has_headshot and has_logo columns

Driver headshots and constructor logos were removed from the project: their
sources (OpenF1, TheSportsDB, Wikimedia Commons) each carried separate licence
and trademark obligations. The UI now renders initials on the team color, so
these flags have no remaining consumer.

Revision ID: a1c4e7b2f903
Revises: 88d74c1cf0b8
Create Date: 2026-09-02 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c4e7b2f903"
down_revision: str | Sequence[str] | None = "88d74c1cf0b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("drivers", "has_headshot")
    op.drop_column("constructors", "has_logo")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "constructors",
        sa.Column("has_logo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "drivers",
        sa.Column("has_headshot", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
