import requests
from pathlib import Path
from typing import Optional, Dict, Any
from config import GOFILE_UPLOAD_URL, GOFILE_API_TOKEN

class GoFileService:
    @staticmethod
    def upload_file(
        file_path: Path,
        token: Optional[str] = None,
        folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Uploads a file to GoFile upload endpoint.
        If no token is provided, GoFile creates a guest account / public link.
        """
        if not file_path.exists():
            return {
                "status": "error",
                "message": f"File not found: {file_path}"
            }

        effective_token = token or GOFILE_API_TOKEN or None
        headers = {}
        if effective_token:
            headers["Authorization"] = f"Bearer {effective_token}"

        data = {}
        if folder_id:
            data["folderId"] = folder_id

        try:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f)}
                response = requests.post(
                    GOFILE_UPLOAD_URL,
                    files=files,
                    data=data,
                    headers=headers,
                    timeout=120
                )

            res_json = response.json()
            if res_json.get("status") == "ok":
                data_payload = res_json.get("data", {})
                return {
                    "status": "ok",
                    "data": {
                        "id": data_payload.get("id"),
                        "name": data_payload.get("name"),
                        "code": data_payload.get("code") or data_payload.get("parentFolderCode"),
                        "downloadPage": data_payload.get("downloadPage"),
                        "parentFolder": data_payload.get("parentFolder"),
                        "guestToken": data_payload.get("guestToken"),
                        "size": data_payload.get("size"),
                        "md5": data_payload.get("md5"),
                        "directLink": data_payload.get("link")
                    }
                }
            else:
                return {
                    "status": "error",
                    "message": res_json.get("status", "Unknown GoFile error"),
                    "raw": res_json
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Exception during GoFile upload: {str(e)}"
            }
