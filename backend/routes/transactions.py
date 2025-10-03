# backend/routes/transactions.py
from flask import Blueprint, request, jsonify, session, Response
from datetime import datetime
from ..database import get_db
from .auth import login_required

# All routes live under /api/transactions
tx_bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")

# ---------- DB bootstrap ----------
def ensure_schema():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('income','expense')) NOT NULL,
            amount REAL NOT NULL,
            category TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    db.commit()

@tx_bp.before_app_request
def _ensure():
    ensure_schema()

# ---------- auto-categorization ----------
KEYWORDS = {
    "groceries": ["grocery","supermarket","whole foods","aldi","lidl","shoprite"],
    "transport": ["uber","lyft","bus","train","metro","fuel","gas"],
    "rent": ["rent","landlord","apartment"],
    "utilities": ["electric","water","gas bill","internet","wifi"],
    "dining": ["restaurant","coffee","cafe","pizza","kfc","mcdonald","burger"],
    "shopping": ["amazon","mall","target","walmart","clothes","shoe"],
    "health": ["pharmacy","doctor","hospital","clinic"],
    "entertainment": ["netflix","spotify","movie","game"],
    "salary": ["salary","payroll","paycheck","wage"],
    "freelance": ["freelance","contract","gig","upwork","fiverr"],
    "interest": ["interest","dividend"],
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
# Supports both /api/transactions/ (preferred) and /api/transactions/add
@tx_bp.post("/")
@tx_bp.post("/add")
@login_required
def create_txn():
    data = request.get_json(silent=True) or {}

    tx_type = (data.get("type") or "").lower().strip()
    # Accept numbers with commas or string numbers
    raw_amount = (data.get("amount") or "").__str__().replace(",", "").strip()
    try:
        amount = float(raw_amount)
    except Exception:
        amount = 0.0

    description = (data.get("description") or "").strip()
    created_at = (data.get("created_at") or "").strip()
    category = (data.get("category") or "").strip() or auto_category(tx_type, description)

    if tx_type not in ("income", "expense") or amount <= 0:
        return jsonify(success=False, message="Invalid transaction payload"), 400

    # Normalize created_at if provided (accepts ISO with/without Z)
    if created_at:
        try:
            datetime.fromisoformat(created_at.replace("Z", ""))
        except Exception:
            created_at = None  # fallback to DB default

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO transactions (user_id, type, amount, category, description, created_at)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        """,
        (session["user_id"], tx_type, amount, category, description, created_at),
    )
    db.commit()
    tid = cur.lastrowid
    row = db.execute("SELECT * FROM transactions WHERE id=?", (tid,)).fetchone()
    return jsonify(success=True, transaction=dict(row)), 201

# ---------- list ----------
@tx_bp.get("/all")
@login_required
def list_txns():
    uid = session["user_id"]
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    try:
        page_size = int(request.args.get("page_size") or 100)
        if page_size <= 0:
            page_size = 100
    except Exception:
        page_size = 100

    sql = "SELECT * FROM transactions WHERE user_id=?"
    params = [uid]
    if start:
        sql += " AND date(created_at) >= date(?)"
        params.append(start)
    if end:
        sql += " AND date(created_at) <= date(?)"
        params.append(end)
    sql += " ORDER BY datetime(created_at) DESC LIMIT ?"
    params.append(page_size)

    rows = get_db().execute(sql, tuple(params)).fetchall()
    return jsonify(success=True, transactions=[dict(r) for r in rows])

# ---------- update ----------
@tx_bp.patch("/<int:txn_id>")
@login_required
def update_txn(txn_id: int):
    data = request.get_json(silent=True) or {}
    fields, params = [], []

    if "type" in data:
        t = (data.get("type") or "").lower().strip()
        if t not in ("income","expense"):
            return jsonify(success=False, message="Invalid type"), 400
        fields.append("type=?"); params.append(t)

    if "amount" in data:
        try:
            amt = float(str(data.get("amount")).replace(",", "").strip())
            assert amt > 0
        except Exception:
            return jsonify(success=False, message="Invalid amount"), 400
        fields.append("amount=?"); params.append(amt)

    if "description" in data:
        desc = (data.get("description") or "").strip()
        fields.append("description=?"); params.append(desc)
        # If client didn't send category but did send type, auto-update category
        if "category" not in data and ("type" in data or "type" not in data):
            t = next((p for i, p in enumerate(params[:-1]) if fields[i] == "type=?"), None) or \
                (data.get("type") or "")
            fields.append("category=?"); params.append(auto_category((t or "").lower(), desc))

    if "category" in data:
        cat = (data.get("category") or "").strip() or None
        fields.append("category=?"); params.append(cat)

    if "created_at" in data and data["created_at"]:
        fields.append("created_at=?"); params.append(data["created_at"])

    if not fields:
        return jsonify(success=False, message="No changes"), 400

    params.extend([txn_id, session["user_id"]])
    db = get_db()
    db.execute(
        f"UPDATE transactions SET {', '.join(fields)} WHERE id=? AND user_id=?",
        tuple(params),
    )
    db.commit()

    row = db.execute(
        "SELECT * FROM transactions WHERE id=? AND user_id=?",
        (txn_id, session["user_id"])
    ).fetchone()
    if not row:
        return jsonify(success=False, message="Not found"), 404
    return jsonify(success=True, transaction=dict(row))

# ---------- delete ----------
@tx_bp.delete("/<int:txn_id>")
@login_required
def delete_txn(txn_id: int):
    db = get_db()
    cur = db.execute("DELETE FROM transactions WHERE id=? AND user_id=?", (txn_id, session["user_id"]))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(success=False, message="Not found"), 404
    return jsonify(success=True)

# ---------- CSV export ----------
@tx_bp.get("/export")
@login_required
def export_csv():
    """
    Export user's transactions within optional date range as CSV.
    Query params: start_date=YYYY-MM-DD, end_date=YYYY-MM-DD
    """
    import csv, io
    uid = session["user_id"]
    start = request.args.get("start_date")
    end = request.args.get("end_date")

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

    payload = None
    if "file" in request.files:
        payload = request.files["file"].read()
    elif request.data:
        payload = request.data
    else:
        return jsonify(success=False, message="No CSV uploaded"), 400

    try:
        text = payload.decode("utf-8-sig")
    except Exception:
        return jsonify(success=False, message="CSV must be UTF-8 encoded"), 400

    f = io.StringIO(text)
    reader = csv.DictReader(f)
    if not reader.fieldnames:
        return jsonify(success=False, message="Missing header row"), 400

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
            amount = float(amount_s.replace(",", ""))
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
        """, (session["user_id"], tx_type, amount, desc, date_str)).fetchone()

        if dup:
            skipped += 1
            continue

        db.execute("""
            INSERT INTO transactions (user_id, type, amount, category, description, created_at)
            VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
        """, (session["user_id"], tx_type, amount, cat, desc, date_str))
        created += 1

    db.commit()
    return jsonify(success=True, created=created, skipped=skipped)
