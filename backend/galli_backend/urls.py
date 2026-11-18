from pathlib import Path
from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.urls import include, path, re_path
from api.auth_utils import now_iso


def health_probe(_request):
    return JsonResponse({"status": "ok", "timestamp": now_iso()})


def serve_spa_asset(request, filepath=""):
    dist_dir = Path(settings.PROJECT_ROOT) / "dist"
    if not dist_dir.exists():
        raise Http404("Frontend dist bundle not found. Run 'npm run build' or use Vite dev server.")

    if filepath:
        candidate = (dist_dir / filepath).resolve()
        if str(candidate).startswith(str(dist_dir.resolve())) and candidate.is_file():
            return FileResponse(open(candidate, "rb"))

    index_file = dist_dir / "index.html"
    if index_file.is_file():
        return FileResponse(open(index_file, "rb"), content_type="text/html")
    raise Http404("index.html not found in dist/")


urlpatterns = [
    path("api/health", health_probe),
    path("api/v1/", include("api.urls")),
]

if not settings.DEBUG:
    urlpatterns += [
        re_path(r"^(?P<filepath>.*)$", serve_spa_asset),
    ]
