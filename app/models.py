"""
SQLAlchemy ORM models — spiegelen exact het Alembic-schema in 001_initial_schema.py.

Regels voor uitbreiden:
  1. Voeg kolommen/tabellen toe in dit bestand
  2. Genereer een migratie:  alembic revision --autogenerate -m "omschrijving"
  3. Controleer de gegenereerde migratie in alembic/versions/
  4. Voer uit:               alembic upgrade head
"""
import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ------------------------------------------------------------------
# Enums
# ------------------------------------------------------------------

class AccountType(str, enum.Enum):
    betaalrekening = "betaalrekening"
    spaarrekening = "spaarrekening"
    beleggingsrekening = "beleggingsrekening"


class InstitutionType(str, enum.Enum):
    bunq = "bunq"
    rabobank = "Rabobank"
    ing = "ING"
    abn_amro = "ABN AMRO"
    de_giro = "De Giro"
    saxo = "Saxo"


class ImportSourceType(str, enum.Enum):
    rabobank = "rabobank"
    bunq = "bunq"
    manual = "manual"


class RuleLogic(str, enum.Enum):
    AND = "AND"
    OR = "OR"


class ConditionOperator(str, enum.Enum):
    contains = "contains"
    not_contains = "notContains"
    equals = "equals"
    not_equals = "notEquals"
    starts_with = "startsWith"
    ends_with = "endsWith"
    is_empty = "isEmpty"
    not_empty = "notEmpty"
    greater_than = "greaterThan"
    less_than = "lessThan"
    regex = "regex"


# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------

class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    iban: Mapped[Optional[str]] = mapped_column(String(34), unique=True, nullable=True)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType, name="account_type"), nullable=False)
    institution: Mapped[InstitutionType] = mapped_column(Enum(InstitutionType, name="institution_type"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="account")


class Category(Base):
    """
    Driestaps-hiërarchie: categorie → subcategorie → bestemming
    Voorbeeld: "Boodschappen" → "Supermarkt" → "Albert Heijn"
    """
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("category", "subcategory", "destination", name="uq_category_full"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    subcategory: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="category")
    rules: Mapped[List["CategorizationRule"]] = relationship("CategorizationRule", back_populates="category")


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    transaction_labels: Mapped[List["TransactionLabel"]] = relationship("TransactionLabel", back_populates="label")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="uq_transaction_account_external"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    interest_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    counterparty_iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    counterparty_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Gecombineerde omschrijving — dit is het "Transactiedetails" veld in de categorisatieregels.
    # Bij Rabobank: Omschrijving-1 + Omschrijving-2 + Omschrijving-3 samengevoegd.
    # Bij bunq: Description.
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    is_internal_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    import_source: Mapped[ImportSourceType] = mapped_column(Enum(ImportSourceType, name="import_source_type"), nullable=False)
    # Alle originele velden van de bankexport. Benaderbaar in regels via "raw:<kolomnaam>".
    raw_import_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Bronspecifieke unieke ID: Rabobank Volgnr, of SHA256-hash voor bunq.
    # Samen met account_id uniek → voorkomt dubbele imports.
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Vrije notitie per transactie — invulbaar via de Transacties-pagina.
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account: Mapped["Account"] = relationship("Account", back_populates="transactions")
    category: Mapped[Optional["Category"]] = relationship("Category", back_populates="transactions")
    transaction_labels: Mapped[List["TransactionLabel"]] = relationship(
        "TransactionLabel", back_populates="transaction", cascade="all, delete-orphan"
    )


class TransactionLabel(Base):
    __tablename__ = "transaction_labels"

    transaction_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True)
    label_id: Mapped[int] = mapped_column(Integer, ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True)

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="transaction_labels")
    label: Mapped["Label"] = relationship("Label", back_populates="transaction_labels")


class AccountAlias(Base):
    """
    IBAN → weergavenaam mapping voor tegenpartijrekeningen.

    Wordt toegepast tijdens import: als een transactie een tegenpartij-IBAN
    heeft maar geen naam, wordt de alias opgezocht en gebruikt.
    """
    __tablename__ = "account_aliases"

    iban: Mapped[str] = mapped_column(String(34), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ColumnMappingProfile(Base):
    """
    Opgeslagen kolomkoppelingsprofielen voor de importwizard.
    De mappings worden opgeslagen als JSONB-array van objecten:
    [{targetColumn, sourceColumns, separator}]
    """
    __tablename__ = "column_mapping_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_type: Mapped[str] = mapped_column(String(50), nullable=False)
    mappings: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CategorizationRule(Base):
    """
    Categorisatieregel met AND/OR logica over meerdere condities.

    Evaluatievolgorde: laagste priority-waarde wordt eerst geëvalueerd.
    De eerste matchende regel wint en wijst de categorie toe.
    """
    __tablename__ = "categorization_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    logic: Mapped[RuleLogic] = mapped_column(Enum(RuleLogic, name="rule_logic"), nullable=False, default=RuleLogic.AND)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    category: Mapped["Category"] = relationship("Category", back_populates="rules")
    conditions: Mapped[List["RuleCondition"]] = relationship(
        "RuleCondition", back_populates="rule", cascade="all, delete-orphan"
    )


class RuleCondition(Base):
    """
    Één conditie binnen een categorisatieregel.

    field_to_match verwijst naar een transactieveld:
      "description"          → Transaction.description  (= "Transactiedetails" in de UI)
      "counterparty_name"    → Transaction.counterparty_name
      "counterparty_iban"    → Transaction.counterparty_iban
      "amount"               → Transaction.amount
      "raw:Code"             → Transaction.raw_import_data["Code"]
      "raw:Incassant ID"     → Transaction.raw_import_data["Incassant ID"]
      "raw:Naam tegenpartij" → Transaction.raw_import_data["Naam tegenpartij"]

    match_value is None voor isEmpty / notEmpty operators.
    """
    __tablename__ = "rule_conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(Integer, ForeignKey("categorization_rules.id", ondelete="CASCADE"), nullable=False)
    field_to_match: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[ConditionOperator] = mapped_column(Enum(ConditionOperator, name="condition_operator"), nullable=False)
    match_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    rule: Mapped["CategorizationRule"] = relationship("CategorizationRule", back_populates="conditions")
