"""
FastAPI REST API — verbindt de frontend met de database.

Starten (lokaal):
    uvicorn app.api:app --reload --port 8000

In Docker: zie docker-compose.yml
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.categorizer import run_on_all
from app.database import SessionLocal
from app.importers.runner import import_file as do_import
from app.importers.runner import preview_file as do_preview
from app.models import (
    Account, AccountAlias, CategorizationRule, Category,
    ColumnMappingProfile, Label, RuleCondition, Transaction, TransactionLabel,
)

app = FastAPI(title="Fin Database API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _cat(c) -> dict:
    if c is None:
        return None
    return {
        "id": c.id,
        "category": c.category,
        "subcategory": c.subcategory,
        "destination": c.destination,
    }


def _rule(r) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "priority": r.priority,
        "logic": r.logic.value if hasattr(r.logic, "value") else r.logic,
        "category_id": r.category_id,
        "category": _cat(r.category),
        "is_active": r.is_active,
        "notes": r.notes,
        "conditions": [
            {
                "id": c.id,
                "field_to_match": c.field_to_match,
                "operator": c.operator.value if hasattr(c.operator, "value") else c.operator,
                "match_value": c.match_value,
            }
            for c in r.conditions
        ],
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _load_rule(rule_id: int, db: Session) -> CategorizationRule:
    rule = (
        db.query(CategorizationRule)
        .options(
            joinedload(CategorizationRule.conditions),
            joinedload(CategorizationRule.category),
        )
        .filter(CategorizationRule.id == rule_id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Regel niet gevonden")
    return rule


# ------------------------------------------------------------------
# Pydantic input models
# ------------------------------------------------------------------

class ConditionIn(BaseModel):
    field_to_match: str
    operator: str
    match_value: Optional[str] = None


class RuleIn(BaseModel):
    name: str
    priority: int = 0
    logic: str = "AND"
    category_id: int
    is_active: bool = True
    notes: Optional[str] = None
    conditions: list[ConditionIn]


class RulePreviewIn(BaseModel):
    logic: str = "AND"
    conditions: list[ConditionIn]


class AliasIn(BaseModel):
    iban: str
    display_name: str
    notes: Optional[str] = None


class CategoryIn(BaseModel):
    category: str
    subcategory: Optional[str] = None
    destination: Optional[str] = None


class MappingProfileIn(BaseModel):
    name: str
    bank_type: str
    mappings: list


class MappedTransactionIn(BaseModel):
    date: str
    amount: str
    own_iban: Optional[str] = None          # Eigen rekening-IBAN (Van IBAN)
    counterparty_iban: Optional[str] = None
    counterparty_name: Optional[str] = None
    description: Optional[str] = None
    external_id: Optional[str] = None
    bank_type: str = "unknown"
    raw: Optional[dict] = None


class MappedImportIn(BaseModel):
    account_iban: Optional[str] = None      # Optioneel: wordt ook uit transacties gehaald
    run_categorize: bool = False
    transactions: list[MappedTransactionIn]


class TransactionDeleteIn(BaseModel):
    ids: list[int]


class TransactionPatchIn(BaseModel):
    category_id: Optional[int] = None   # None = geen categorie
    label_ids: list[int] = []            # Lege lijst = geen labels
    notes: Optional[str] = None          # None = geen notities


class LabelIn(BaseModel):
    name: str


# ------------------------------------------------------------------
# Helpers (transaction serialisatie)
# ------------------------------------------------------------------

def _trx_dict(t: Transaction) -> dict:
    """Serialiseer een Transaction naar een dict; vereist dat account, category en
    transaction_labels (→ label) al geladen zijn via joinedload."""
    cat = _cat(t.category) if t.category else None
    labels = [
        {"id": tl.label.id, "name": tl.label.name}
        for tl in (t.transaction_labels or [])
        if tl.label
    ]
    return {
        "id": t.id,
        "date": t.date.isoformat() if t.date else None,
        "amount": str(t.amount),
        "balance_after": str(t.balance_after) if t.balance_after is not None else None,
        "counterparty_iban": t.counterparty_iban,
        "counterparty_name": t.counterparty_name,
        "description": t.description,
        "notes": t.notes,
        "category_id": t.category_id,
        "category": cat,
        "account_id": t.account_id,
        "account_name": t.account.name if t.account else None,
        "account_institution": (
            t.account.institution.value
            if t.account and t.account.institution else None
        ),
        "labels": labels,
        "is_internal_transfer": t.is_internal_transfer,
        "import_source": t.import_source.value if t.import_source else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ------------------------------------------------------------------
# Stats
# ------------------------------------------------------------------

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    active_rules = db.query(CategorizationRule).filter(CategorizationRule.is_active.is_(True)).count()
    total_trx = db.query(Transaction).count()
    categorized = db.query(Transaction).filter(Transaction.category_id.isnot(None)).count()
    total_accounts = db.query(Account).filter(Account.is_active.is_(True)).count()
    return {
        "active_rules": active_rules,
        "total_transactions": total_trx,
        "categorized": categorized,
        "categorized_pct": round(categorized / total_trx * 100, 1) if total_trx else 0,
        "active_accounts": total_accounts,
    }


# ------------------------------------------------------------------
# Categories
# ------------------------------------------------------------------

@app.get("/api/categories")
def list_categories(db: Session = Depends(get_db)):
    cats = (
        db.query(Category)
        .order_by(Category.category, Category.subcategory, Category.destination)
        .all()
    )
    return [_cat(c) for c in cats]


@app.post("/api/categories", status_code=201)
def create_category(body: CategoryIn, db: Session = Depends(get_db)):
    cat = Category(
        category=body.category,
        subcategory=body.subcategory or None,
        destination=body.destination or None,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _cat(cat)


@app.delete("/api/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categorie niet gevonden")
    db.delete(cat)
    db.commit()


# ------------------------------------------------------------------
# Rules
# ------------------------------------------------------------------

@app.get("/api/rules")
def list_rules(db: Session = Depends(get_db)):
    rules = (
        db.query(CategorizationRule)
        .options(
            joinedload(CategorizationRule.conditions),
            joinedload(CategorizationRule.category),
        )
        .order_by(CategorizationRule.priority, CategorizationRule.id)
        .all()
    )
    return [_rule(r) for r in rules]


@app.post("/api/rules/preview")
def preview_rule(body: RulePreviewIn, db: Session = Depends(get_db)):
    """Return up to 50 transactions that would match this (unsaved) rule."""
    from app.categorizer import _apply_operator, _get_field_value

    transactions = (
        db.query(Transaction)
        .order_by(Transaction.date.desc())
        .limit(2000)
        .all()
    )

    matches = []
    for trx in transactions:
        results = []
        for cond in body.conditions:
            fv = _get_field_value(cond.field_to_match, trx)
            try:
                results.append(_apply_operator(cond.operator, fv, cond.match_value))
            except Exception:
                results.append(False)

        if not results:
            continue
        matched = all(results) if body.logic == "AND" else any(results)
        if matched:
            matches.append({
                "id": trx.id,
                "date": trx.date.isoformat() if trx.date else None,
                "amount": str(trx.amount),
                "description": trx.description,
                "counterparty_name": trx.counterparty_name,
                "counterparty_iban": trx.counterparty_iban,
                "category_id": trx.category_id,
            })
            if len(matches) >= 50:
                break

    return {"count": len(matches), "transactions": matches[:20]}


@app.get("/api/rules/export")
def export_rules(db: Session = Depends(get_db)):
    """Download all rules as a JSON file."""
    rules = (
        db.query(CategorizationRule)
        .options(
            joinedload(CategorizationRule.conditions),
            joinedload(CategorizationRule.category),
        )
        .order_by(CategorizationRule.priority, CategorizationRule.id)
        .all()
    )
    data = [
        {
            "name": r.name,
            "priority": r.priority,
            "logic": r.logic.value if hasattr(r.logic, "value") else r.logic,
            "is_active": r.is_active,
            "notes": r.notes,
            "category": _cat(r.category),
            "conditions": [
                {
                    "field_to_match": c.field_to_match,
                    "operator": c.operator.value if hasattr(c.operator, "value") else c.operator,
                    "match_value": c.match_value,
                }
                for c in r.conditions
            ],
        }
        for r in rules
    ]
    content = json.dumps(data, indent=2, ensure_ascii=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=td-finance-rules.json"},
    )


@app.post("/api/rules/import")
async def import_rules(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import rules from an uploaded JSON file."""
    raw = await file.read()
    try:
        rules_data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Ongeldig JSON-bestand: {exc}")

    if not isinstance(rules_data, list):
        raise HTTPException(status_code=400, detail="JSON moet een lijst van regels zijn")

    imported = 0
    skipped = 0
    errors: list[str] = []

    for item in rules_data:
        try:
            cat_data = item.get("category")
            if not cat_data:
                errors.append(f"Regel '{item.get('name', '?')}': geen categorie opgegeven")
                skipped += 1
                continue

            cat = db.query(Category).filter(
                Category.category == cat_data.get("category"),
                Category.subcategory == cat_data.get("subcategory"),
                Category.destination == cat_data.get("destination"),
            ).first()
            if not cat:
                cat = Category(
                    category=cat_data.get("category"),
                    subcategory=cat_data.get("subcategory") or None,
                    destination=cat_data.get("destination") or None,
                )
                db.add(cat)
                db.flush()

            # Skip rules with duplicate names
            if db.query(CategorizationRule).filter(CategorizationRule.name == item.get("name")).first():
                skipped += 1
                continue

            rule = CategorizationRule(
                name=item.get("name", "Geïmporteerde regel"),
                priority=item.get("priority", 0),
                logic=item.get("logic", "AND"),
                category_id=cat.id,
                is_active=item.get("is_active", True),
                notes=item.get("notes"),
            )
            db.add(rule)
            db.flush()
            for cond in item.get("conditions", []):
                db.add(RuleCondition(
                    rule_id=rule.id,
                    field_to_match=cond.get("field_to_match", "description"),
                    operator=cond.get("operator", "contains"),
                    match_value=cond.get("match_value"),
                ))
            imported += 1
        except Exception as exc:
            errors.append(f"Regel '{item.get('name', '?')}': {exc}")
            skipped += 1

    db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}


@app.get("/api/rules/{rule_id}")
def get_rule(rule_id: int, db: Session = Depends(get_db)):
    return _rule(_load_rule(rule_id, db))


@app.post("/api/rules", status_code=201)
def create_rule(body: RuleIn, db: Session = Depends(get_db)):
    rule = CategorizationRule(
        name=body.name,
        priority=body.priority,
        logic=body.logic,
        category_id=body.category_id,
        is_active=body.is_active,
        notes=body.notes,
    )
    db.add(rule)
    db.flush()
    for c in body.conditions:
        db.add(RuleCondition(
            rule_id=rule.id,
            field_to_match=c.field_to_match,
            operator=c.operator,
            match_value=c.match_value,
        ))
    db.commit()
    return _rule(_load_rule(rule.id, db))


@app.put("/api/rules/{rule_id}")
def update_rule(rule_id: int, body: RuleIn, db: Session = Depends(get_db)):
    rule = db.query(CategorizationRule).filter(CategorizationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regel niet gevonden")

    rule.name = body.name
    rule.priority = body.priority
    rule.logic = body.logic
    rule.category_id = body.category_id
    rule.is_active = body.is_active
    rule.notes = body.notes

    # Vervang condities
    db.query(RuleCondition).filter(RuleCondition.rule_id == rule_id).delete()
    for c in body.conditions:
        db.add(RuleCondition(
            rule_id=rule_id,
            field_to_match=c.field_to_match,
            operator=c.operator,
            match_value=c.match_value,
        ))
    db.commit()
    return _rule(_load_rule(rule_id, db))


@app.delete("/api/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CategorizationRule).filter(CategorizationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regel niet gevonden")
    db.delete(rule)
    db.commit()


@app.patch("/api/rules/{rule_id}/toggle")
def toggle_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CategorizationRule).filter(CategorizationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regel niet gevonden")
    rule.is_active = not rule.is_active
    db.commit()
    return {"id": rule_id, "is_active": rule.is_active}


# ------------------------------------------------------------------
# Import
# ------------------------------------------------------------------

@app.post("/api/import")
async def import_csv(
    file: UploadFile = File(...),
    account_iban: Optional[str] = Form(None),
    run_categorize: bool = Form(False),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename or "upload.csv").suffix or ".csv"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = do_import(tmp_path, db, account_iban=account_iban or None)
        cat_stats = None
        if run_categorize and result.inserted > 0:
            cat_stats = run_on_all(db, overwrite=False)
        return {
            "source": result.source,
            "file": result.file,
            "inserted": result.inserted,
            "skipped": result.skipped,
            "errors": result.errors,
            "categorization": cat_stats,
        }
    finally:
        os.unlink(tmp_path)


# ------------------------------------------------------------------
# Accounts (lezen)
# ------------------------------------------------------------------

@app.get("/api/accounts")
def list_accounts(db: Session = Depends(get_db)):
    accs = db.query(Account).filter(Account.is_active.is_(True)).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "iban": a.iban,
            "type": a.type.value if hasattr(a.type, "value") else a.type,
            "institution": a.institution.value if hasattr(a.institution, "value") else a.institution,
        }
        for a in accs
    ]


# ------------------------------------------------------------------
# Account aliases (IBAN → weergavenaam)
# BELANGRIJK: /suggestions en /bulk VOOR /{iban} declareren
# ------------------------------------------------------------------

def _alias(a: AccountAlias) -> dict:
    return {"iban": a.iban, "display_name": a.display_name, "notes": a.notes}


@app.get("/api/aliases")
def list_aliases(db: Session = Depends(get_db)):
    return [_alias(a) for a in db.query(AccountAlias).order_by(AccountAlias.iban).all()]


@app.get("/api/aliases/suggestions")
def alias_suggestions(limit: int = 15, db: Session = Depends(get_db)):
    """Top N tegenpartij-IBAN's die in transacties voorkomen maar nog geen alias hebben."""
    from sqlalchemy import func

    existing = db.query(AccountAlias.iban)
    results = (
        db.query(
            Transaction.counterparty_iban,
            func.count(Transaction.id).label("n"),
        )
        .filter(Transaction.counterparty_iban.isnot(None))
        .filter(Transaction.counterparty_iban != "")
        .filter(Transaction.counterparty_iban.notin_(existing))
        .group_by(Transaction.counterparty_iban)
        .order_by(func.count(Transaction.id).desc())
        .limit(limit)
        .all()
    )
    return [{"iban": r.counterparty_iban, "transaction_count": r.n} for r in results]


@app.post("/api/aliases/name-lookup")
def alias_name_lookup(body: dict, db: Session = Depends(get_db)):
    """
    Zoek voor een lijst van IBANs de meest voorkomende tegenpartijnaam op
    uit bestaande transacties. Handig als suggestie bij nieuwe IBAN-aliassen.
    Body: {ibans: [str]}
    Returns: {iban: naam | null}
    """
    from sqlalchemy import func

    ibans = body.get("ibans", [])
    if not ibans:
        return {}

    rows = (
        db.query(
            Transaction.counterparty_iban,
            Transaction.counterparty_name,
            func.count(Transaction.id).label("n"),
        )
        .filter(
            Transaction.counterparty_iban.in_(ibans),
            Transaction.counterparty_name.isnot(None),
            Transaction.counterparty_name != "",
        )
        .group_by(Transaction.counterparty_iban, Transaction.counterparty_name)
        .order_by(func.count(Transaction.id).desc())
        .all()
    )

    # Neem per IBAN de meest voorkomende naam
    name_map: dict[str, str] = {}
    for iban, name, _ in rows:
        if iban not in name_map:
            name_map[iban] = name

    return {iban: name_map.get(iban) for iban in ibans}


@app.post("/api/aliases", status_code=201)
def create_alias(body: AliasIn, db: Session = Depends(get_db)):
    existing = db.query(AccountAlias).filter(AccountAlias.iban == body.iban.strip()).first()
    if existing:
        existing.display_name = body.display_name.strip()
        existing.notes = body.notes or None
        db.commit()
        return _alias(existing)
    alias = AccountAlias(
        iban=body.iban.strip().upper(),
        display_name=body.display_name.strip(),
        notes=body.notes or None,
    )
    db.add(alias)
    db.commit()
    return _alias(alias)


@app.put("/api/aliases/{iban}")
def update_alias(iban: str, body: AliasIn, db: Session = Depends(get_db)):
    alias = db.query(AccountAlias).filter(AccountAlias.iban == iban).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias niet gevonden")
    alias.display_name = body.display_name.strip()
    alias.notes = body.notes or None
    db.commit()
    return _alias(alias)


@app.delete("/api/aliases/{iban}", status_code=204)
def delete_alias(iban: str, db: Session = Depends(get_db)):
    alias = db.query(AccountAlias).filter(AccountAlias.iban == iban).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias niet gevonden")
    db.delete(alias)
    db.commit()


@app.post("/api/aliases/import-csv")
async def import_aliases_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Importeer IBAN-aliassen vanuit een CSV-bestand.
    Verwacht formaat: IBAN;Naam (of IBAN,Naam), optionele headerrij.
    Bestaande aliassen worden bijgewerkt.
    """
    import csv as csv_mod
    import io

    content = (await file.read()).decode("utf-8-sig", errors="replace")
    lines = content.splitlines()
    if not lines:
        raise HTTPException(status_code=400, detail="Leeg bestand")

    # Detecteer scheidingsteken
    delimiter = ";" if lines[0].count(";") >= lines[0].count(",") else ","

    reader = csv_mod.reader(io.StringIO(content), delimiter=delimiter)
    created = updated = 0
    errors: list[str] = []

    for line_no, row in enumerate(reader, 1):
        if len(row) < 2:
            continue
        iban_raw = row[0].strip().upper()
        name_raw = row[1].strip()

        # Header overslaan
        if "IBAN" in iban_raw or not iban_raw or not name_raw:
            continue

        existing = db.query(AccountAlias).filter(AccountAlias.iban == iban_raw).first()
        if existing:
            existing.display_name = name_raw
            updated += 1
        else:
            db.add(AccountAlias(iban=iban_raw, display_name=name_raw))
            created += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Fout bij opslaan: {exc}")

    return {"created": created, "updated": updated, "errors": errors}


# ------------------------------------------------------------------
# Categories (uitgebreid — met overzicht incl. transactietellingen)
# ------------------------------------------------------------------

@app.get("/api/categories/overview")
def categories_overview(db: Session = Depends(get_db)):
    """Categorieën met transactietellingen, gesorteerd op naam."""
    from sqlalchemy import func

    rows = (
        db.query(Category, func.count(Transaction.id).label("n"))
        .outerjoin(Transaction, Transaction.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.category, Category.subcategory, Category.destination)
        .all()
    )
    return [
        {**_cat(cat), "transaction_count": n}
        for cat, n in rows
    ]


# ------------------------------------------------------------------
# Import preview (dry-run vóór daadwerkelijke import)
# ------------------------------------------------------------------

@app.post("/api/import/preview")
async def preview_import(
    file: UploadFile = File(...),
    account_iban: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Parseer een CSV-bestand en geef een samenvatting terug zonder iets op te slaan:
    - Gedetecteerd formaat
    - Kolomkoppeling
    - Aantal nieuwe / al bestaande transacties
    - Eerste 5 voorbeeldrijen
    """
    suffix = Path(file.filename or "upload.csv").suffix or ".csv"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = do_preview(tmp_path, db, account_iban=account_iban or None)
        return result
    finally:
        os.unlink(tmp_path)


# ------------------------------------------------------------------
# Transactions (lezen met paginatie, sorteren, filteren)
# BELANGRIJK: /check-duplicates VOOR /{transaction_id} declareren
# ------------------------------------------------------------------

@app.post("/api/transactions/check-duplicates")
def check_duplicates(body: dict, db: Session = Depends(get_db)):
    """
    Content-gebaseerde duplicatencheck — betrouwbaarder dan SHA256-hashes.

    Body: {
        transactions: [{idx, date, amount, counterparty_iban?, description?}],
        account_iban?: str   (optioneel — beperkt zoekopdracht tot één rekening)
    }

    Markeert een inkomende transactie als duplicaat als:
      date == date  AND  amount == amount
      AND  (counterparty_iban matcht  OR  description[:50] matcht)

    Returns: {duplicates: [{idx, match: {id, date, amount, ...}}]}
    """
    from decimal import Decimal, InvalidOperation
    from datetime import date as date_type
    from sqlalchemy import or_

    transactions = body.get("transactions", [])
    if not transactions:
        return {"duplicates": []}

    # Parseer elk inkomend record; sla records met ongeldige datum/bedrag over
    parsed = []
    for t in transactions:
        raw_date = (t.get("date") or "").strip()
        raw_amount = (t.get("amount") or "").strip().replace(",", ".")
        try:
            trx_date = date_type.fromisoformat(raw_date)
        except ValueError:
            continue
        try:
            trx_amount = Decimal(raw_amount)
        except InvalidOperation:
            continue
        parsed.append({
            "idx": t.get("idx"),
            "date": trx_date,
            "amount": trx_amount,
            "counterparty_iban": (t.get("counterparty_iban") or "").strip().upper() or None,
            "description": (t.get("description") or "").strip() or None,
        })

    if not parsed:
        return {"duplicates": []}

    # Optioneel filteren op rekening
    account_iban = (body.get("account_iban") or "").strip()
    account = None
    if account_iban:
        account = db.query(Account).filter(Account.iban == account_iban).first()

    # Één efficiënte query op alle unieke datums (vermijdt N+1)
    all_dates = list({p["date"] for p in parsed})
    q = (
        db.query(Transaction)
        .options(joinedload(Transaction.account))
        .filter(Transaction.date.in_(all_dates))
    )
    if account:
        q = q.filter(Transaction.account_id == account.id)
    candidates = q.all()

    # Bouw opzoektabel: datum → [Transaction]
    lookup: dict = {}
    for c in candidates:
        lookup.setdefault(c.date, []).append(c)

    duplicates = []
    for p in parsed:
        for candidate in lookup.get(p["date"], []):
            # Bedrag moet exact overeenkomen
            if candidate.amount != p["amount"]:
                continue

            is_dup = False
            # Tegenrekening-IBAN-match (beide aanwezig)
            if p["counterparty_iban"] and candidate.counterparty_iban:
                if p["counterparty_iban"] == (candidate.counterparty_iban or "").upper():
                    is_dup = True
            # Omschrijving-match op eerste 50 tekens (beide aanwezig)
            if not is_dup and p["description"] and candidate.description:
                if p["description"][:50].lower() == (candidate.description or "")[:50].lower():
                    is_dup = True

            if is_dup:
                duplicates.append({
                    "idx": p["idx"],
                    "match": {
                        "id": candidate.id,
                        "date": candidate.date.isoformat(),
                        "amount": str(candidate.amount),
                        "counterparty_name": candidate.counterparty_name,
                        "counterparty_iban": candidate.counterparty_iban,
                        "description": candidate.description,
                        "account_name": candidate.account.name if candidate.account else None,
                    },
                })
                break  # Eerste match volstaat

    return {"duplicates": duplicates}


@app.get("/api/transactions")
def list_transactions(
    page: int = 1,
    page_size: int = 100,
    sort_by: str = "date",
    sort_dir: str = "desc",
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    amount_min: Optional[str] = None,
    amount_max: Optional[str] = None,
    category_id: Optional[int] = None,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    from decimal import Decimal, InvalidOperation
    from datetime import date as date_type

    q = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
            joinedload(Transaction.transaction_labels).joinedload(TransactionLabel.label),
        )
    )

    if search:
        term = f"%{search}%"
        q = q.filter(
            Transaction.description.ilike(term)
            | Transaction.counterparty_name.ilike(term)
            | Transaction.counterparty_iban.ilike(term)
        )
    if date_from:
        try:
            q = q.filter(Transaction.date >= date_type.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(Transaction.date <= date_type.fromisoformat(date_to))
        except ValueError:
            pass
    if amount_min:
        try:
            q = q.filter(Transaction.amount >= Decimal(amount_min))
        except InvalidOperation:
            pass
    if amount_max:
        try:
            q = q.filter(Transaction.amount <= Decimal(amount_max))
        except InvalidOperation:
            pass
    if category_id is not None:
        if category_id == 0:
            q = q.filter(Transaction.category_id.is_(None))
        else:
            q = q.filter(Transaction.category_id == category_id)
    if account_id is not None:
        q = q.filter(Transaction.account_id == account_id)

    total = q.count()

    sort_col = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "counterparty_name": Transaction.counterparty_name,
        "description": Transaction.description,
    }.get(sort_by, Transaction.date)

    if sort_dir == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    offset = (page - 1) * page_size
    items = q.offset(offset).limit(page_size).all()

    return {
        "items": [_trx_dict(t) for t in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


# ------------------------------------------------------------------
# Transactions — verwijderen (batch) en bewerken
# ------------------------------------------------------------------

@app.delete("/api/transactions", status_code=200)
def delete_transactions(body: TransactionDeleteIn, db: Session = Depends(get_db)):
    """Verwijder meerdere transacties tegelijk op basis van hun ID's."""
    if not body.ids:
        return {"deleted": 0}
    count = (
        db.query(Transaction)
        .filter(Transaction.id.in_(body.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": count}


@app.patch("/api/transactions/{transaction_id}")
def patch_transaction(
    transaction_id: int,
    body: TransactionPatchIn,
    db: Session = Depends(get_db),
):
    """Bewerk categorie, labels en/of notitie van één transactie."""
    trx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
            joinedload(Transaction.transaction_labels).joinedload(TransactionLabel.label),
        )
        .filter(Transaction.id == transaction_id)
        .first()
    )
    if not trx:
        raise HTTPException(status_code=404, detail="Transactie niet gevonden")

    # Categorie bijwerken (None = geen categorie)
    trx.category_id = body.category_id

    # Labels vervangen
    db.query(TransactionLabel).filter(
        TransactionLabel.transaction_id == transaction_id
    ).delete(synchronize_session=False)
    for lid in body.label_ids:
        db.add(TransactionLabel(transaction_id=transaction_id, label_id=lid))

    # Notitie bijwerken
    trx.notes = body.notes or None

    db.commit()

    # Herlaad met relaties voor de response
    trx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
            joinedload(Transaction.transaction_labels).joinedload(TransactionLabel.label),
        )
        .filter(Transaction.id == transaction_id)
        .first()
    )
    return _trx_dict(trx)


# ------------------------------------------------------------------
# Labels
# ------------------------------------------------------------------

@app.get("/api/labels")
def list_labels(db: Session = Depends(get_db)):
    labels = db.query(Label).order_by(Label.name).all()
    return [{"id": l.id, "name": l.name} for l in labels]


@app.post("/api/labels", status_code=201)
def create_label(body: LabelIn, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Label-naam mag niet leeg zijn")
    existing = db.query(Label).filter(Label.name == name).first()
    if existing:
        return {"id": existing.id, "name": existing.name}
    label = Label(name=name)
    db.add(label)
    db.commit()
    db.refresh(label)
    return {"id": label.id, "name": label.name}


# ------------------------------------------------------------------
# Mapping profiles (voor importwizard)
# ------------------------------------------------------------------

def _profile(p: ColumnMappingProfile) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "bank_type": p.bank_type,
        "mappings": p.mappings,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@app.get("/api/mapping-profiles")
def list_mapping_profiles(bank_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ColumnMappingProfile)
    if bank_type:
        q = q.filter(ColumnMappingProfile.bank_type == bank_type)
    return [_profile(p) for p in q.order_by(ColumnMappingProfile.id).all()]


@app.post("/api/mapping-profiles", status_code=201)
def create_mapping_profile(body: MappingProfileIn, db: Session = Depends(get_db)):
    profile = ColumnMappingProfile(
        name=body.name,
        bank_type=body.bank_type,
        mappings=body.mappings,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _profile(profile)


@app.delete("/api/mapping-profiles/{profile_id}", status_code=204)
def delete_mapping_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(ColumnMappingProfile).filter(ColumnMappingProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profiel niet gevonden")
    db.delete(profile)
    db.commit()


# ------------------------------------------------------------------
# IBAN aliases — thin wrappers (hergebruiken account_aliases-logica)
# ------------------------------------------------------------------

@app.get("/api/iban-aliases")
def list_iban_aliases(db: Session = Depends(get_db)):
    """Alias voor /api/aliases — gebruikt door de importwizard."""
    return [_alias(a) for a in db.query(AccountAlias).order_by(AccountAlias.iban).all()]


@app.post("/api/iban-aliases", status_code=201)
def create_iban_alias(body: AliasIn, db: Session = Depends(get_db)):
    """Alias voor POST /api/aliases — upsert op IBAN."""
    existing = db.query(AccountAlias).filter(AccountAlias.iban == body.iban.strip().upper()).first()
    if existing:
        existing.display_name = body.display_name.strip()
        existing.notes = body.notes or None
        db.commit()
        return _alias(existing)
    alias = AccountAlias(
        iban=body.iban.strip().upper(),
        display_name=body.display_name.strip(),
        notes=body.notes or None,
    )
    db.add(alias)
    db.commit()
    return _alias(alias)


# ------------------------------------------------------------------
# Import/mapped — voor ING/ABN AMRO (pre-mapped vanuit browser)
# ------------------------------------------------------------------

@app.post("/api/import/mapped")
def import_mapped(body: MappedImportIn, db: Session = Depends(get_db)):
    """
    Importeer vooraf door de browser gekoppelde transacties.
    Gebruikt voor banken die niet native door de Python-importer worden ondersteund
    (ING, ABN AMRO). De browser parseert, koppelt kolommen en stuurt
    genormaliseerde transactiedata naar dit endpoint.
    """
    from decimal import Decimal, InvalidOperation
    from datetime import date as date_type
    import hashlib

    # Bepaal eigen IBAN: uit body of uit eerste transactie
    own_iban = (body.account_iban or "").strip()
    if not own_iban and body.transactions:
        own_iban = (body.transactions[0].own_iban or "").strip()

    if not own_iban:
        raise HTTPException(status_code=400, detail="Geen rekening-IBAN opgegeven of gedetecteerd in transactiedata.")

    # Zoek rekening op IBAN — maak automatisch aan als nieuw
    from app.importers.base import BaseImporter
    first_bank_type = body.transactions[0].bank_type if body.transactions else "unknown"
    account = BaseImporter._resolve_or_create_account(db, own_iban, first_bank_type)

    # Laad aliassen voor verrijking tegenpartijnaam
    aliases = {a.iban: a.display_name for a in db.query(AccountAlias).all()}

    inserted = 0
    skipped = 0
    errors: list[str] = []

    for i, trx_in in enumerate(body.transactions):
        try:
            # Datum parsen
            try:
                trx_date = date_type.fromisoformat(trx_in.date)
            except ValueError:
                errors.append(f"Rij {i + 1}: ongeldige datum '{trx_in.date}'")
                skipped += 1
                continue

            # Bedrag parsen
            try:
                amount = Decimal(trx_in.amount.replace(",", "."))
            except InvalidOperation:
                errors.append(f"Rij {i + 1}: ongeldig bedrag '{trx_in.amount}'")
                skipped += 1
                continue

            # Eigen IBAN per transactie kan afwijken van body.account_iban
            # (bij meerdere bestanden met andere rekeningen in dezelfde call)
            trx_own_iban = (trx_in.own_iban or own_iban or "").strip()
            if trx_own_iban and trx_own_iban != own_iban:
                trx_account = BaseImporter._resolve_or_create_account(db, trx_own_iban, trx_in.bank_type)
            else:
                trx_account = account

            # External ID
            ext_id = trx_in.external_id
            if not ext_id:
                raw_str = f"{trx_in.date}|{trx_in.amount}|{trx_in.counterparty_iban or ''}|{trx_in.description or ''}"
                ext_id = hashlib.sha256(raw_str.encode()).hexdigest()

            # Duplicate check
            exists = db.query(Transaction).filter(
                Transaction.account_id == trx_account.id,
                Transaction.external_id == ext_id,
            ).first()
            if exists:
                skipped += 1
                continue

            # Tegenpartijnaam verrijken
            cp_name = trx_in.counterparty_name or None
            cp_iban = (trx_in.counterparty_iban or "").strip() or None
            if cp_name is None and cp_iban:
                cp_name = aliases.get(cp_iban)

            from app.models import ImportSourceType
            source_map = {
                "rabobank": ImportSourceType.rabobank,
                "bunq": ImportSourceType.bunq,
            }
            import_source = source_map.get(trx_in.bank_type, ImportSourceType.manual)

            trx = Transaction(
                account_id=trx_account.id,
                date=trx_date,
                amount=amount,
                counterparty_iban=cp_iban,
                counterparty_name=cp_name,
                description=trx_in.description or None,
                external_id=ext_id,
                import_source=import_source,
                raw_import_data=trx_in.raw or {},
            )
            db.add(trx)
            inserted += 1

        except Exception as exc:
            errors.append(f"Rij {i + 1}: {exc}")
            skipped += 1

    db.commit()

    cat_stats = None
    if body.run_categorize and inserted > 0:
        cat_stats = run_on_all(db, overwrite=False)

    return {
        "source": body.transactions[0].bank_type if body.transactions else "unknown",
        "file": "mapped-import",
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors,
        "categorization": cat_stats,
    }
