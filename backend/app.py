# backend/app.py
import os
from pathlib import Path
from datetime import timedelta        # <-- needed for PERMANENT_SESSION_LIFETIME
from flask import Flask, jsonify
from dotenv import load_dotenv
from flask_cors import CORS

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

def create_app() -> Flask:
    app = Flask(__name__)

    # Core app/session config
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        # cross-site cookie because frontend is on github.io and API on render.com
        SESSION_COOKIE_SAMESITE="None",
        SESSION_COOKIE_SECURE=True,
        PERMANENT_SESSION_LIFETIME=timedelta(days=14),
        JSON_SORT_KEYS=False,
    )

    # Accept both /path and /path/ to avoid 308 redirects on preflight
    app.url_map.strict_slashes = False

    # ---- CORS ----
    # Allow GitHub Pages + your Render domain by default (override via ALLOWED_ORIGINS)
    default_origins = [
        "https://web262.github.io",
        "https://moneymate-2.onrender.com",
    ]
    env_origins = os.environ.get("ALLOWED_ORIGINS", "")
    allowed = default_origins + [o.strip() for o in env_origins.split(",") if o.strip()]
    # de-duplicate and lower-case for safety
    allowed = sorted({o.lower() for o in allowed})

    CORS(
        app,
        resources={r"/api/*": {"origins": allowed}},
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        supports_credentials=True,  # allow cookies if a same-site flow is used
        max_age=600,
    )

    # ---- DB + routes ----
    from .database import init_app as init_db
    init_db(app)

    from .routes.auth import auth_bp
    from .routes.transactions import tx_bp
    from .routes.budgets import budgets_bp
    from .routes.insights import insights_bp
    from .routes.goals import goals_bp
    from .routes.settings import settings_bp
    from .routes.notifications import notifications_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(tx_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(insights_bp)
    app.register_blueprint(goals_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(notifications_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/")
    def index():
        return jsonify({
            "service": "MoneyMate API",
            "docs": "/api/health",
            "frontend": "https://web262.github.io/MoneyMate",
            "cors_allowed": allowed,
        })

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    print("\n[CORS] Allowed origins:", allowed, "\n")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
