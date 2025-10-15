# backend/app.py
import os
from pathlib import Path
from datetime import timedelta
from flask import Flask, jsonify, request
from dotenv import load_dotenv
from flask_cors import CORS

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent

def create_app() -> Flask:
    app = Flask(__name__)
    CORS(
    app,
    resources={r"/api/*": {"origins": ["https://web262.github.io"]}},
    supports_credentials=False,
)

    # Core app config
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        JSON_SORT_KEYS=False,
        PERMANENT_SESSION_LIFETIME=timedelta(days=14),
    )

    # Accept both /path and /path/ to avoid 308 redirects on preflight/Fetch
    app.url_map.strict_slashes = False

    # ---- CORS (recommended: echo origin when allowed, required for credentials) ----
    # Default allowed origins (frontend on GitHub Pages + local dev + optional host)
    default_origins = {
        "https://web262.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://moneymate-2.onrender.com",
    }
    env_origins = os.environ.get("ALLOWED_ORIGINS", "")
    env_list = {o.strip().lower() for o in env_origins.split(",") if o.strip()}

    allowed = {o.lower() for o in default_origins} | env_list

    # Callable origin validator: returns True only for allowed origins.
    # When a callable is provided, Flask-CORS will echo the request Origin header
    # back in Access-Control-Allow-Origin when allowed — required when using credentials.
    def cors_origin(origin):
        if not origin:
            return False
        return origin.lower() in allowed

    CORS(
        app,
        resources={r"/api/*": {"origins": cors_origin}},
        supports_credentials=True,  # ensure Access-Control-Allow-Credentials: true
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        expose_headers=["Content-Type", "Authorization"],
        max_age=600,
    )

    # ---- DB + routes ----
    # Note: import/init function name should match your database module.
    # If your database module exposes `init_app`, change the import accordingly.
    try:
        from .database import init_db
        init_db(app)
    except Exception:
        # Fallback to common alternative name if your database module uses init_app
        try:
            from .database import init_app as init_db_alt
            init_db_alt(app)
        except Exception:
            # Let exceptions surface during deploy; helpful to see exact error in logs
            raise

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
            "cors_allowed": sorted(list(allowed)),
        })

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"ok": False, "error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"ok": False, "error": "Internal server error"}), 500

    # Helpful log on startup (shows which origins are accepted)
    print("\n[CORS] Allowed origins:", sorted(list(allowed)), "\n")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
