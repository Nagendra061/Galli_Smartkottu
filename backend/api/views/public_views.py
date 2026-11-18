import json
import re
import urllib.parse
import urllib.request
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from api.auth_utils import IsAuthenticatedJWT, verify_n8n_signature
from api.errors import AppError
from api.services.config_service import get_bootstrap_config
from api.services.inventory_service import list_brands, list_categories, list_offers, list_products
from api.services.store_service import generate_qr_data_url, get_public_store_by_slug, record_qr_scan
from api.services.support_service import run_automation_job


def _get_base_url(request) -> str:
    app_url = getattr(settings, "APP_URL", "").strip().rstrip("/")
    if app_url:
        return app_url
    scheme = "https" if request.is_secure() else "http"
    return f"{scheme}://{request.get_host()}"


@api_view(["GET"])
def public_bootstrap(request):
    return Response(get_bootstrap_config())


@api_view(["GET"])
def public_store_detail(request, slug: str):
    store = get_public_store_by_slug(slug)
    categories = list_categories(store["id"], include_archived=False)
    brands = list_brands(store["id"])
    products = list_products(store["id"], online_only=True)
    offers = list_offers(store["id"], active_only=True)
    base_url = _get_base_url(request)
    qr_data_url = generate_qr_data_url(f"{base_url}/store/{store['slug']}?utm_source=qr")
    return Response(
        {
            "store": store,
            "categories": categories,
            "brands": brands,
            "products": products,
            "offers": offers,
            "qrDataUrl": qr_data_url,
        }
    )


@api_view(["POST"])
def public_qr_scan(request):
    body = request.data if isinstance(request.data, dict) else {}
    slug = body.get("slug")
    if slug:
        record_qr_scan(
            slug=str(slug),
            utm_source=body.get("utmSource"),
            utm_medium=body.get("utmMedium"),
            utm_campaign=body.get("utmCampaign"),
        )
    return Response({"ok": True})


@api_view(["GET"])
def public_geocode(request):
    q = str(request.query_params.get("q", "")).strip()
    if len(q) < 2:
        return Response({"results": []})
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&limit=5&q={urllib.parse.quote(q)}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "GalliSmartkottu/1.1 (local-storefront-delivery-range)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                return Response({"results": [], "unavailable": True})
            raw = json.loads(resp.read().decode("utf-8"))
        results = []
        for r in raw:
            try:
                lat = float(r["lat"])
                lng = float(r["lon"])
                results.append({"displayName": r["display_name"], "lat": lat, "lng": lng})
            except Exception:
                continue
        return Response({"results": results})
    except Exception:
        return Response({"results": [], "unavailable": True})


@api_view(["POST"])
@permission_classes([IsAuthenticatedJWT])
def upload_image(request):
    body = request.data if isinstance(request.data, dict) else {}
    data_url = body.get("dataUrl", "")
    if not isinstance(data_url, str) or len(data_url) < 20:
        raise AppError("VALIDATION_ERROR", "Please provide a valid image.", 400)
    match = re.match(r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$", data_url)
    if not match:
        raise AppError("INVALID_FILE_TYPE", "Only PNG, JPG, and WebP images are allowed.", 400)
    approx_bytes = (len(match.group(2)) * 3) / 4
    if approx_bytes > 2 * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", "Image size must be 2 MB or less.", 400)
    return Response({"url": data_url})


@api_view(["POST"])
def webhook_n8n(request):
    signature = request.META.get("HTTP_X_N8N_SIGNATURE")
    raw_body = json.dumps(request.data, separators=(",", ":"))
    raw_bytes = request.body.decode("utf-8") if request.body else raw_body
    if not (verify_n8n_signature(raw_bytes, signature) or verify_n8n_signature(raw_body, signature)):
        raise AppError("INVALID_SIGNATURE", "Invalid webhook signature.", 401)
    body = request.data if isinstance(request.data, dict) else {}
    job_key = body.get("jobKey")
    if not job_key:
        raise AppError("VALIDATION_ERROR", "jobKey is required.", 400)
    return Response({"ok": True, "jobs": run_automation_job(str(job_key))})
