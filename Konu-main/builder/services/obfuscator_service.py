import subprocess
import sys
from pathlib import Path
from typing import Tuple
from config import BASE_DIR, PROJECT_ROOT

class ObfuscatorService:
    @staticmethod
    def obfuscate_directory(target_dir: Path) -> Tuple[bool, str]:
        """
        Executes Node script to obfuscate all .js files in target directory.
        """
        script_path = BASE_DIR / "scripts" / "obfuscate.js"
        if not script_path.exists():
            return False, f"Obfuscator script not found at {script_path}"

        try:
            # We use node from system
            process = subprocess.run(
                ["node", str(script_path), str(target_dir)],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                check=False
            )

            if process.returncode != 0:
                error_msg = process.stderr.strip() or process.stdout.strip()
                return False, f"Obfuscation failed: {error_msg}"

            return True, process.stdout.strip()
        except Exception as e:
            return False, f"Failed to execute obfuscator: {str(e)}"
