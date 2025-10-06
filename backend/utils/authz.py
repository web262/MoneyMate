# backend/utils/authz.py
import jwt
from functools import wraps
from flask import request, jsonify, current_app, g

def require_jwt(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"ok": False, "error": "Missing bearer token"}), 401
        token = auth.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
            g.user_id = int(payload["sub"])
        except Exception:
            return jsonify({"ok": False, "error": "Invalid or expired token"}), 401
        return f(*args, **kwargs)
    return wrapper
