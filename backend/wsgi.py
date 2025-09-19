# backend/wsgi.py
from .app import create_app  # <-- relative import because we're in the 'backend' package

app = create_app()
