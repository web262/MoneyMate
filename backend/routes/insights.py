# backend/routes/insights.py
from flask import Blueprint, jsonify, session
from ..database import get_db
from .auth import login_required

# All endpoints under /api/insights/*
insights_bp = Blueprint("insights", __name__, url_prefix="/api/insights")

@insights_bp.get("/")
@insights_bp.get("/advice")
@login_required
def get_insights():
    uid = session["user_id"]
    db = get_db()
    rows = db.execute("""
        SELECT type, amount, IFNULL(category,'Uncategorized') AS category
        FROM transactions
        WHERE user_id=? AND date(created_at) >= date('now','-30 day')
    """, (uid,)).fetchall()

    if not rows:
        return jsonify(success=True, advice=[{
            "title": "Add your first transactions",
            "text": "Start by logging income and a few expenses. We’ll analyze and tailor advice automatically."
        }])

    income = sum(float(r["amount"]) for r in rows if r["type"] == "income")
    expense = sum(float(r["amount"]) for r in rows if r["type"] == "expense")

    by_cat = {}
    for r in rows:
        if r["type"] == "expense":
            cat = r["category"] or "Uncategorized"
            by_cat[cat] = by_cat.get(cat, 0.0) + float(r["amount"])

    tips = []

    if expense > income:
        tips.append({
            "title": "Spending exceeds income",
            "text": "In the last 30 days, expenses are higher than income. Consider setting category budgets and reducing top-spend areas."
        })

    if by_cat and expense > 0:
        top_cat = max(by_cat, key=by_cat.get)
        share = (by_cat[top_cat] / expense) * 100
        tips.append({
            "title": f"High spend in {top_cat}",
            "text": f"{top_cat} accounts for ~{share:.0f}% of your expenses. Set a monthly limit and track it."
        })

    tips.append({
        "title": "Build a savings buffer",
        "text": "Aim to save 10–20% of your income. Create a saving goal and move it automatically on payday."
    })

    return jsonify(success=True, advice=tips[:3])
