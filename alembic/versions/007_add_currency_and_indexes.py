"""Voeg currency-kolom en database-indexen toe aan transactions

Revision ID: 007
Revises: 006
Create Date: 2026-04-15

"""
from typing import Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Voeg currency-kolom toe (default EUR, NOT NULL)
    op.add_column(
        "transactions",
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
    )

    # Indexen voor performance
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_index("ix_transactions_category_id", "transactions", ["category_id"])
    op.create_index("ix_transactions_amount", "transactions", ["amount"])


def downgrade() -> None:
    op.drop_index("ix_transactions_amount", table_name="transactions")
    op.drop_index("ix_transactions_category_id", table_name="transactions")
    op.drop_index("ix_transactions_account_id", table_name="transactions")
    op.drop_index("ix_transactions_date", table_name="transactions")
    op.drop_column("transactions", "currency")
