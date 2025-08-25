from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from routes.auth import auth_bp
from routes.transactions import transactions_bp
from routes.budgets import budgets_bp
from routes.profile import profile_bp
from dotenv import load_dotenv
from routes.insights import insights_bp
import os

# Load environment variables from .env file (ensure one exists in the root folder)
load_dotenv()

app = Flask(__name__)

# Enable CORS for all routes (configure origins if needed)
CORS(app)

# Configure JWT using a secret key from environment variables (or a default for development)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "default_secret_key")

# Initialize the JWT Manager
jwt = JWTManager(app)

# Register your blueprints with versioned API prefixes
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(transactions_bp, url_prefix="/api/transactions")
app.register_blueprint(budgets_bp, url_prefix="/api/budgets")
app.register_blueprint(profile_bp, url_prefix="/api/profile")
app.register_blueprint(insights_bp, url_prefix="/api")
if __name__ == "__main__":
    # Set host and port via environment variables, if provided (defaults to localhost:5000)
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, host=host, port=port)
