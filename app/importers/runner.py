"""
Import-runner: detecteert automatisch het formaat en importeert een of meerdere CSV's.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.importers.base import ImportResult
from app.importers.bunq import BunqImporter
from app.importers.rabobank import RabobankImporter

logger = logging.getLogger(__name__)

# Volgorde bepaalt welke importer als eerste wordt geprobeerd
_IMPORTERS = [
    RabobankImporter(),
    BunqImporter(),
]


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
