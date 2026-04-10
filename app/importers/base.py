"""
Basis-importeerklasse. Elke bankimporter erft hiervan.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Account, AccountAlias, AccountType, InstitutionType, Transaction

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    source: str
    file: str
    inserted: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return (
            f"[{self.source}] {self.file}: "
            f"{self.inserted} ingevoegd, {self.skipped} overgeslagen"
            + (f", {len(self.errors)} fouten" if self.errors else "")
        )


class BaseImporter(ABC):
    """Abstracte basisklasse voor CSV-importeurs."""

    source_name: str = ""

    @abstractmethod
    def can_handle(self, path: Path) -> bool:
        """Geeft True als dit bestand door deze importer verwerkt kan worden."""

    @abstractmethod
    def _parse_rows(self, path: Path) -> list[dict]:
        """
        Leest het CSV-bestand en geeft een lijst van genormaliseerde dicts terug.
        Elk dict bevat de sleutels die Transaction verwacht, plus 'raw_import_data'.
        """

    def run(self, path: Path, db: Session, account_iban: Optional[str] = None) -> ImportResult:
        """
        Verwerkt een CSV-bestand en schrijft nieuwe transacties naar de database.

        Args:
            path:          pad naar het CSV-bestand
            db:            actieve database-sessie
            account_iban:  optioneel IBAN om de rekening op te zoeken;
                           als None wordt het IBAN uit de CSV gebruikt.
        """
        result = ImportResult(source=self.source_name, file=path.name)

        try:
            rows = self._parse_rows(path)
        except Exception as exc:
            result.errors.append(f"Kan bestand niet lezen: {exc}")
            return result

        # Laad alle IBAN-aliassen eenmalig voor naamverrijking
        aliases: dict[str, str] = {
            a.iban: a.display_name for a in db.query(AccountAlias).all()
        }

        for row in rows:
            try:
                iban = account_iban or row.get("own_iban")
                account = self._resolve_or_create_account(db, iban, self.source_name)
                if account is None:
                    msg = f"Geen rekening-IBAN gevonden in rij — sla import over."
                    if msg not in result.errors:
                        result.errors.append(msg)
                    result.skipped += 1
                    continue

                # Datum en bedrag zijn verplicht — sla rij over als ze ontbreken
                if row.get("date") is None:
                    result.errors.append(
                        f"Datum ontbreekt of ongeldig (rij overgeslagen): "
                        f"external_id={row.get('external_id', '?')}"
                    )
                    result.skipped += 1
                    continue
                if row.get("amount") is None:
                    result.errors.append(
                        f"Bedrag ontbreekt of ongeldig (rij overgeslagen): "
                        f"external_id={row.get('external_id', '?')}"
                    )
                    result.skipped += 1
                    continue

                if self._already_exists(db, account.id, row["external_id"]):
                    result.skipped += 1
                    continue

                # Verrijk naam tegenpartij vanuit IBAN-alias als de CSV die niet bevat
                cp_iban = row.get("counterparty_iban") or None
                cp_name = row.get("counterparty_name") or None
                if cp_name is None and cp_iban:
                    cp_name = aliases.get(cp_iban)

                trx = Transaction(
                    account_id=account.id,
                    date=row["date"],
                    interest_date=row.get("interest_date"),
                    amount=row["amount"],
                    balance_after=row.get("balance_after"),
                    counterparty_iban=cp_iban,
                    counterparty_name=cp_name,
                    description=row.get("description") or None,
                    is_internal_transfer=False,
                    import_source=self.source_name,
                    raw_import_data=row["raw_import_data"],
                    external_id=row["external_id"],
                )
                db.add(trx)
                db.flush()
                result.inserted += 1

            except Exception as exc:
                result.errors.append(f"Rij overgeslagen ({exc}): {row}")
                result.skipped += 1

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            result.errors.append(f"Fout bij opslaan: {exc}")
            result.inserted = 0

        return result

    # ------------------------------------------------------------------
    # Hulpfuncties
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_account(db: Session, iban: Optional[str]) -> Optional[Account]:
        if not iban:
            return None
        return db.query(Account).filter(Account.iban == iban.strip()).first()

    @staticmethod
    def _resolve_or_create_account(
        db: Session, iban: Optional[str], source_name: str = ""
    ) -> Optional[Account]:
        """Zoek rekening op IBAN op, of maak een nieuwe aan als het IBAN onbekend is."""
        if not iban:
            return None
        iban = iban.strip()
        account = db.query(Account).filter(Account.iban == iban).first()
        if account:
            return account

        # Automatisch aanmaken — banktype bepaalt instelling
        _INSTITUTION_MAP = {
            "rabobank": InstitutionType.rabobank,
            "bunq":     InstitutionType.bunq,
            "ing":      InstitutionType.ing,
            "abn_amro": InstitutionType.abn_amro,
        }
        institution = _INSTITUTION_MAP.get(source_name.lower(), InstitutionType.ing)

        account = Account(
            name=iban,   # Gebruiker kan naam later aanpassen
            iban=iban,
            type=AccountType.betaalrekening,
            institution=institution,
        )
        db.add(account)
        db.flush()
        logger.info("Nieuw account automatisch aangemaakt voor IBAN %s (%s)", iban, institution.value)
        return account

    @staticmethod
    def _already_exists(db: Session, account_id: int, external_id: str) -> bool:
        return (
            db.query(Transaction)
            .filter(
                Transaction.account_id == account_id,
                Transaction.external_id == external_id,
            )
            .first()
            is not None
        )
