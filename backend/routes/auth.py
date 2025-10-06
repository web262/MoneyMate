# backend/routes/auth.py
from flask import Blueprint, request, jsonify, session, g, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from functools import wraps
import re, secrets, jwt, os

from ..database import get_db
from ..utils.mailer import send_email, build_reset_email

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# ─────────────────── Config ───────────────────
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
JWT_ALG = "HS256"

def _jwt_exp_hours() -> int:
    try:
        return int(os.getenv("JWT_EXP_HOURS", 12))
    except Exception:
        return 12

# ─────────────────── Helpers ───────────────────
def _json_or_form():
    """Safely read JSON or form."""
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict(flat=True) or {}

def _get_payload():
    data = _json_or_form()
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

def _secret():
    # Always read from app config so Render env var is used
    return current_app.config.get("SECRET_KEY", "dev-secret")

def generate_jwt(user_id, email):
    payload = {
        "sub": int(user_id),
        "email": email,
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int((datetime.utcnow() + timedelta(hours=_jwt_exp_hours())).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)

def _decode_bearer_token():
    """Return (user_id, email) if Authorization: Bearer <jwt> is valid; else (None, None)."""
    auth = request.headers.get("Authorization", "")
    if not auth or not auth.lower().startswith("bearer "):
        return None, None
    token = auth.split(" ", 1)[1].strip()
    try:
        data = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
        return data.get("sub"), data.get("email")
    except Exception:
        return None, None

def get_current_user_id():
    """
    Prefer JWT (stateless). Keep session as a fallback for same-site demos.
    NOTE: On GitHub Pages (cross-site), cookies may be blocked — the JWT path is what your UI should use.
    """
    uid, _ = _decode_bearer_token()
    if uid:
        g.user_id = uid
        return uid

    uid = session.get("user_id")
    if uid:
        g.user_id = uid
        return uid

    return None

# ─────────────────── Guard ───────────────────
def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        uid = get_current_user_id()
        if not uid:
            return jsonify(ok=False, success=False, message="Unauthorized"), 401
        return fn(*args, **kwargs)
    return wrapper

# ─────────────────── Register ───────────────────
@auth_bp.post("/register")
def register():
    name, email, password, confirm = _get_payload()
    if not name:
        return jsonify(ok=False, success=False, message="Name is required"), 400
    if not EMAIL_RE.match(email):
        return jsonify(ok=False, success=False, message="Please enter a valid email"), 400
    if not valid_password(password):
        return jsonify(ok=False, success=False, message="Password must be at least 6 characters"), 400
    if confirm and password != confirm:
        return jsonify(ok=False, success=False, message="Passwords do not match"), 400

    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone()
    if exists:
        return jsonify(ok=False, success=False, message="Email already registered"), 409

    db.execute(
        "INSERT INTO users(name,email,password_hash) VALUES(?,?,?)",
        (name, email, generate_password_hash(password)),
    )
    db.commit()

    # Issue token right away (so the user can proceed without separate login)
    user_id = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
    token = generate_jwt(user_id, email)
    return jsonify(
        ok=True, success=True,
        message="Account created",
        access_token=token,
        user={"id": user_id, "name": name, "email": email},
    ), 201

# ─────────────────── Login / Logout / Me ───────────────────
@auth_bp.post("/login")
def login():
    _, email, password, _ = _get_payload()
    if not EMAIL_RE.match(email) or not password:
        return jsonify(ok=False, success=False, message="Invalid email or password"), 400

    row = get_db().execute(
        "SELECT id, name, email, password_hash FROM users WHERE email=?", (email,)
    ).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify(ok=False, success=False, message="Invalid email or password"), 401

    # Optional: keep a session for same-site deployments (not needed on GitHub Pages)
    session["user_id"] = row["id"]
    session.permanent = True

    token = generate_jwt(row["id"], row["email"])
    return jsonify(
        ok=True, success=True,
        access_token=token,
        user={"id": row["id"], "name": row["name"], "email": row["email"]},
    )

@auth_bp.post("/logout")
def logout():
    # Stateless JWT cannot be invalidated server-side; just clear session if any.
    session.pop("user_id", None)
    return jsonify(ok=True, success=True)

@auth_bp.get("/me")
def me():
    uid = get_current_user_id()
    if not uid:
        return jsonify(ok=False, success=False), 401
    r = get_db().execute("SELECT id, name, email FROM users WHERE id=?", (uid,)).fetchone()
    return jsonify(ok=True, success=True, data=(dict(r) if r else None))

# ─────────────────── Token verify/refresh (lightweight) ───────────────────
@auth_bp.post("/token/verify")
def token_verify():
    uid, email = _decode_bearer_token()
    if not uid:
        return jsonify(ok=False, success=False), 401
    return jsonify(ok=True, success=True, user_id=uid, email=email)

@auth_bp.post("/token/refresh")
def token_refresh():
    uid, email = _decode_bearer_token()
    if not uid:
        return jsonify(ok=False, success=False), 401
    new_token = generate_jwt(uid, email)
    return jsonify(ok=True, success=True, access_token=new_token)

# ─────────────────── Change password ───────────────────
@auth_bp.post("/change-password")
@login_required
def change_password():
    uid = g.user_id
    data = _json_or_form()
    cur = data.get("current_password") or ""
    new = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""

    if not valid_password(new):
        return jsonify(ok=False, success=False, message="New password must be at least 6 characters"), 400
    if confirm and new != confirm:
        return jsonify(ok=False, success=False, message="Passwords do not match"), 400

    db = get_db()
    row = db.execute("SELECT password_hash FROM users WHERE id=?", (uid,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], cur):
        return jsonify(ok=False, success=False, message="Current password is incorrect"), 400

    db.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), uid))
    db.commit()
    return jsonify(ok=True, success=True, message="Password changed")

# ─────────────────── Forgot password ───────────────────
@auth_bp.post("/forgot-start")
def forgot_start():
    data = _json_or_form()
    email = (data.get("email") or "").strip().lower()
    # always return ok to avoid account enumeration
    if not EMAIL_RE.match(email):
        return jsonify(ok=True, success=True)

    db = get_db()
    u = db.execute("SELECT id, name FROM users WHERE email=?", (email,)).fetchone()
    if not u:
        return jsonify(ok=True, success=True)

    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(hours=2)).isoformat()
    db.execute(
        "INSERT INTO password_resets(user_id, token, expires_at) VALUES(?,?,?)",
        (u["id"], token, expires),
    )
    db.commit()

    front = os.getenv("FRONTEND_URL", "https://web262.github.io/MoneyMate")
    link = f"{front}/reset.html?token={token}"
    app_name = os.getenv("APP_NAME", "MoneyMate")

    html, text = build_reset_email(u["name"], link, app_name)
    send_email(email, f"{app_name} – Reset your password", html, text)
    return jsonify(ok=True, success=True)

@auth_bp.post("/forgot-complete")
def forgot_complete():
    data = _json_or_form()
    token = (data.get("token") or "").strip()
    new   = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""

    if not token or not valid_password(new):
        return jsonify(ok=False, success=False, message="Invalid data"), 400
    if confirm and new != confirm:
        return jsonify(ok=False, success=False, message="Passwords do not match"), 400

    db = get_db()
    row = db.execute("""
        SELECT pr.id, pr.user_id, pr.expires_at, pr.used
        FROM password_resets pr WHERE pr.token=?
    """, (token,)).fetchone()
    if not row:
        return jsonify(ok=False, success=False, message="Invalid token"), 400
    if row["used"]:
        return jsonify(ok=False, success=False, message="Token already used"), 400

    try:
        exp = datetime.fromisoformat(row["expires_at"])
    except Exception:
        return jsonify(ok=False, success=False, message="Invalid token"), 400

    if datetime.utcnow() > exp:
        return jsonify(ok=False, success=False, message="Token expired"), 400

    db.execute(
        "UPDATE users SET password_hash=? WHERE id=?",
        (generate_password_hash(new), row["user_id"])
    )
    db.execute("UPDATE password_resets SET used=1 WHERE id=?", (row["id"],))
    db.commit()
    return jsonify(ok=True, success=True, message="Password reset successful")
