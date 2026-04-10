"""
Rabobank CSV-importer.

Rabobank-export kenmerken:
  - Encoding: cp1252 (Windows-1252)
  - Scheidingsteken: komma
  - Waarden: dubbel aangehaald
  - Decimaalteken bedrag: komma  (bijv. "-5,45")
  - Datumformaat: YYYY-MM-DD
  - Unieke identifier per transactie: "Volgnr"
  - Omschrijving verdeeld over: "Omschrijving-1", "Omschrijving-2", "Omschrijving-3"
"""
from __future__ import annotations

import csv
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

from app.importers.base import BaseImporter

logger = logging.getLogger(__name__)

# Rabobank-kolomnamen zoals ze in de CSV staan
_RABOBANK_HEADER_MARKER = "IBAN/BBAN"
_ENCODING = "cp1252"


class RabobankImporter(BaseImporter):
    source_name = "rabobank"

    def can_handle(self, path: Path) -> bool:
        """Detecteer Rabobank op basis van de eerste headerkolom."""
        try:
            with path.open(encoding=_ENCODING, errors="replace") as f:
                first_line = f.readline()
            return _RABOBANK_HEADER_MARKER in first_line
        except Exception:
            return False

    def _parse_rows(self, path: Path) -> list[dict]:
        rows = []
        with path.open(encoding=_ENCODING, errors="replace", newline="") as f:
            reader = csv.DictReader(f, delimiter=",", quotechar='"')
            for raw in reader:
                # Sla lege regels over
                if not any(raw.values()):
                    continue
                parsed = self._map_row(raw)
                if parsed is not None:
                    rows.append(parsed)
        return rows

    def _map_row(self, raw: dict) -> Optional[dict]:
        try:
            amount = _parse_dutch_decimal(raw.get("Bedrag", ""))
            balance = _parse_dutch_decimal(raw.get("Saldo na trn", ""))
            # Rabobank gebruikt YYYY-MM-DD, maar probeer ook DD-MM-YYYY als fallback
            trx_date = _parse_date(raw.get("Datum", ""), "%Y-%m-%d", "%d-%m-%Y")
            interest_date = _parse_date(raw.get("Rentedatum", ""), "%Y-%m-%d", "%d-%m-%Y")

            # Omschrijving-1/2/3 samenvoegen en lege onderdelen verwijderen
            description_parts = [
                raw.get("Omschrijving-1", "").strip(),
                raw.get("Omschrijving-2", "").strip(),
                raw.get("Omschrijving-3", "").strip(),
            ]
            description = " ".join(p for p in description_parts if p) or None

            # Volgnr is de unieke identifier per transactie
            external_id = raw.get("Volgnr", "").strip()
            if not external_id:
                raise ValueError("Volgnr ontbreekt — kan transactie niet dedupliceren.")

            return {
                "own_iban": raw.get("IBAN/BBAN", "").strip(),
                "date": trx_date,
                "interest_date": interest_date,
                "amount": amount,
                "balance_after": balance,
                "counterparty_iban": raw.get("Tegenrekening IBAN/BBAN", "").strip() or None,
                "counterparty_name": raw.get("Naam tegenpartij", "").strip() or None,
                "description": description,
                "external_id": external_id,
                # Alle originele velden opslaan voor gebruik in categorisatieregels (raw:<kolomnaam>)
                "raw_import_data": {k: v.strip() for k, v in raw.items()},
            }

        except Exception as exc:
            logger.warning("Rabobank-rij overgeslagen: %s — %s", raw, exc)
            return None


# ------------------------------------------------------------------
# Hulpfuncties
# ------------------------------------------------------------------

def _parse_dutch_decimal(value: str) -> Optional[Decimal]:
    """Zet Nederlandse decimaalnotatie (komma) om naar Decimal."""
    cleaned = value.strip().replace(".", "").replace(",", ".")
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _parse_date(value: str, *fmts: str) -> Optional[date]:
    from datetime import datetime
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
