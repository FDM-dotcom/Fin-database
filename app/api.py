"""
FastAPI REST API — verbindt de frontend met de database.

Starten (lokaal):
    uvicorn app.api:app --reload --port 8000

In Docker: zie docker-compose.yml
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.categorizer import run_on_all
from app.database import SessionLocal
from app.importers.runner import import_file as do_import
from app.models import Account, CategorizationRule, Category, RuleCondition, Transaction

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


class CategoryIn(BaseModel):
    category: str
    subcategory: Optional[str] = None
    destination: Optional[str] = None


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
