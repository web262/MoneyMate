# backend/app.py
import os
from pathlib import Path
from flask import Flask, jsonify
from dotenv import load_dotenv
from flask_cors import CORS

# Load .env from repo root
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

def create_app() -> Flask:
    app = Flask(__name__)

    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        JSON_SORT_KEYS=False,
    )

    # ---- CORS ---------------------------------------------------------------
    # Allow your GitHub Pages domain (comma-separate if you need more)
    allowed_origins = os.environ.get(
        "ALLOWED_ORIGINS",
        "https://web262.github.io"
    )
    allowed = [o.strip().lower() for o in allowed_origins.split(",") if o.strip()]

    CORS(
        app,
        resources={r"/api/*": {"origins": allowed}},
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        supports_credentials=True,
    )
    # ------------------------------------------------------------------------

    # ---- DB init -----------------------------------------------------------
    # (requires backend/__init__.py so 'backend' is a package)
    from .database import init_app as init_db
    init_db(app)
    # ------------------------------------------------------------------------

    # ---- Routes / Blueprints -----------------------------------------------
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
    # ------------------------------------------------------------------------

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/")
    def index():
        return jsonify({
            "service": "MoneyMate API",
            "docs": "/api/health",
            "frontend": "https://web262.github.io/MoneyMate",
        })

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"error": "Internal server error"}), 500

    print("\n[CORS] Allowed origins:", allowed)
    print("[env] SMTP_HOST:", os.getenv("SMTP_HOST"))
    print("[env] SMTP_USERNAME:", os.getenv("SMTP_USERNAME"))
    print("[env] EMAIL_FROM:", os.getenv("EMAIL_FROM"), "\n")

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
