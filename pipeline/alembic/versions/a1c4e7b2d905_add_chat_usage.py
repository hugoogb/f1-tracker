"""add chat usage

The Race Engineer chat keeps one row per request: model, token counts, cost,
tool calls, outcome and a per-day salted hash of the caller. It is the budget
and the rate counter as well as the ledger. It never holds content: no
question, no answer, no path, no raw IP and no error text.

Revision ID: a1c4e7b2d905
Revises: 7c2e9b4d1a35
Create Date: 2026-10-26 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c4e7b2d905"
down_revision: str | Sequence[str] | None = "7c2e9b4d1a35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "chat_usage",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_write_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("tool_calls", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("ip_hash", sa.String(), nullable=False),
        sa.Column("thumbs", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_usage_created_at", "chat_usage", ["created_at"], unique=False)
    op.create_index(
        "ix_chat_usage_ip_hash_created_at",
        "chat_usage",
        ["ip_hash", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_chat_usage_ip_hash_created_at", table_name="chat_usage")
    op.drop_index("ix_chat_usage_created_at", table_name="chat_usage")
    op.drop_table("chat_usage")
