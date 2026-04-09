"""Add account_aliases table for IBAN → display name mapping

Revision ID: 003
Revises: 002
Create Date: 2026-04-09

account_aliases slaat een weergavenaam op per IBAN (tegenpartij).
Wordt gebruikt tijdens import om counterparty_name te verrijken als
de CSV geen naam bevat. IBAN is de natural primary key.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "account_aliases",
        sa.Column("iban", sa.String(34), primary_key=True, nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("account_aliases")
