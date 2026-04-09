"""Add column_mapping_profiles table for wizard mapping persistence

Revision ID: 004
Revises: 003
Create Date: 2026-04-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "column_mapping_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("bank_type", sa.String(50), nullable=False),
        sa.Column("mappings", JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_mapping_profiles_bank_type", "column_mapping_profiles", ["bank_type"])


def downgrade() -> None:
    op.drop_index("ix_mapping_profiles_bank_type", "column_mapping_profiles")
    op.drop_table("column_mapping_profiles")
