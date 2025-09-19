# backend/app.py
import os
from pathlib import Path
from flask import Flask, jsonify
from dotenv import load_dotenv
from flask_cors import CORS

# ── Load .env BEFORE importing blueprints ────────────────────────────────
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent

# If you ever want to serve local static files, you can point FRONTEND_DIR there,
# but for GitHub Pages hosting we won't serve frontend from the backend.
FRONTEND_DIR = BASE_DIR.parent / "frontend"


def create_app() -> Flask:
    app = Flask(__name__)

    # ── Core config ───────────────────────────────────────────────────────
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",   # keep Lax since we are not using cookie auth cross-site
        JSON_SORT_KEYS=False,
    )

    # ── CORS: allow ONLY your GitHub Pages origins ───────────────────────
    # IMPORTANT: Change <your-username> and <repo> to your actual values.
    # From your screenshot the username is: SoftwareEngineeer
    allowed_origins = [
        "https://SoftwareEngineeer.github.io",
        "https://SoftwareEngineeer.github.io/MoneyMate",
    ]
    CORS(
        app,
        resources={r"/api/*": {"origins": allowed_origins}},
        supports_credentials=True,  # safe even if you use header JWTs; required for cookie auth
    )

    # ── DB init ───────────────────────────────────────────────────────────
    from .database import init_app as init_db
    init_db(app)

    # ── Blueprints (each has its own url_prefix like /api/auth, /api/tx, ...) ─
    from .routes.auth import auth_bp                # /api/auth
    from .routes.transactions import tx_bp          # /api/transactions
    from .routes.budgets import budgets_bp          # /api/budgets
    from .routes.insights import insights_bp        # /api/insights
    from .routes.goals import goals_bp              # /api/goals
    from .routes.settings import settings_bp        # /api/settings
    from .routes.notifications import notifications_bp  # /api/notifications

    app.register_blueprint(auth_bp)
    app.register_blueprint(tx_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(insights_bp)
    app.register_blueprint(goals_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(notifications_bp)

    # ── Health/diagnostics endpoints ──────────────────────────────────────
    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    # Optional: a simple root so opening the Render URL in a browser shows something
    @app.get("/")
    def index():
        return jsonify({
            "service": "MoneyMate API",
            "docs": "/api/health",
            "frontend": "https://SoftwareEngineeer.github.io/MoneyMate"
        })

    # ── Error handlers (JSON) ─────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    # Helpful sanity print (no secrets)
    print("\n[env] SMTP_HOST:", os.getenv("SMTP_HOST"))
    print("[env] SMTP_USERNAME:", os.getenv("SMTP_USERNAME"))
    print("[env] EMAIL_FROM:", os.getenv("EMAIL_FROM"), "\n")

    return app


# For local 'python backend/app.py' runs only
app = create_app()

if __name__ == "__main__":
    # Local dev server; Render will use Gunicorn via wsgi.py
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
