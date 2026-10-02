from flask import Flask
from .build import build_bp
from .health import health_bp

def register_routes(app: Flask):
    app.register_blueprint(health_bp)
    app.register_blueprint(build_bp)
