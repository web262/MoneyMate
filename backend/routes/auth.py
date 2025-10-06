# backend/routes/auth.py
from flask import Blueprint, request, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from functools import wraps
import re, secrets, os, jwt

from ..database import get_db
from ..utils.mailer import send_email, build_reset_email

# ─────────────────── Config ───────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
JWT_EXP_HOURS = int(os.getenv("JWT_EXP_HOURS", 12))
JWT_ALG = "HS256"

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# ─────────────────── schema ───────────────────
def ensure_schema():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    db.commit()

@auth_bp.before_app_request
def _ensure_auth_schema():
    ensure_schema()

# ─────────────────── helpers ───────────────────
def _get_payload():
    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form.to_dict(flat=True)

    name = (
        data.get("name")
        or data.get("fullName")
        or data.get("fullname")
        or data.get("full_name")
        or ""
    ).strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm = data.get("confirm_password") or data.get("confirmPassword") or ""
    return name, email, password, confirm

def valid_password(p: str) -> bool:
    return bool(p) and len(p) >= 6

def generate_jwt(user_id, email):
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXP_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALG)

def _decode_bearer_token():
    """Return (user_id, email) if Authorization: Bearer <jwt> is valid; else (None, None)."""
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None, None
    token = auth.split(" ", 1)[1].strip()
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALG])
        return data.get("sub"), data.get("email")
    except Exception:
        return None, None

def get_current_user_id():
    """Prefer session, but accept a valid JWT bearer token for stateless requests."""
    uid = session.get("user_id")
    if uid:
        g.user_id = uid
        return uid
    uid, _ = _decode_bearer_token()
    if uid:
        g.user_id = uid
        return uid
    return None

# ─────────────────── guard ───────────────────
def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        uid = get_current_user_id()
        if not uid:
            return jsonify(success=False, message="Unauthorized"), 401
        return fn(*args, **kwargs)
    return wrapper

# ─────────────────── Register ───────────────────
@auth_bp.post("/register")
def register():
    name, email, password, confirm = _get_payload()
    if not name:
        return jsonify(success=False, message="Name is required"), 400
    if not EMAIL_RE.match(email):
        return jsonify(success=False, message="Please enter a valid email"), 400
    if not valid_password(password):
        return jsonify(success=False, message="Password must be at least 6 characters"), 400
    if confirm and password != confirm:
        return jsonify(success=False, message="Passwords do not match"), 400

    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone()
    if exists:
        return jsonify(success=False, message="Email already registered"), 409

    db.execute(
        "INSERT INTO users(name,email,password_hash) VALUES(?,?,?)",
        (name, email, generate_password_hash(password)),
    )
    db.commit()
    return jsonify(success=True, message="Account created. Please sign in."), 201

# ─────────────────── Login / Logout / Me ───────────────────
@auth_bp.post("/login")
def login():
    _, email, password, _ = _get_payload()
    if not EMAIL_RE.match(email) or not password:
        return jsonify(success=False, message="Invalid email or password"), 400

    row = get_db().execute(
        "SELECT id, name, email, password_hash FROM users WHERE email=?", (email,)
    ).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify(success=False, message="Invalid email or password"), 401

    # Keep Flask session cookie around (pairs with PERMANENT_SESSION_LIFETIME in app config)
    session["user_id"] = row["id"]
    session.permanent = True

    token = generate_jwt(row["id"], row["email"])
    return jsonify(
        success=True,
        access_token=token,
        user={"id": row["id"], "name": row["name"], "email": row["email"]},
    )


@auth_bp.post("/logout")
def logout():
    # Stateless JWT cannot be invalidated server-side; we just clear session.
    session.pop("user_id", None)
    return jsonify(success=True)

@auth_bp.get("/me")
def me():
    uid = get_current_user_id()
    if not uid:
        return jsonify(success=False), 401
    r = get_db().execute("SELECT id, name, email FROM users WHERE id=?", (uid,)).fetchone()
    return jsonify(success=True, data=dict(r) if r else None)

# ─────────────────── Change password ───────────────────
@auth_bp.post("/change-password")
@login_required
def change_password():
    uid = g.user_id  # set by login_required
    data = request.get_json(silent=True) or request.form.to_dict(flat=True) or {}
    cur = data.get("current_password") or ""
    new = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""

    if not valid_password(new):
        return jsonify(success=False, message="New password must be at least 6 characters"), 400
    if confirm and new != confirm:
        return jsonify(success=False, message="Passwords do not match"), 400

    db = get_db()
    row = db.execute("SELECT password_hash FROM users WHERE id=?", (uid,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], cur):
        return jsonify(success=False, message="Current password is incorrect"), 400

    db.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), uid))
    db.commit()
    return jsonify(success=True, message="Password changed")

# ─────────────────── Forgot password ───────────────────
@auth_bp.post("/forgot-start")
def forgot_start():
    data = request.get_json(silent=True) or request.form.to_dict(flat=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return jsonify(success=True)

    db = get_db()
    u = db.execute("SELECT id, name FROM users WHERE email=?", (email,)).fetchone()
    if not u:
        return jsonify(success=True)

    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(hours=2)).isoformat()
    db.execute(
        "INSERT INTO password_resets(user_id, token, expires_at) VALUES(?,?,?)",
        (u["id"], token, expires),
    )
    db.commit()

    front = os.getenv("FRONTEND_URL", "http://127.0.0.1:5000")
    link = f"{front}/reset.html?token={token}"
    app_name = os.getenv("APP_NAME", "MoneyMate")

    html, text = build_reset_email(u["name"], link, app_name)
    send_email(email, f"{app_name} – Reset your password", html, text)
    return jsonify(success=True)

@auth_bp.post("/forgot-complete")
def forgot_complete():
    data = request.get_json(silent=True) or request.form.to_dict(flat=True) or {}
    token = (data.get("token") or "").strip()
    new   = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""

    if not token or not valid_password(new):
        return jsonify(success=False, message="Invalid data"), 400
    if confirm and new != confirm:
        return jsonify(success=False, message="Passwords do not match"), 400

    db = get_db()
    row = db.execute("""
        SELECT pr.id, pr.user_id, pr.expires_at, pr.used
        FROM password_resets pr WHERE pr.token=?
    """, (token,)).fetchone()
    if not row:
        return jsonify(success=False, message="Invalid token"), 400
    if row["used"]:
        return jsonify(success=False, message="Token already used"), 400

    try:
        exp = datetime.fromisoformat(row["expires_at"])
    except Exception:
        return jsonify(success=False, message="Invalid token"), 400

    if datetime.utcnow() > exp:
        return jsonify(success=False, message="Token expired"), 400

    db.execute(
        "UPDATE users SET password_hash=? WHERE id=?",
        (generate_password_hash(new), row["user_id"])
    )
    db.execute("UPDATE password_resets SET used=1 WHERE id=?", (row["id"],))
    db.commit()
    return jsonify(success=True, message="Password reset successful")
