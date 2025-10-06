# backend/app.py
import os
from pathlib import Path
from flask import Flask, jsonify
from dotenv import load_dotenv
from flask_cors import CORS

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

def create_app() -> Flask:
    app = Flask(__name__)

    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-change-me"),

        # Cross-site session cookie (github.io -> onrender.com)
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="None",
        SESSION_COOKIE_SECURE=True,

        JSON_SORT_KEYS=False,
    )

    # Avoid 308 redirects that can break CORS preflights
    app.url_map.strict_slashes = False

    # CORS: exact origins that may send credentials
    allowed_origins = os.environ.get(
        "ALLOWED_ORIGINS",
        "https://web262.github.io"
    )
    # split, trim, drop empties
    allowed = [o.strip() for o in allowed_origins.split(",") if o.strip()]
    allowed_set = set(allowed)  # <-- define it

    CORS(
        app,
        resources={r"/api/*": {"origins": allowed}},
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        supports_credentials=True,  # adds Access-Control-Allow-Credentials: true
    )

    # ---- DB init
    from .database import init_app as init_db
    init_db(app)

    # ---- Blueprints
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

    # helpful startup log
    print("\n[CORS] Allowed origins:", list(allowed_set), "\n")

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
