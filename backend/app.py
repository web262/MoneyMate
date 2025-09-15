# backend/app.py
import os
from pathlib import Path
from flask import Flask, send_from_directory
from dotenv import load_dotenv

# ── Load .env BEFORE importing routes/mailer ─────────────────────────────
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

def create_app():
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="/")
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        # SESSION_COOKIE_SECURE=True,  # enable when serving over HTTPS
    )

    # DB init
    from .database import init_app as init_db
    init_db(app)

    # ── Import blueprints AFTER env is loaded ────────────────────────────
    # Each blueprint defines its own url_prefix internally
    from .routes.auth import auth_bp                # /api/auth
    from .routes.transactions import tx_bp          # /api/transactions
    from .routes.budgets import budgets_bp          # /api/budgets
    from .routes.insights import insights_bp        # /api/insights
    from .routes.goals import goals_bp              # /api/goals
    from .routes.settings import settings_bp        # /api/settings
    from .routes.notifications import notifications_bp  # /api/notifications

    # ── Register blueprints (no double-prefixing) ────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(tx_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(insights_bp)
    app.register_blueprint(goals_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(notifications_bp)

    # ── Static / frontend ────────────────────────────────────────────────
    @app.route("/", methods=["GET"])
    def root():
        return send_from_directory(str(FRONTEND_DIR), "index.html")

    @app.route("/<path:path>", methods=["GET"])
    def static_proxy(path: str):
        return send_from_directory(str(FRONTEND_DIR), path)

    # Helpful sanity print (no secrets)
    print("\n[env] SMTP_HOST:", os.getenv("SMTP_HOST"))
    print("[env] SMTP_USERNAME:", os.getenv("SMTP_USERNAME"))
    print("[env] EMAIL_FROM:", os.getenv("EMAIL_FROM"), "\n")

    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
