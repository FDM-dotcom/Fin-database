#!/usr/bin/env python3
"""
CLI voor het (her)categoriseren van transacties op basis van de actieve regels.

Gebruik:
    python categorize.py                    # categoriseer alle ongecategoriseerde transacties
    python categorize.py --overwrite        # overschrijf ook bestaande categorieën
    python categorize.py --account-id 2    # limiteer tot één rekening
    python categorize.py --dry-run          # test zonder op te slaan

Vereisten:
  - .env met DATABASE_URL
  - alembic upgrade head uitgevoerd
  - Categorieën en regels aanwezig in de database
"""
import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)

from app.categorizer import run_on_all
from app.database import SessionLocal


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Categoriseer transacties op basis van de actieve categorisatieregels."
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overschrijf ook transacties die al een categorie hebben.",
    )
    parser.add_argument(
        "--account-id",
        type=int,
        default=None,
        metavar="ID",
        help="Verwerk alleen transacties van rekening met dit ID.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evalueer regels maar sla niets op.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        stats = run_on_all(db, overwrite=args.overwrite, account_id=args.account_id)

        if args.dry_run:
            db.rollback()
            print("Dry-run: geen wijzigingen opgeslagen.")
        else:
            db.commit()

        print(
            f"\nResultaat: {stats['changed']} gecategoriseerd, "
            f"{stats['skipped']} al gecategoriseerd (overgeslagen), "
            f"{stats['no_match']} geen match gevonden."
        )
        return 0

    except Exception as exc:
        db.rollback()
        print(f"Fout: {exc}", file=sys.stderr)
        logging.exception("Onverwachte fout")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
