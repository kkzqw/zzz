import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from flask import Flask
from config import HOST, PORT, DEBUG
from routes import register_routes

def create_app():
    app = Flask(__name__)
    register_routes(app)
    return app

app = create_app()

if __name__ == "__main__":
    print(f"[*] Starting Builder API on http://{HOST}:{PORT}")
    print(f"[*] Endpoint: http://{HOST}:{PORT}/build?webhook=<url>&os=<windows/linux/macos>&filename=<name>")
    app.run(host=HOST, port=PORT, debug=DEBUG)
