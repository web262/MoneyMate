# backend/app.py
import os
from pathlib import Path
from datetime import timedelta
from flask import Flask, jsonify, request
from dotenv import load_dotenv
from flask_cors import CORS

# -------- Env & paths --------
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent


def create_app() -> Flask:
    app = Flask(__name__)

    # -------- Core app config --------
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        JSON_SORT_KEYS=False,
        PERMANENT_SESSION_LIFETIME=timedelta(days=14),
    )

    # Accept both /path and /path/ (avoid 308 on preflight/fetch)
    app.url_map.strict_slashes = False

    # -------- Allowed Origins --------
    # Default frontends + local dev; extend via ALLOWED_ORIGINS env (comma-separated)
    default_origins = {
        "https://web262.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }
    env_origins = {
        o.strip().lower()
        for o in (os.environ.get("ALLOWED_ORIGINS", "")).split(",")
        if o.strip()
    }
    allowed = {o.lower() for o in default_origins} | env_origins

    def cors_origin(origin: str | None) -> bool:
        # Flask-CORS will echo back the Origin we approve
        if not origin:
            return False
        return origin.lower() in allowed

    # -------- Single CORS setup (credentials OFF to match frontend) --------
    CORS(
        app,
        resources={r"/api/*": {"origins": cors_origin}},
        supports_credentials=False,  # flip to True only if you use browser cookies
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        expose_headers=["Content-Type", "Authorization"],
        max_age=600,
    )

    # -------- Make OPTIONS preflight always succeed --------
    @app.before_request
    def _cors_preflight():
        if request.method == "OPTIONS":
            # Flask-CORS will add the appropriate headers
            return app.make_default_options_response()

    # -------- DB init (won't crash the app if it fails) --------
    try:
        from .database import init_db
        init_db(app)
    except Exception as e1:
        try:
            from .database import init_app as init_db_alt
            init_db_alt(app)
        except Exception as e2:
            # Log and continue so /api/health & preflight still work
            print("[DB] Initialization failed:", repr(e1), "|", repr(e2))

    # -------- Blueprints --------
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

    # -------- Health & root --------
    @app.get("/api/health")
    def health():
        return jsonify({"ok": True}), 200

    @app.get("/")
    def index():
        return jsonify(
            {
                "service": "MoneyMate API",
                "docs": "/api/health",
                "frontend": "https://web262.github.io/MoneyMate",
                "cors_allowed": sorted(list(allowed)),
            }
        )

    # -------- Error handlers --------
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"ok": False, "error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"ok": False, "error": "Internal server error"}), 500

    # Helpful log on startup
    print("\n[CORS] Allowed origins:", sorted(list(allowed)), "\n")
    return app


app = create_app()

if __name__ == "__main__":
    # Render start command should be:  gunicorn backend.app:app
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
