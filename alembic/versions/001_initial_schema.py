"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # accounts
    # ------------------------------------------------------------------
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("iban", sa.String(34), unique=True, nullable=True),
        sa.Column(
            "type",
            sa.Enum("betaalrekening", "spaarrekening", "beleggingsrekening", name="account_type"),
            nullable=False,
        ),
        sa.Column(
            "institution",
            sa.Enum("bunq", "Rabobank", "ING", "ABN AMRO", "De Giro", "Saxo", name="institution_type"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ------------------------------------------------------------------
    # categories  (3-level: categorie > subcategorie > bestemming)
    # ------------------------------------------------------------------
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("category", sa.String(255), nullable=False),
        sa.Column("subcategory", sa.String(255), nullable=True),
        sa.Column("destination", sa.String(255), nullable=True),
        sa.UniqueConstraint("category", "subcategory", "destination", name="uq_category_full"),
    )
    op.create_index("ix_categories_category", "categories", ["category"])

    # ------------------------------------------------------------------
    # labels
    # ------------------------------------------------------------------
    op.create_table(
        "labels",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
    )

    # ------------------------------------------------------------------
    # transactions
    # ------------------------------------------------------------------
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("account_id", sa.Integer, sa.ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("interest_date", sa.Date, nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=True),
        # Tegenpartij
        sa.Column("counterparty_iban", sa.String(34), nullable=True),
        sa.Column("counterparty_name", sa.String(255), nullable=True),
        # Gecombineerde omschrijving (Rabobank Omschrijving-1/2/3 samengevoegd, of bunq Description)
        # Dit is het primaire zoekveld voor categorisatieregels ("Transactiedetails")
        sa.Column("description", sa.Text, nullable=True),
        # Categorisatie
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_internal_transfer", sa.Boolean, nullable=False, server_default=sa.false()),
        # Importbron
        sa.Column(
            "import_source",
            sa.Enum("rabobank", "bunq", "manual", name="import_source_type"),
            nullable=False,
        ),
        # Alle originele kolomwaarden van de bankexport — doorzoekbaar voor categorisatieregels via "raw:<kolomnaam>"
        sa.Column("raw_import_data", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_category_id", "transactions", ["category_id"])
    op.create_index("ix_transactions_counterparty_iban", "transactions", ["counterparty_iban"])
    # GIN-index op JSONB voor zoeken in ruwe importdata
    op.execute("CREATE INDEX ix_transactions_raw_gin ON transactions USING GIN (raw_import_data)")

    # ------------------------------------------------------------------
    # transaction_labels  (many-to-many)
    # ------------------------------------------------------------------
    op.create_table(
        "transaction_labels",
        sa.Column("transaction_id", sa.Integer, sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label_id", sa.Integer, sa.ForeignKey("labels.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("transaction_id", "label_id"),
    )

    # ------------------------------------------------------------------
    # categorization_rules
    # Elke regel heeft een naam, prioriteit, AND/OR-logica en wijst een categorie toe.
    # De condities staan in rule_conditions (één-op-veel).
    # ------------------------------------------------------------------
    op.create_table(
        "categorization_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "priority",
            sa.Integer,
            nullable=False,
            server_default="0",
            comment="Lagere waarde = hogere prioriteit. Regels worden op volgorde geëvalueerd.",
        ),
        sa.Column(
            "logic",
            sa.Enum("AND", "OR", name="rule_logic"),
            nullable=False,
            server_default="AND",
            comment="AND = alle condities moeten matchen; OR = minimaal één conditie.",
        ),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_categorization_rules_priority", "categorization_rules", ["priority"])
    op.create_index("ix_categorization_rules_active", "categorization_rules", ["is_active"])

    # ------------------------------------------------------------------
    # rule_conditions
    # Elke conditie behoort tot één categorisatieregel.
    #
    # field_to_match voorbeelden:
    #   "description"          → Transaction.description  ("Transactiedetails")
    #   "counterparty_name"    → Transaction.counterparty_name
    #   "counterparty_iban"    → Transaction.counterparty_iban
    #   "amount"               → Transaction.amount
    #   "raw:Code"             → Transaction.raw_import_data["Code"]
    #   "raw:Incassant ID"     → Transaction.raw_import_data["Incassant ID"]
    #
    # operators:
    #   contains, notContains, equals, notEquals, startsWith, endsWith,
    #   isEmpty, notEmpty, greaterThan, lessThan, regex
    # ------------------------------------------------------------------
    op.create_table(
        "rule_conditions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("rule_id", sa.Integer, sa.ForeignKey("categorization_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_to_match", sa.String(100), nullable=False),
        sa.Column(
            "operator",
            sa.Enum(
                "contains", "notContains",
                "equals", "notEquals",
                "startsWith", "endsWith",
                "isEmpty", "notEmpty",
                "greaterThan", "lessThan",
                "regex",
                name="condition_operator",
            ),
            nullable=False,
        ),
        # match_value is nullable voor isEmpty / notEmpty operators
        sa.Column("match_value", sa.Text, nullable=True),
    )
    op.create_index("ix_rule_conditions_rule_id", "rule_conditions", ["rule_id"])


def downgrade() -> None:
    op.drop_table("rule_conditions")
    op.drop_table("categorization_rules")
    op.drop_table("transaction_labels")
    op.drop_table("transactions")
    op.drop_table("labels")
    op.drop_table("categories")
    op.drop_table("accounts")
    op.execute("DROP TYPE IF EXISTS condition_operator")
    op.execute("DROP TYPE IF EXISTS rule_logic")
    op.execute("DROP TYPE IF EXISTS import_source_type")
    op.execute("DROP TYPE IF EXISTS institution_type")
    op.execute("DROP TYPE IF EXISTS account_type")
