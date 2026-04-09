"""
Import-runner: detecteert automatisch het formaat en importeert een of meerdere CSV's.
Bevat ook preview_file() voor een dry-run vóór de daadwerkelijke import.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.importers.base import BaseImporter, ImportResult
from app.importers.bunq import BunqImporter
from app.importers.rabobank import RabobankImporter
from app.models import Transaction

logger = logging.getLogger(__name__)

# Volgorde bepaalt welke importer als eerste wordt geprobeerd
_IMPORTERS = [
    RabobankImporter(),
    BunqImporter(),
]

# Statische kolomkoppeling per bronformaat (CSV-kolomnaam → weergavenaam)
_COLUMN_MAPPINGS: dict[str, dict[str, str]] = {
    "rabobank": {
        "IBAN/BBAN":                "Eigen rekening",
        "Datum":                    "Datum",
        "Rentedatum":               "Rentedatum",
        "Bedrag":                   "Bedrag",
        "Saldo na trn":             "Saldo na transactie",
        "Tegenrekening IBAN/BBAN":  "Tegenrekening IBAN",
        "Naam tegenpartij":         "Naam tegenpartij",
        "Omschrijving-1":           "Omschrijving (deel 1)",
        "Omschrijving-2":           "Omschrijving (deel 2)",
        "Omschrijving-3":           "Omschrijving (deel 3)",
        "Volgnr":                   "Volgnummer (unieke ID)",
        "Code":                     "Transactiecode",
    },
    "bunq": {
        "Date":          "Datum",
        "Interest Date": "Rentedatum",
        "Amount":        "Bedrag",
        "Account":       "Eigen rekening",
        "Counterparty":  "Tegenrekening IBAN",
        "Name":          "Naam tegenpartij",
        "Description":   "Omschrijving",
    },
}


def import_file(
    path: Path,
    db: Session,
    account_iban: Optional[str] = None,
) -> ImportResult:
    """
    Detecteer het bankformaat en importeer het bestand.

    Args:
        path:          pad naar het CSV-bestand
        db:            actieve database-sessie
        account_iban:  overschrijft het IBAN uit de CSV (handig als de CSV dat niet bevat)

    Returns:
        ImportResult met aantallen ingevoegd / overgeslagen / fouten
    """
    for importer in _IMPORTERS:
        if importer.can_handle(path):
            logger.info("Formaat gedetecteerd: %s voor '%s'", importer.source_name, path.name)
            return importer.run(path, db, account_iban=account_iban)

    return ImportResult(
        source="onbekend",
        file=path.name,
        errors=[
            f"Onbekend CSV-formaat: '{path.name}'. "
            "Ondersteunde formaten: Rabobank, bunq."
        ],
    )


def preview_file(
    path: Path,
    db: Session,
    account_iban: Optional[str] = None,
) -> dict:
    """
    Parseer een CSV-bestand zonder iets naar de database te schrijven.

    Geeft terug:
    - Gedetecteerd formaat
    - Kolomkoppeling (CSV-kolomnaam → weergavenaam)
    - Totaal aantal rijen / nieuw / al aanwezig / onbekende rekening
    - Eerste 5 voorbeeldrijen (zonder raw_import_data)

    Duplicaatdetectie gebeurt via één batch IN-query.
    """
    for importer in _IMPORTERS:
        if importer.can_handle(path):
            try:
                rows = importer._parse_rows(path)
            except Exception as exc:
                return {
                    "format": importer.source_name,
                    "error": f"Kan bestand niet lezen: {exc}",
                    "total_rows": 0, "new": 0, "duplicates": 0,
                    "unknown_account": 0, "column_mapping": {}, "sample": [],
                }

            # Bepaal het IBAN van de eigen rekening (eerste rij)
            own_iban = account_iban or (rows[0].get("own_iban") if rows else None)
            account = BaseImporter._resolve_account(db, own_iban)

            # Batch-controle op al bestaande externe ID's
            if account and rows:
                external_ids = [r["external_id"] for r in rows if r.get("external_id")]
                existing_ids: set[str] = set()
                if external_ids:
                    existing_ids = {
                        t.external_id
                        for t in db.query(Transaction.external_id)
                        .filter(
                            Transaction.account_id == account.id,
                            Transaction.external_id.in_(external_ids),
                        )
                        .all()
                        if t.external_id
                    }
            else:
                existing_ids = set()

            new_count = 0
            dup_count = 0
            unknown_count = 0

            for row in rows:
                if account is None:
                    unknown_count += 1
                elif row.get("external_id") in existing_ids:
                    dup_count += 1
                else:
                    new_count += 1

            # Voorbeeldrijen — raw_import_data weglaten (te groot)
            sample = [
                {
                    "date":              str(r.get("date") or ""),
                    "amount":            str(r.get("amount") or ""),
                    "counterparty_name": r.get("counterparty_name"),
                    "counterparty_iban": r.get("counterparty_iban"),
                    "description":       r.get("description"),
                }
                for r in rows[:5]
            ]

            return {
                "format":         importer.source_name,
                "total_rows":     len(rows),
                "new":            new_count,
                "duplicates":     dup_count,
                "unknown_account": unknown_count,
                "column_mapping": _COLUMN_MAPPINGS.get(importer.source_name, {}),
                "sample":         sample,
                "own_iban":       own_iban or "",
                "account_found":  account is not None,
            }

    return {
        "format": "onbekend",
        "total_rows": 0, "new": 0, "duplicates": 0, "unknown_account": 0,
        "column_mapping": {}, "sample": [],
        "error": f"Onbekend CSV-formaat: '{path.name}'. Ondersteunde formaten: Rabobank, bunq.",
    }


def import_directory(
    directory: Path,
    db: Session,
    account_iban: Optional[str] = None,
    glob: str = "*.csv",
) -> list[ImportResult]:
    """
    Importeer alle CSV-bestanden in een map.
    Bestanden worden alfabetisch gesorteerd verwerkt (oudste datum eerst als bestandsnaam dat bevat).
    """
    files = sorted(directory.glob(glob))
    if not files:
        logger.warning("Geen CSV-bestanden gevonden in '%s'", directory)
        return []

    results = []
    for f in files:
        result = import_file(f, db, account_iban=account_iban)
        results.append(result)
        logger.info(str(result))
    return results
