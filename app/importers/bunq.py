"""
bunq CSV-importer.

bunq-export kenmerken:
  - Encoding: UTF-8
  - Scheidingsteken: puntkomma
  - Geen aanhalingstekens om waarden
  - Datumformaat: DD-MM-YYYY
  - HTML-entities in naam tegenpartij (bijv. &amp; → &)
  - Geen ingebouwde unieke identifier → SHA256-hash van sleutelvelden

Bunq-header:
  Date;Interest Date;Amount;Account;Counterparty;Name;Description
"""
from __future__ import annotations

import csv
import hashlib
import html
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

from app.importers.base import BaseImporter

logger = logging.getLogger(__name__)

_BUNQ_HEADER_MARKER = "Interest Date"
_ENCODING = "utf-8"


class BunqImporter(BaseImporter):
    source_name = "bunq"

    def can_handle(self, path: Path) -> bool:
        """Detecteer bunq op basis van de header."""
        try:
            with path.open(encoding=_ENCODING, errors="replace") as f:
                first_line = f.readline()
            return _BUNQ_HEADER_MARKER in first_line and ";" in first_line
        except Exception:
            return False

    def _parse_rows(self, path: Path) -> list[dict]:
        rows = []
        with path.open(encoding=_ENCODING, errors="replace", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            for raw in reader:
                if not any(raw.values()):
                    continue
                parsed = self._map_row(raw)
                if parsed is not None:
                    rows.append(parsed)
        return rows

    def _map_row(self, raw: dict) -> Optional[dict]:
        try:
            # Bunq exporteert DD-MM-YYYY, maar sommige exports gebruiken YYYY-MM-DD
            trx_date = _parse_date(raw.get("Date", ""), "%d-%m-%Y", "%Y-%m-%d")
            interest_date = _parse_date(raw.get("Interest Date", ""), "%d-%m-%Y", "%Y-%m-%d")
            amount = _parse_amount(raw.get("Amount", ""))
            own_iban = raw.get("Account", "").strip()
            counterparty_iban = raw.get("Counterparty", "").strip() or None
            # bunq slaat HTML-entities op in de naam (bijv. &amp;)
            counterparty_name = html.unescape(raw.get("Name", "").strip()) or None
            description = raw.get("Description", "").strip() or None

            # Genereer een stabiele hash als unieke identifier
            external_id = _make_external_id(trx_date, amount, own_iban, counterparty_iban, description)

            return {
                "own_iban": own_iban,
                "date": trx_date,
                "interest_date": interest_date,
                "amount": amount,
                "balance_after": None,  # bunq exporteert geen saldo na transactie
                "counterparty_iban": counterparty_iban,
                "counterparty_name": counterparty_name,
                "description": description,
                "external_id": external_id,
                "raw_import_data": {k: v.strip() for k, v in raw.items() if v is not None},
            }

        except Exception as exc:
            logger.warning("bunq-rij overgeslagen: %s — %s", raw, exc)
            return None


# ------------------------------------------------------------------
# Hulpfuncties
# ------------------------------------------------------------------

def _parse_date(value: str, *fmts: str) -> Optional[date]:
    value = value.strip()
    if not value:
        return None
    for fmt in fmts:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    logger.warning("Kan datum '%s' niet parsen met formaten %s", value, fmts)
    return None


def _parse_amount(value: str) -> Optional[Decimal]:
    cleaned = value.strip().replace(",", ".")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _make_external_id(
    trx_date: Optional[date],
    amount: Optional[Decimal],
    own_iban: str,
    counterparty_iban: Optional[str],
    description: Optional[str],
) -> str:
    """
    Bouw een stabiele SHA256-hash als externe identifier.
    bunq heeft geen Volgnr, dus we hashen de combinatie van sleutelvelden.
    Bij identieke transacties op dezelfde dag (zelfde bedrag, partij, omschrijving)
    zou dit theoretisch kunnen botsen — acceptabel risico voor handmatige correctie.
    """
    raw = "|".join([
        str(trx_date or ""),
        str(amount or ""),
        own_iban or "",
        counterparty_iban or "",
        description or "",
    ])
    return hashlib.sha256(raw.encode()).hexdigest()
