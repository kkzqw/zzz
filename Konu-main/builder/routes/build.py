from flask import Blueprint, request, jsonify
from services.builder_service import BuilderService

build_bp = Blueprint("build", __name__)

@build_bp.route("/build", methods=["GET", "POST"])
def handle_build():
    
    if request.method == "POST" and request.is_json:
        data = request.get_json() or {}
        webhook = data.get("webhook") or request.args.get("webhook")
        target_os = data.get("os") or request.args.get("os", "windows")
        filename = data.get("filename") or data.get("namefile") or request.args.get("filename") or request.args.get("namefile", "konu_electron")
        gofile_token = data.get("token") or request.args.get("token")
    else:
        webhook = request.values.get("webhook")
        target_os = request.values.get("os", "windows")
        filename = request.values.get("filename") or request.values.get("namefile", "konu_electron")
        gofile_token = request.values.get("token")

    if not webhook or not webhook.strip():
        return jsonify({
            "status": "error",
            "message": "Missing required parameter: 'webhook'. Example usage: /build?webhook=https://discord.com/api/webhooks/...&os=windows&filename=my_build"
        }), 400

    webhook = webhook.strip()
    target_os = target_os.strip().lower() if target_os else "windows"
    filename = filename.strip() if filename else "konu_electron"

    result = BuilderService.build(
        webhook_url=webhook,
        target_os=target_os,
        filename=filename,
        gofile_token=gofile_token
    )

    if result.get("status") == "ok":
        return jsonify(result), 200
    else:
        return jsonify(result), 500
