# backend/database.py
import sqlite3
from pathlib import Path
from flask import g, current_app

DB_PATH = Path(__file__).resolve().parent / "moneymate.db"

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
"""

PRAGMAS = [
    ("journal_mode", "WAL"),
    ("synchronous", "NORMAL"),
    ("temp_store", "MEMORY"),
    ("foreign_keys", "ON"),
]

def _connect():
    db = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    db.row_factory = sqlite3.Row
    cur = db.cursor()
    for k, v in PRAGMAS:
        cur.execute(f"PRAGMA {k}={v};")
    cur.close()
    return db

def get_db():
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = _connect()
    return g.db

def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def _ensure_schema():
    db = _connect()
    try:
        db.executescript(SCHEMA_SQL)
        db.commit()
    finally:
        db.close()

def init_db(app):
    """
    Flask 3: no before_first_request. Ensure schema eagerly at startup,
    then register teardown for per-request connection cleanup.
    """
    with app.app_context():
        _ensure_schema()
        if current_app:
            current_app.logger.info("DB schema ensured at startup.")

    app.teardown_appcontext(close_db)
