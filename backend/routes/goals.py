# backend/routes/goals.py
from flask import Blueprint, request, jsonify, g
from datetime import datetime, date
from ..database import get_db
from .auth import login_required

# All endpoints under /api/goals/*
goals_bp = Blueprint("goals", __name__, url_prefix="/api/goals")

def ensure_schema():
    """
    Create tables (if needed) and migrate old goals tables to the current schema.
    """
    db = get_db()
    # 1) Create tables if they don't exist
    db.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT,
            target_amount REAL NOT NULL,
            saved_amount REAL NOT NULL DEFAULT 0,
            target_date TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS goal_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            goal_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE
        )
    """)

    # 2) MIGRATE existing `goals` table columns if missing
    cols = {r["name"] for r in db.execute("PRAGMA table_info(goals)").fetchall()}
    def add(col_sql: str):
        db.execute(f"ALTER TABLE goals ADD COLUMN {col_sql}")

    if "category" not in cols:
        add("category TEXT")
    if "saved_amount" not in cols:
        add("saved_amount REAL NOT NULL DEFAULT 0")
    if "target_date" not in cols:
        add("target_date TEXT")
    if "status" not in cols:
        add("status TEXT NOT NULL DEFAULT 'active'")
    if "created_at" not in cols:
        # SQLite ALTER ADD can't set function default; add then backfill.
        add("created_at TEXT")
        db.execute("""
            UPDATE goals
            SET created_at = COALESCE(created_at, datetime('now'))
            WHERE created_at IS NULL OR created_at = ''
        """)

    db.commit()

@goals_bp.before_app_request
def before_any():
    ensure_schema()

def iso_to_date(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z","")).date()
    except Exception:
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except Exception:
            return None

def goal_row_to_dict(r):
    return {
        "id": r["id"],
        "name": r["name"],
        "category": r["category"],
        "target_amount": float(r["target_amount"]),
        "saved_amount": float(r["saved_amount"]),
        "target_date": r["target_date"],
        "status": r["status"],
        "created_at": r["created_at"],
    }

def enrich_goal(g):
    target = float(g["target_amount"] or 0)
    saved = float(g["saved_amount"] or 0)
    pct = (saved / target) if target > 0 else 0.0
    today = date.today()
    tgt = iso_to_date(g["target_date"])
    days_left = (tgt - today).days if tgt else None
    remain = max(0.0, target - saved)
    per_day_needed = None
    if tgt:
        total_days = max(1, (tgt - today).days)
        per_day_needed = remain / total_days if total_days > 0 else remain
    g.update({
        "progress_pct": pct,
        "remaining": remain,
        "days_left": days_left,
        "per_day_needed": per_day_needed
    })
    return g

# -------- Create goal --------
@goals_bp.post("/")
@goals_bp.post("/add")
@login_required
def create_goal():
    uid = g.user_id
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    category = (data.get("category") or "").strip() or None
    try:
        target_amount = float(data.get("target_amount") or 0)
    except Exception:
        target_amount = 0
    target_date = data.get("target_date")
    if target_date and iso_to_date(target_date) is None:
        return jsonify(success=False, message="Invalid target_date"), 400
    if not name or target_amount <= 0:
        return jsonify(success=False, message="Invalid goal payload"), 400

    db = get_db()
    cur = db.execute("""
        INSERT INTO goals (user_id, name, category, target_amount, target_date)
        VALUES (?,?,?,?,?)
    """, (uid, name, category, target_amount, target_date))
    db.commit()
    gid = cur.lastrowid
    row = db.execute("SELECT * FROM goals WHERE id=? AND user_id=?", (gid, uid)).fetchone()
    return jsonify(success=True, goal=enrich_goal(goal_row_to_dict(row))), 201

# -------- List goals --------
@goals_bp.get("/")
@goals_bp.get("/all")
@login_required
def list_goals():
    uid = g.user_id
    rows = get_db().execute(
        "SELECT * FROM goals WHERE user_id=? AND status!='archived' ORDER BY status DESC, created_at DESC",
        (uid,)
    ).fetchall()
    return jsonify(success=True, goals=[enrich_goal(goal_row_to_dict(r)) for r in rows])

# -------- Update goal --------
@goals_bp.patch("/<int:goal_id>")
@login_required
def update_goal(goal_id: int):
    uid = g.user_id
    data = request.get_json(silent=True) or {}
    fields, params = [], []

    if "name" in data:
        fields.append("name=?"); params.append((data.get("name") or "").strip())
    if "category" in data:
        fields.append("category=?"); params.append(((data.get("category") or "").strip() or None))
    if "target_amount" in data:
        try:
            ta = float(data.get("target_amount"))
            assert ta > 0
        except Exception:
            return jsonify(success=False, message="Invalid target_amount"), 400
        fields.append("target_amount=?"); params.append(ta)
    if "target_date" in data:
        td = data.get("target_date")
        if td and iso_to_date(td) is None:
            return jsonify(success=False, message="Invalid target_date"), 400
        fields.append("target_date=?"); params.append(td)
    if "status" in data:
        st = (data.get("status") or "").strip().lower()
        if st not in ("active","achieved","archived"):
            return jsonify(success=False, message="Invalid status"), 400
        fields.append("status=?"); params.append(st)

    if not fields:
        return jsonify(success=False, message="No changes"), 400

    params.extend([goal_id, uid])
    db = get_db()
    db.execute(f"UPDATE goals SET {', '.join(fields)} WHERE id=? AND user_id=?", tuple(params))
    db.commit()
    row = db.execute("SELECT * FROM goals WHERE id=? AND user_id=?", (goal_id, uid)).fetchone()
    if not row:
        return jsonify(success=False, message="Not found"), 404
    return jsonify(success=True, goal=enrich_goal(goal_row_to_dict(row)))

# -------- Delete goal --------
@goals_bp.delete("/<int:goal_id>")
@login_required
def delete_goal(goal_id: int):
    uid = g.user_id
    db = get_db()
    # Clean contributions; ON DELETE CASCADE will also handle if enabled
    db.execute("DELETE FROM goal_contributions WHERE goal_id=? AND user_id=?", (goal_id, uid))
    cur = db.execute("DELETE FROM goals WHERE id=? AND user_id=?", (goal_id, uid))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(success=False, message="Not found"), 404
    return jsonify(success=True)

# -------- Contribute to goal (two variants) --------
@goals_bp.post("/<int:goal_id>/contribute")
@login_required
def contribute_path(goal_id: int):
    # Path variant: /api/goals/123/contribute
    return _contribute_common(goal_id)

@goals_bp.post("/contribute")
@login_required
def contribute_body():
    # Body variant (used by frontend): /api/goals/contribute with { "goal_id": N, ... }
    data = request.get_json(silent=True) or {}
    try:
        goal_id = int(data.get("goal_id") or 0)
    except Exception:
        goal_id = 0
    if goal_id <= 0:
        return jsonify(success=False, message="Missing goal_id"), 400
    return _contribute_common(goal_id)

def _contribute_common(goal_id: int):
    uid = g.user_id
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount") or 0)
    except Exception:
        amount = 0
    if amount <= 0:
        return jsonify(success=False, message="Invalid amount"), 400

    note = (data.get("note") or "").strip() or None
    created_at = data.get("created_at")
    record_tx = data.get("record_transaction", True)

    if created_at:
        try:
            datetime.fromisoformat(created_at.replace("Z",""))
        except Exception:
            created_at = None

    db = get_db()
    grow = db.execute("SELECT * FROM goals WHERE id=? AND user_id=?", (goal_id, uid)).fetchone()
    if not grow:
        return jsonify(success=False, message="Goal not found"), 404

    db.execute("UPDATE goals SET saved_amount = saved_amount + ? WHERE id=? AND user_id=?", (amount, goal_id, uid))
    db.execute("""
        INSERT INTO goal_contributions (user_id, goal_id, amount, note, created_at)
        VALUES (?,?,?,?,COALESCE(?, datetime('now')))
    """, (uid, goal_id, amount, note, created_at))

    if record_tx:
        desc = f"Contribution to Goal: {grow['name']}"
        db.execute("""
            INSERT INTO transactions (user_id, type, amount, category, description, created_at)
            VALUES (?,?,?,?,?,COALESCE(?, datetime('now')))
        """, (uid, "expense", amount, "Savings", desc, created_at))

    db.commit()
    row = db.execute("SELECT * FROM goals WHERE id=? AND user_id=?", (goal_id, uid)).fetchone()
    return jsonify(success=True, goal=enrich_goal(goal_row_to_dict(row)))

# -------- Contributions history --------
@goals_bp.get("/<int:goal_id>/history")
@login_required
def history(goal_id: int):
    uid = g.user_id
    rows = get_db().execute("""
        SELECT id, amount, note, created_at
        FROM goal_contributions
        WHERE user_id=? AND goal_id=?
        ORDER BY datetime(created_at) DESC
    """, (uid, goal_id)).fetchall()
    return jsonify(success=True, contributions=[dict(r) for r in rows])
