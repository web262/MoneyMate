# backend/routes/budgets.py
from flask import Blueprint, request, jsonify, g
from ..database import get_db
from .auth import login_required

# All routes live under /api/budgets/*
budgets_bp = Blueprint("budgets", __name__, url_prefix="/api/budgets")

# ---------- schema ----------
def ensure_schema():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            monthly_limit REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, category) ON CONFLICT REPLACE,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    """)
    db.commit()

@budgets_bp.before_app_request
def _ensure():
    ensure_schema()

# ---------- create (POST /api/budgets/ or /api/budgets/add) ----------
@budgets_bp.post("/")
@budgets_bp.post("/add")
@login_required
def create_budget():
    uid = g.user_id

    data = request.get_json(silent=True) or {}
    category = (data.get("category") or "").strip()
    try:
        limit = float(data.get("monthly_limit"))
    except Exception:
        limit = -1

    if not category or limit <= 0:
        return jsonify(success=False, message="Provide category and positive monthly_limit"), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?,?,?)",
        (uid, category, limit),
    )
    db.commit()
    bid = cur.lastrowid
    row = db.execute(
        "SELECT id, category, monthly_limit, created_at FROM budgets WHERE id=?",
        (bid,)
    ).fetchone()
    return jsonify(success=True, budget=dict(row)), 201

# ---------- list with MTD usage (GET /api/budgets/all) ----------
@budgets_bp.get("/all")
@login_required
def list_budgets():
    uid = g.user_id

    db = get_db()
    rows = db.execute("""
        SELECT
          b.id, b.category, b.monthly_limit, b.created_at,
          IFNULL((
            SELECT SUM(t.amount) FROM transactions t
            WHERE t.user_id = b.user_id
              AND t.type = 'expense'
              AND t.category = b.category
              AND strftime('%Y-%m', t.created_at) = strftime('%Y-%m','now')
          ), 0) AS spent_mtd
        FROM budgets b
        WHERE b.user_id = ?
        ORDER BY lower(b.category)
    """, (uid,)).fetchall()

    items = []
    for r in rows:
        limit = float(r["monthly_limit"])
        spent = float(r["spent_mtd"])
        used_ratio = (spent / limit) if limit > 0 else 0.0
        items.append({
            "id": r["id"],
            "category": r["category"],
            "monthly_limit": limit,
            "spent_mtd": spent,
            "used_ratio": round(used_ratio, 4),
            "created_at": r["created_at"],
        })
    return jsonify(success=True, budgets=items)

# ---------- update (PATCH /api/budgets/<id>) ----------
@budgets_bp.patch("/<int:bid>")
@login_required
def update_budget(bid: int):
    uid = g.user_id

    data = request.get_json(silent=True) or {}
    fields, params = [], []

    if "category" in data:
        cat = (data.get("category") or "").strip()
        if not cat:
            return jsonify(success=False, message="Category cannot be empty"), 400
        fields.append("category=?"); params.append(cat)

    if "monthly_limit" in data:
        try:
            lim = float(data.get("monthly_limit")); assert lim > 0
        except Exception:
            return jsonify(success=False, message="monthly_limit must be > 0"), 400
        fields.append("monthly_limit=?"); params.append(lim)

    if not fields:
        return jsonify(success=False, message="No changes"), 400

    params.extend([bid, uid])
    db = get_db()
    db.execute(
        f"UPDATE budgets SET {', '.join(fields)} WHERE id=? AND user_id=?",
        tuple(params)
    )
    db.commit()

    row = db.execute(
        "SELECT id, category, monthly_limit, created_at FROM budgets WHERE id=? AND user_id=?",
        (bid, uid)
    ).fetchone()
    if not row:
        return jsonify(success=False, message="Not found"), 404
    return jsonify(success=True, budget=dict(row))

# ---------- delete (DELETE /api/budgets/<id>) ----------
@budgets_bp.delete("/<int:bid>")
@login_required
def delete_budget(bid: int):
    uid = g.user_id
    db = get_db()
    cur = db.execute("DELETE FROM budgets WHERE id=? AND user_id=?", (bid, uid))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(success=False, message="Not found"), 404
    return jsonify(success=True)

# ---------- progress (GET /api/budgets/progress) ----------
@budgets_bp.get("/progress")
@login_required
def get_progress():
    """
    Returns: { success, progress: [{category, monthly_limit, spent_mtd, pct}] }
    pct is clamped to [0, +inf), client can clamp to 1.0 for UI.
    """
    uid = g.user_id
    db = get_db()
    rows = db.execute("""
        SELECT
          b.category,
          b.monthly_limit,
          IFNULL((
            SELECT SUM(t.amount) FROM transactions t
            WHERE t.user_id = b.user_id
              AND t.type = 'expense'
              AND t.category = b.category
              AND strftime('%Y-%m', t.created_at) = strftime('%Y-%m','now')
          ), 0) AS spent_mtd
        FROM budgets b
        WHERE b.user_id = ?
        ORDER BY lower(b.category)
    """, (uid,)).fetchall()

    out = []
    for r in rows:
        limit = float(r["monthly_limit"])
        spent = float(r["spent_mtd"])
        pct = (spent / limit) if limit > 0 else 0.0
        out.append({
            "category": r["category"],
            "monthly_limit": limit,
            "spent_mtd": spent,
            "pct": round(pct, 4),
        })
    return jsonify(success=True, progress=out)

# ---------- alerts (GET /api/budgets/alerts) ----------
@budgets_bp.get("/alerts")
@login_required
def get_alerts():
    """
    Simple alerts when a category crosses 80% or 100% of monthly limit (MTD).
    Returns: { success, alerts: [{category, pct, message, level}] }
      level: "warning" (>=0.8) or "danger" (>1.0)
    """
    uid = g.user_id
    db = get_db()
    rows = db.execute("""
        SELECT
          b.category,
          b.monthly_limit,
          IFNULL((
            SELECT SUM(t.amount) FROM transactions t
            WHERE t.user_id = b.user_id
              AND t.type = 'expense'
              AND t.category = b.category
              AND strftime('%Y-%m', t.created_at) = strftime('%Y-%m','now')
          ), 0) AS spent_mtd
        FROM budgets b
        WHERE b.user_id = ?
    """, (uid,)).fetchall()

    alerts = []
    for r in rows:
        limit = float(r["monthly_limit"])
        spent = float(r["spent_mtd"])
        pct = (spent / limit) if limit > 0 else 0.0
        if limit <= 0:
            continue
        if pct >= 1.0:
            alerts.append({
                "category": r["category"],
                "pct": round(pct, 4),
                "level": "danger",
                "message": f"You exceeded your {r['category']} budget (spent ${spent:.0f} / ${limit:.0f})."
            })
        elif pct >= 0.8:
            alerts.append({
                "category": r["category"],
                "pct": round(pct, 4),
                "level": "warning",
                "message": f"You're at {pct*100:.0f}% of your {r['category']} budget (${spent:.0f} / ${limit:.0f})."
            })

    return jsonify(success=True, alerts=alerts)
