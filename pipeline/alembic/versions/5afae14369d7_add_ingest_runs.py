"""add ingest runs

The f1db ingestors upsert, so a successful run that lands on a quiet week
writes nothing and leaves the database byte-identical to the week before —
which is exactly what a workflow that silently stopped firing also looks like.
No derived table can answer "did Monday's ingest run?", so this one records the
run itself: when it started, when it finished, whether it worked, and which
f1db release it pulled.

Revision ID: 5afae14369d7
Revises: f3a7c1d9e204
Create Date: 2026-09-17 16:48:34.499727

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5afae14369d7"
down_revision: str | Sequence[str] | None = "f3a7c1d9e204"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ingest_runs",
        sa.Column("id", sa.String(), nullable=False),
        # One of seed.py's target flags, a comma-joined set of them, or "full".
        sa.Column("target", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        # NULL while the run is in flight — and for one that died mid-run, which
        # is the whole point of writing the row before the work starts.
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        # "running" | "ok" | "error"
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("rows_written", sa.Integer(), nullable=True),
        sa.Column("f1db_version", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    # Every read is "the most recent N runs", so the index is ordered that way.
    op.create_index(
        "ix_ingest_runs_started_at_desc",
        "ingest_runs",
        [sa.literal_column("started_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_ingest_runs_started_at_desc", table_name="ingest_runs")
    op.drop_table("ingest_runs")
