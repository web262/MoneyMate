# backend/routes/transactions.py
from flask import Blueprint, request, jsonify, Response, g
from datetime import datetime
from ..database import get_db
from .auth import login_required, get_current_user_id  # uses same JWT/session helper

# All routes live under /api/transactions
tx_bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")

# ---------- DB bootstrap ----------
def ensure_schema():
    db = get_db()
    db.executescript("""
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('income','expense')) NOT NULL,
            amount REAL NOT NULL,
            category TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- helpful indexes for speed
        CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, datetime(created_at));
        CREATE INDEX IF NOT EXISTS idx_tx_user_type ON transactions(user_id, type);
        CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category);
    """)
    db.commit()

@tx_bp.before_app_request
def _ensure():
    ensure_schema()

# Utility: current user id (from JWT or session)
def _uid():
    return getattr(g, "user_id", None) or get_current_user_id()

# ---------- auto-categorization ----------
KEYWORDS = {
    "groceries": ["grocery","supermarket","whole foods","aldi","lidl","shoprite","big c","vinmart","lotte"],
    "transport": ["uber","lyft","bus","train","metro","fuel","gas","grab","taxi","subway"],
    "rent": ["rent","landlord","apartment","lease"],
    "utilities": ["electric","water","gas bill","internet","wifi","fiber","power"],
    "dining": ["restaurant","coffee","cafe","pizza","kfc","mcdonald","burger","pho","banh mi","biryani"],
    "shopping": ["amazon","mall","target","walmart","clothes","shoe","zara","uniqlo"],
    "health": ["pharmacy","doctor","hospital","clinic","medicine"],
    "entertainment": ["netflix","spotify","movie","game","cinema"],
    "salary": ["salary","payroll","paycheck","wage","stipend"],
    "freelance": ["freelance","contract","gig","upwork","fiverr"],
    "interest": ["interest","dividend","yield"],
}
def auto_category(tx_type: str, description: str) -> str:
    if not description:
        return "Income" if tx_type == "income" else "Uncategorized"
    desc = description.lower()
    for cat, keys in KEYWORDS.items():
        if any(k in desc for k in keys):
            return cat.capitalize()
    return "Income" if tx_type == "income" else "Uncategorized"

# ---------- create ----------
# Supports both /api/transactions (preferred) and /api/transactions/add
@tx_bp.post("")
@tx_bp.post("/")
@tx_bp.post("/add")
@login_required
def create_txn():
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401

    data = request.get_json(silent=True) or {}

    tx_type = (data.get("type") or "").lower().strip()
    raw_amount = str(data.get("amount") or "").replace(",", "").strip()
    try:
        amount = float(raw_amount)
    except Exception:
        amount = 0.0

    description = (data.get("description") or "").strip()
    created_at = (data.get("created_at") or "").strip()
    category = (data.get("category") or "").strip() or auto_category(tx_type, description)

    if tx_type not in ("income", "expense") or amount <= 0:
        return jsonify(ok=False, success=False, message="Invalid transaction payload"), 400

    if created_at:
        try:
            # tolerate trailing Z
            datetime.fromisoformat(created_at.replace("Z", ""))
        except Exception:
            created_at = None  # fallback to DB default

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO transactions (user_id, type, amount, category, description, created_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        """,
        (uid, tx_type, amount, category or None, description or None, created_at),
    )
    db.commit()
    tid = cur.lastrowid
    row = db.execute("SELECT * FROM transactions WHERE id=? AND user_id=?", (tid, uid)).fetchone()
    return jsonify(ok=True, success=True, transaction=dict(row)), 201

# ---------- list ----------
# Provide both "" and "/all" to avoid breaking older UI calls
@tx_bp.get("")
@tx_bp.get("/")
@tx_bp.get("/all")
@login_required
def list_txns():
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401

    # filters
    start = request.args.get("start_date") or request.args.get("from")
    end   = request.args.get("end_date") or request.args.get("to")
    ftype = request.args.get("type")
    cat   = request.args.get("category")

    try:
        page_size = int(request.args.get("page_size") or 100)
        if page_size <= 0 or page_size > 1000:
            page_size = 100
    except Exception:
        page_size = 100

    where, params = ["user_id = ?"], [uid]
    if ftype in ("income","expense"):
        where.append("type = ?"); params.append(ftype)
    if cat:
        where.append("category = ?"); params.append(cat)
    if start:
        where.append("date(created_at) >= date(?)"); params.append(start)
    if end:
        where.append("date(created_at) <= date(?)"); params.append(end)

    sql = f"""
        SELECT id, type, amount, category, description, created_at
        FROM transactions
        WHERE {' AND '.join(where)}
        ORDER BY datetime(created_at) DESC
        LIMIT ?
    """
    params.append(page_size)

    rows = get_db().execute(sql, tuple(params)).fetchall()
    return jsonify(ok=True, success=True, transactions=[dict(r) for r in rows])

# ---------- update ----------
@tx_bp.patch("/<int:txn_id>")
@login_required
def update_txn(txn_id: int):
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401

    data = request.get_json(silent=True) or {}
    fields, params = [], []

    if "type" in data:
        t = (data.get("type") or "").lower().strip()
        if t not in ("income","expense"):
            return jsonify(ok=False, success=False, message="Invalid type"), 400
        fields.append("type=?"); params.append(t)

    if "amount" in data:
        try:
            amt = float(str(data.get("amount")).replace(",", "").strip())
            assert amt > 0
        except Exception:
            return jsonify(ok=False, success=False, message="Invalid amount"), 400
        fields.append("amount=?"); params.append(amt)

    if "description" in data:
        desc = (data.get("description") or "").strip()
        fields.append("description=?"); params.append(desc)
        # If client didn't send category but did send/has type, auto-update category from desc
        if "category" not in data:
            # prefer new type if provided in this patch, else keep existing
            new_type = None
            for i, f in enumerate(fields):
                if f == "type=?":
                    new_type = params[i]
                    break
            if not new_type:
                # get existing type
                cur = get_db().execute("SELECT type FROM transactions WHERE id=? AND user_id=?", (txn_id, uid)).fetchone()
                new_type = (cur["type"] if cur else "").lower()
            if new_type in ("income","expense"):
                fields.append("category=?"); params.append(auto_category(new_type, desc))

    if "category" in data:
        cat = (data.get("category") or "").strip() or None
        fields.append("category=?"); params.append(cat)

    if "created_at" in data and data["created_at"]:
        # accept ISO or fallback
        try:
            datetime.fromisoformat(str(data["created_at"]).replace("Z",""))
        except Exception:
            return jsonify(ok=False, success=False, message="created_at must be ISO 8601"), 400
        fields.append("created_at=?"); params.append(data["created_at"])

    if not fields:
        return jsonify(ok=False, success=False, message="No changes"), 400

    params.extend([txn_id, uid])
    db = get_db()
    db.execute(
        f"UPDATE transactions SET {', '.join(fields)} WHERE id=? AND user_id=?",
        tuple(params),
    )
    db.commit()

    row = db.execute(
        "SELECT * FROM transactions WHERE id=? AND user_id=?",
        (txn_id, uid)
    ).fetchone()
    if not row:
        return jsonify(ok=False, success=False, message="Not found"), 404
    return jsonify(ok=True, success=True, transaction=dict(row))

# ---------- delete ----------
@tx_bp.delete("/<int:txn_id>")
@login_required
def delete_txn(txn_id: int):
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401
    db = get_db()
    cur = db.execute("DELETE FROM transactions WHERE id=? AND user_id=?", (txn_id, uid))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(ok=False, success=False, message="Not found"), 404
    return jsonify(ok=True, success=True)

# ---------- CSV export ----------
@tx_bp.get("/export")
@login_required
def export_csv():
    """
    Export user's transactions within optional date range as CSV.
    Query params: start_date=YYYY-MM-DD, end_date=YYYY-MM-DD
    """
    import csv, io
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401

    start = request.args.get("start_date")
    end   = request.args.get("end_date")

    sql = """
        SELECT id, type, amount, category, description, created_at
        FROM transactions WHERE user_id=?
    """
    params = [uid]
    if start:
        sql += " AND date(created_at) >= date(?)"; params.append(start)
    if end:
        sql += " AND date(created_at) <= date(?)"; params.append(end)
    sql += " ORDER BY datetime(created_at) DESC"

    rows = get_db().execute(sql, tuple(params)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date","type","amount","category","description"])
    for r in rows:
        writer.writerow([
            (r["created_at"] or "")[:19].replace("T"," "),
            r["type"],
            f'{float(r["amount"]):.2f}',
            r["category"] or "",
            r["description"] or "",
        ])
    csv_data = output.getvalue()
    output.close()

    fname = f"transactions_{start or 'all'}_{end or 'all'}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{fname}"',
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
    }
    return Response(csv_data, headers=headers)

# ---------- CSV import ----------
@tx_bp.post("/import")
@login_required
def import_csv():
    """
    Import CSV of transactions. Accepts:
      - multipart/form-data with file field named 'file', or
      - text/csv bytes as raw body.
    Expected headers (case-insensitive):
      date|created_at, type, amount, category (optional), description
    """
    import csv, io
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401

    payload = None
    if "file" in request.files:
        payload = request.files["file"].read()
    elif request.data:
        payload = request.data
    else:
        return jsonify(ok=False, success=False, message="No CSV uploaded"), 400

    try:
        text = payload.decode("utf-8-sig")
    except Exception:
        return jsonify(ok=False, success=False, message="CSV must be UTF-8 encoded"), 400

    f = io.StringIO(text)
    reader = csv.DictReader(f)
    if not reader.fieldnames:
        return jsonify(ok=False, success=False, message="Missing header row"), 400

    def pick(row, names):
        for n in names:
            if n in row and row[n] != "":
                return row[n]
        return ""

    created = skipped = 0
    db = get_db()

    for row in reader:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}

        date_str = pick(r, ["date","created_at"])
        tx_type  = (pick(r, ["type"]) or "").lower()
        amount_s = pick(r, ["amount"])
        category = pick(r, ["category"])
        desc     = pick(r, ["description","memo","note"])

        try:
            amount = float(str(amount_s).replace(",", ""))
        except Exception:
            skipped += 1; continue
        if tx_type not in ("income","expense"):
            skipped += 1; continue

        cat = category or auto_category(tx_type, desc)

        # duplicate guard: same minute + type + amount + description
        dup = db.execute("""
            SELECT id FROM transactions
            WHERE user_id=? AND type=? AND ABS(amount-?)<0.0001
              AND IFNULL(description,'')=?
              AND substr(created_at,1,16)=substr(?,1,16)
            LIMIT 1
        """, (uid, tx_type, amount, desc, date_str)).fetchone()

        if dup:
            skipped += 1
            continue

        db.execute("""
            INSERT INTO transactions (user_id, type, amount, category, description, created_at)
            VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        """, (uid, tx_type, amount, cat, desc, date_str))
        created += 1

    db.commit()
    return jsonify(ok=True, success=True, created=created, skipped=skipped)

# ---------- summary ----------
@tx_bp.get("/summary")
@login_required
def summary():
    """
    Returns totals by type, totals by category, and last 14 days daily breakdown.
    """
    uid = _uid()
    if not uid:
        return jsonify(ok=False, success=False, message="Unauthorized"), 401

    db = get_db()
    # totals by type
    totals = db.execute("""
        SELECT type, ROUND(SUM(amount),2) as total
        FROM transactions
        WHERE user_id=?
        GROUP BY type
    """, (uid,)).fetchall()

    # totals by category
    cats = db.execute("""
        SELECT COALESCE(category,'Uncategorized') as category, ROUND(SUM(amount),2) as total
        FROM transactions
        WHERE user_id=?
        GROUP BY COALESCE(category,'Uncategorized')
        ORDER BY total DESC
    """, (uid,)).fetchall()

    # last 14 days daily net (income - expense)
    daily = db.execute("""
        WITH days AS (
            SELECT date('now', '-' || n || ' day') AS d
            FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
                  UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
                  UNION ALL SELECT 13)
        )
        SELECT d as date,
               ROUND(COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount END),0),2) as income,
               ROUND(COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount END),0),2) as expense,
               ROUND(COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount
                                       WHEN t.type='expense' THEN -t.amount END),0),2) as net
        FROM days
        LEFT JOIN transactions t ON date(t.created_at)=d AND t.user_id=?
        GROUP BY d
        ORDER BY d ASC
    """, (uid,)).fetchall()

    return jsonify(
        ok=True, success=True,
        totals={r["type"]: r["total"] for r in totals},
        by_category=[dict(r) for r in cats],
        daily=[dict(r) for r in daily],
    )
