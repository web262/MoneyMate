# backend/app.py
import os
from pathlib import Path
from datetime import timedelta
from flask import Flask, jsonify
from dotenv import load_dotenv
from flask_cors import CORS

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

BASE_DIR = Path(__file__).resolve().parent

def create_app() -> Flask:
    app = Flask(__name__)

    # Core app config
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),
        JSON_SORT_KEYS=False,
        PERMANENT_SESSION_LIFETIME=timedelta(days=14),
    )

    # Accept both /path and /path/ to avoid 308 redirects on preflight/Fetch
    app.url_map.strict_slashes = False

    # ---- CORS (JWT, no cookies required) ----
    default_origins = [
        "https://web262.github.io",           # GitHub Pages (your front-end)
        "http://localhost:5173", "http://127.0.0.1:5173",  # local dev
        "https://moneymate-2.onrender.com",   # optional if you host UI here later
    ]
    env_origins = os.environ.get("ALLOWED_ORIGINS", "")
    allowed = sorted({*(o.strip().lower() for o in default_origins),
                      *(o.strip().lower() for o in env_origins.split(",") if o.strip())})

    CORS(
        app,
        resources={r"/api/*": {"origins": allowed}},
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        max_age=600,
    )

    # ---- DB + routes ----
    from .database import init_db
    init_db(app)

    from .routes.auth import auth_bp
    from .routes.transactions import tx_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(tx_bp)

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
        return jsonify({"ok": False, "error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"ok": False, "error": "Internal server error"}), 500

    print("\n[CORS] Allowed origins:", allowed, "\n")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
