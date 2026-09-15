"""add constructor lineages

f1db renames a constructor rather than carrying one row through a rebrand, so a
single continuous entry — Tyrrell through to Mercedes, Stewart through to Red
Bull — is spread across several constructors. Its `chronology` field describes
those chains; this table stores them so the site can show one.

Revision ID: f3a7c1d9e204
Revises: e5b19d3a7c62
Create Date: 2026-09-15 19:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a7c1d9e204"
down_revision: str | Sequence[str] | None = "e5b19d3a7c62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "constructor_lineages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("lineage_ref", sa.String(), nullable=False),
        sa.Column("constructor_id", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("year_from", sa.Integer(), nullable=False),
        sa.Column("year_to", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["constructor_id"], ["constructors.id"]),
        sa.PrimaryKeyConstraint("id"),
        # The slot, not the constructor: a team can hold several slots in its
        # own chain (Sauber -> BMW Sauber -> Sauber -> Audi).
        sa.UniqueConstraint("lineage_ref", "position"),
    )
    op.create_index(
        op.f("ix_constructor_lineages_lineage_ref"),
        "constructor_lineages",
        ["lineage_ref"],
        unique=False,
    )
    op.create_index(
        op.f("ix_constructor_lineages_constructor_id"),
        "constructor_lineages",
        ["constructor_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_constructor_lineages_constructor_id"), table_name="constructor_lineages"
    )
    op.drop_index(op.f("ix_constructor_lineages_lineage_ref"), table_name="constructor_lineages")
    op.drop_table("constructor_lineages")
