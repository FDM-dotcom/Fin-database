"""Add external_id to transactions for deduplication

Revision ID: 002
Revises: 001
Create Date: 2026-04-07

external_id slaat de bronspecifieke unieke identifier op:
  - Rabobank: Volgnr
  - bunq:     SHA256-hash van datum + bedrag + tegenrekening + omschrijving
  - manual:   None

De combinatie (account_id, external_id) is uniek, zodat dezelfde CSV
meerdere keren geïmporteerd kan worden zonder dubbele records.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("external_id", sa.String(255), nullable=True))
    op.create_unique_constraint(
        "uq_transaction_account_external",
        "transactions",
        ["account_id", "external_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_transaction_account_external", "transactions", type_="unique")
    op.drop_column("transactions", "external_id")
