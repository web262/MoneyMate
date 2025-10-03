# backend/app.py
import os
from pathlib import Path
from flask import Flask, jsonify, request
from dotenv import load_dotenv
from flask_cors import CORS

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

def create_app() -> Flask:
    app = Flask(__name__)

    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        JSON_SORT_KEYS=False,
    )

    # Accept both /path and /path/ (avoids 308 redirects that break CORS preflights)
    app.url_map.strict_slashes = False

    # ---- CORS ---------------------------------------------------------------
    # Allow your GitHub Pages origin (override in Render via ALLOWED_ORIGINS)
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "https://web262.github.io")
    allowed_set = {o.strip().lower() for o in allowed_origins.split(",") if o.strip()}

    CORS(
        app,
        resources={r"/api/*": {"origins": list(allowed_set)}},
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        supports_credentials=True,
    )

    # Universal preflight so OPTIONS never hits JWT/DB logic
    @app.route("/api/<path:_unused>", methods=["OPTIONS"])
    def _cors_preflight(_unused):
        # Empty 204; headers will be ensured by after_request below
        return ("", 204)

    # Ensure CORS headers are present even on errors (401/404/500)
    @app.after_request
    def _force_cors_headers(resp):
        origin = (request.headers.get("Origin") or "").lower()
        if origin in allowed_set:
            if not resp.headers.get("Access-Control-Allow-Origin"):
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Vary"] = "Origin"
                resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
                resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return resp
    # ------------------------------------------------------------------------

    # DB init
    from .database import init_app as init_db
    init_db(app)

    # Blueprints
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
            "frontend": "https://web262.github.io/MoneyMate"
        })

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    print("\n[CORS] Allowed origins:", list(allowed_set), "\n")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
