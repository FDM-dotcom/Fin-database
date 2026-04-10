"""Add budget_entries table

Revision ID: 006
Revises: 005
Create Date: 2026-04-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budget_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("year_month", sa.String(7), nullable=False),  # e.g. "2024-01"
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("year_month", "category_id", name="uq_budget_entry"),
    )
    op.create_index("ix_budget_entries_year_month", "budget_entries", ["year_month"])


def downgrade() -> None:
    op.drop_index("ix_budget_entries_year_month", table_name="budget_entries")
    op.drop_table("budget_entries")
