"""
Categorisatie-engine.

Evalueert alle actieve regels (op volgorde van prioriteit) tegen een transactie
en kent de eerste matchende categorie toe. Eerste match wint.

Ondersteunde velden in field_to_match:
  description          → Transaction.description
  counterparty_name    → Transaction.counterparty_name
  counterparty_iban    → Transaction.counterparty_iban
  amount               → Transaction.amount  (numeriek)
  import_source        → Transaction.import_source
  raw:<kolomnaam>      → Transaction.raw_import_data["<kolomnaam>"]
                         bijv. raw:Code, raw:Incassant ID

Ondersteunde operators:
  Tekst:     contains, notContains, equals, notEquals, startsWith, endsWith, regex
  Aanwezig:  isEmpty, notEmpty
  Numeriek:  greaterThan, lessThan  (ook bruikbaar voor bedrag > 0 = inkomst)
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import CategorizationRule, Category, ConditionOperator, RuleCondition, RuleLogic, Transaction

logger = logging.getLogger(__name__)


@dataclass
class CategorizationResult:
    transaction_id: int
    category_id: Optional[int]
    category_name: Optional[str]
    matched_rule: Optional[str]
    was_changed: bool


class Categorizer:
    """
    Laadt alle actieve regels eenmalig in geheugen en categoriseert transacties.
    Maak één instantie per batch — niet opnieuw laden per transactie.
    """

    def __init__(self, db: Session):
        self._rules: list[CategorizationRule] = (
            db.query(CategorizationRule)
            .filter(CategorizationRule.is_active.is_(True))
            .options(
                joinedload(CategorizationRule.conditions),
                joinedload(CategorizationRule.category),
            )
            .order_by(CategorizationRule.priority.asc())
            .all()
        )
        logger.info("Categorisatie-engine geladen: %d actieve regels.", len(self._rules))

    def categorize_transaction(self, transaction: Transaction) -> Optional[Category]:
        """
        Geeft de eerste matchende categorie terug, of None als geen regel matcht.
        Wijzigt de transactie NIET — dat doet de aanroeper.
        """
        for rule in self._rules:
            if not rule.conditions:
                continue
            if self._rule_matches(rule, transaction):
                return rule.category
        return None

    def apply(self, transaction: Transaction, overwrite: bool = False) -> CategorizationResult:
        """
        Past categorisatie toe op één transactie.

        Args:
            transaction: de te categoriseren transactie
            overwrite:   als False, worden al gecategoriseerde transacties overgeslagen
        """
        already_set = transaction.category_id is not None
        if already_set and not overwrite:
            return CategorizationResult(
                transaction_id=transaction.id,
                category_id=transaction.category_id,
                category_name=None,
                matched_rule=None,
                was_changed=False,
            )

        category = self.categorize_transaction(transaction)
        was_changed = category is not None and (
            not already_set or transaction.category_id != category.id
        )
        if was_changed:
            transaction.category_id = category.id

        matched_rule = None
        if category is not None:
            for rule in self._rules:
                if rule.category_id == category.id and self._rule_matches(rule, transaction):
                    matched_rule = rule.name
                    break

        return CategorizationResult(
            transaction_id=transaction.id,
            category_id=category.id if category else None,
            category_name=(
                f"{category.category}"
                + (f" › {category.subcategory}" if category.subcategory else "")
                + (f" › {category.destination}" if category.destination else "")
                if category else None
            ),
            matched_rule=matched_rule,
            was_changed=was_changed,
        )

    # ------------------------------------------------------------------
    # Regeleval
    # ------------------------------------------------------------------

    def _rule_matches(self, rule: CategorizationRule, transaction: Transaction) -> bool:
        results = [
            self._condition_matches(cond, transaction)
            for cond in rule.conditions
        ]
        if not results:
            return False
        if rule.logic == RuleLogic.AND:
            return all(results)
        return any(results)  # OR

    def _condition_matches(self, cond: RuleCondition, transaction: Transaction) -> bool:
        field_value = _get_field_value(cond.field_to_match, transaction)
        try:
            return _apply_operator(cond.operator, field_value, cond.match_value)
        except Exception as exc:
            logger.debug(
                "Conditie-evaluatie mislukt (regel %s, veld '%s'): %s",
                cond.rule_id, cond.field_to_match, exc,
            )
            return False


# ------------------------------------------------------------------
# Batch-functies
# ------------------------------------------------------------------

def run_on_all(
    db: Session,
    overwrite: bool = False,
    account_id: Optional[int] = None,
) -> dict[str, int]:
    """
    Categoriseert alle (ongecategoriseerde) transacties.

    Args:
        db:         database-sessie
        overwrite:  als True, worden bestaande categorieën overschreven
        account_id: limiteer tot één rekening (optioneel)

    Returns:
        dict met 'changed', 'skipped', 'no_match'
    """
    categorizer = Categorizer(db)

    query = db.query(Transaction)
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if not overwrite:
        query = query.filter(Transaction.category_id.is_(None))

    transactions = query.all()
    logger.info("Categoriseren: %d transacties.", len(transactions))

    stats = {"changed": 0, "skipped": 0, "no_match": 0}
    for trx in transactions:
        result = categorizer.apply(trx, overwrite=overwrite)
        if result.was_changed:
            stats["changed"] += 1
            logger.debug(
                "Trx #%d → %s (regel: %s)", trx.id, result.category_name, result.matched_rule
            )
        elif result.category_id is not None and not result.was_changed:
            stats["skipped"] += 1
        else:
            stats["no_match"] += 1

    db.commit()
    return stats


# ------------------------------------------------------------------
# Veld- en operator-hulpfuncties
# ------------------------------------------------------------------

def _get_field_value(field: str, transaction: Transaction):
    """Haal de waarde op van het opgegeven veld van een transactie."""
    if field.startswith("raw:"):
        key = field[4:]
        raw = transaction.raw_import_data or {}
        return raw.get(key)

    # Standaard transactievelden
    field_map = {
        "description": transaction.description,
        "counterparty_name": transaction.counterparty_name,
        "counterparty_iban": transaction.counterparty_iban,
        "amount": transaction.amount,
        "import_source": transaction.import_source,
    }
    return field_map.get(field)


def _apply_operator(operator: ConditionOperator, value, match_value: Optional[str]) -> bool:
    """Pas een operator toe op een waarde."""
    op = operator if isinstance(operator, str) else operator.value

    # --- Aanwezigheidsoperatoren (geen match_value nodig) ---
    if op == ConditionOperator.is_empty or op == "isEmpty":
        return value is None or str(value).strip() == ""
    if op == ConditionOperator.not_empty or op == "notEmpty":
        return value is not None and str(value).strip() != ""

    # --- Numerieke operatoren ---
    if op in (ConditionOperator.greater_than, "greaterThan", ConditionOperator.less_than, "lessThan"):
        try:
            num_value = Decimal(str(value))
            num_match = Decimal(str(match_value))
        except (InvalidOperation, TypeError):
            return False
        if op in (ConditionOperator.greater_than, "greaterThan"):
            return num_value > num_match
        return num_value < num_match

    # --- Tekstoperatoren (case-insensitief) ---
    str_value = str(value).lower() if value is not None else ""
    str_match = str(match_value).lower() if match_value is not None else ""

    if op in (ConditionOperator.contains, "contains"):
        return str_match in str_value
    if op in (ConditionOperator.not_contains, "notContains"):
        return str_match not in str_value
    if op in (ConditionOperator.equals, "equals"):
        return str_value == str_match
    if op in (ConditionOperator.not_equals, "notEquals"):
        return str_value != str_match
    if op in (ConditionOperator.starts_with, "startsWith"):
        return str_value.startswith(str_match)
    if op in (ConditionOperator.ends_with, "endsWith"):
        return str_value.endswith(str_match)
    if op in (ConditionOperator.regex, "regex"):
        try:
            return bool(re.search(str(match_value), str(value) if value else "", re.IGNORECASE))
        except re.error:
            logger.warning("Ongeldige regex: '%s'", match_value)
            return False

    logger.warning("Onbekende operator: '%s'", op)
    return False
