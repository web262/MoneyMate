# backend/database.py
import os
import sqlite3
from pathlib import Path
from flask import g

# ---- DB path ----
DB_PATH = Path(__file__).resolve().parent / "moneymate.db"

# ---- Schema (extend later as you add features) ----
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
"""

PRAGMAS = [
    ("journal_mode", "WAL"),     # better concurrency
    ("synchronous", "NORMAL"),   # durability/perf tradeoff (safe for web apps)
    ("temp_store", "MEMORY"),
    ("foreign_keys", "ON"),
]

# ---- Connection helpers ----
def _connect():
    db = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    db.row_factory = sqlite3.Row
    # Apply pragmas
    cur = db.cursor()
    for key, val in PRAGMAS:
        cur.execute(f"PRAGMA {key}={val};")
    cur.close()
    return db

def get_db():
    """Get a per-request SQLite connection."""
    if "db" not in g:
        # Ensure parent dir exists (in case of containerized fresh start)
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = _connect()
    return g.db

def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

# ---- Initialization ----
def _ensure_schema():
    db = _connect()
    try:
        db.executescript(SCHEMA_SQL)
        db.commit()
    finally:
        db.close()

def init_app(app):
    """
    Wire DB lifecycle to the Flask app.
    - Creates schema on first request (and on each cold start).
    - Closes the connection after each request.
    """
    @app.before_first_request
    def _init():
        _ensure_schema()

    app.teardown_appcontext(close_db)

    # Optional: CLI command to (re)create schema manually:
    @app.cli.command("init-db")
    def init_db_cmd():
        """Initialize the database schema."""
        _ensure_schema()
        print("Initialized the database.")
