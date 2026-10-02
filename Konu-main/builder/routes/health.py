from flask import Blueprint, jsonify
from config import BUILDS_DIR
import os

health_bp = Blueprint("health", __name__)

@health_bp.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "online",
        "service": "Electron API Builder",
        "endpoints": {
            "/build": "GET/POST ?webhook=<url>&os=<linux|macos|windows>&filename=<name>&token=<optional_gofile_token>",
            "/health": "GET system health and active builds"
        }
    }), 200

@health_bp.route("/health", methods=["GET"])
def health():
    build_folders = []
    if BUILDS_DIR.exists():
        build_folders = [f.name for f in BUILDS_DIR.iterdir() if f.is_dir()]

    return jsonify({
        "status": "ok",
        "builds_count": len(build_folders),
        "recent_builds": build_folders[-10:]
    }), 200
