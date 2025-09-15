# backend/routes/settings.py
from flask import Blueprint, request, jsonify, session
from ..database import get_db
from .auth import login_required

# All endpoints under /api/settings/*
settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")

def ensure_schema():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            currency_symbol TEXT NOT NULL DEFAULT '$',
            warn_threshold REAL NOT NULL DEFAULT 0.8,
            critical_threshold REAL NOT NULL DEFAULT 1.0,
            week_starts_monday INTEGER NOT NULL DEFAULT 0
        )
    """)
    db.commit()

@settings_bp.before_app_request
def before_any():
    ensure_schema()

def get_or_create(uid: int):
    db = get_db()
    row = db.execute("SELECT * FROM user_settings WHERE user_id=?", (uid,)).fetchone()
    if not row:
        db.execute("INSERT INTO user_settings(user_id) VALUES(?)", (uid,))
        db.commit()
        row = db.execute("SELECT * FROM user_settings WHERE user_id=?", (uid,)).fetchone()
    return row

# GET /api/settings/
@settings_bp.get("/")
@login_required
def read_settings():
    row = get_or_create(session["user_id"])
    return jsonify(success=True, settings=dict(row))

# POST /api/settings/
@settings_bp.post("/")
@login_required
def update_settings():
    data = request.get_json(silent=True) or {}
    sym  = (data.get("currency_symbol") or "$").strip()[:3]
    try:
        warn = float(data.get("warn_threshold") or 0.8)
    except Exception:
        warn = 0.8
    try:
        crit = float(data.get("critical_threshold") or 1.0)
    except Exception:
        crit = 1.0
    week = 1 if bool(data.get("week_starts_monday")) else 0

    # Clamp to sensible ranges
    warn = max(0.5, min(warn, 1.5))
    crit = max(0.6, min(crit, 2.0))

    db = get_db()
    db.execute("""
        INSERT INTO user_settings(user_id, currency_symbol, warn_threshold, critical_threshold, week_starts_monday)
        VALUES(?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
          currency_symbol=excluded.currency_symbol,
          warn_threshold=excluded.warn_threshold,
          critical_threshold=excluded.critical_threshold,
          week_starts_monday=excluded.week_starts_monday
    """, (session["user_id"], sym, warn, crit, week))
    db.commit()
    row = db.execute("SELECT * FROM user_settings WHERE user_id=?", (session["user_id"],)).fetchone()
    return jsonify(success=True, settings=dict(row))
