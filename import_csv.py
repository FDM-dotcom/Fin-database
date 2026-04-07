#!/usr/bin/env python3
"""
CLI voor het importeren van bankafschriften.

Gebruik:
    python import_csv.py pad/naar/bestand.csv
    python import_csv.py pad/naar/map/
    python import_csv.py bestand.csv --iban NL69RABO0376834404
    python import_csv.py bestand.csv --categorize       # direct categoriseren na import

Vereisten:
  - .env met DATABASE_URL ingesteld
  - Database is bijgewerkt tot het laatste schema: alembic upgrade head
  - De rekening (IBAN) bestaat al in de accounts-tabel
"""
import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)

from app.categorizer import run_on_all
from app.database import SessionLocal
from app.importers.runner import import_directory, import_file


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Importeer bankafschriften (Rabobank / bunq CSV) naar de financiële database."
    )
    parser.add_argument(
        "path",
        type=Path,
        help="Pad naar een CSV-bestand of een map met CSV-bestanden.",
    )
    parser.add_argument(
        "--iban",
        metavar="IBAN",
        default=None,
        help=(
            "IBAN van de rekening. Overschrijft het IBAN uit de CSV. "
            "Handig als de CSV het eigen IBAN niet bevat."
        ),
    )
    parser.add_argument(
        "--categorize",
        action="store_true",
        help="Categoriseer nieuw geïmporteerde transacties direct na import.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Verwerk het bestand maar sla niets op (test de parser).",
    )
    args = parser.parse_args()

    path: Path = args.path.resolve()

    if not path.exists():
        print(f"Fout: pad bestaat niet: {path}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        if path.is_dir():
            results = import_directory(path, db, account_iban=args.iban)
        else:
            results = [import_file(path, db, account_iban=args.iban)]

        if args.dry_run:
            db.rollback()
            print("Dry-run: geen wijzigingen opgeslagen.")
        else:
            db.commit()

        # Samenvatting import
        print()
        total_in = total_sk = total_err = 0
        for r in results:
            print(r)
            total_in += r.inserted
            total_sk += r.skipped
            total_err += len(r.errors)
            for err in r.errors:
                print(f"  ✗ {err}", file=sys.stderr)

        print(f"\nTotaal: {total_in} ingevoegd, {total_sk} overgeslagen, {total_err} fout(en).")

        # Categoriseren na import
        if args.categorize and not args.dry_run and total_in > 0:
            print("\nCategoriseren...")
            cat_stats = run_on_all(db, overwrite=False)
            db.commit()
            print(
                f"Categorisatie: {cat_stats['changed']} gecategoriseerd, "
                f"{cat_stats['no_match']} zonder match."
            )

        return 0 if total_err == 0 else 1

    except Exception as exc:
        db.rollback()
        print(f"Onverwachte fout: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
