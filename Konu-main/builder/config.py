import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
BUILDS_DIR = PROJECT_ROOT / "build"

GOFILE_API_TOKEN = os.environ.get("GOFILE_API_TOKEN", "")
GOFILE_UPLOAD_URL = os.environ.get("GOFILE_UPLOAD_URL", "https://upload.gofile.io/uploadfile")

# GitHub Actions Integration (For macOS compilation fallback)
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "")

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "5000"))
DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "t")

BUILDS_DIR.mkdir(parents=True, exist_ok=True)
