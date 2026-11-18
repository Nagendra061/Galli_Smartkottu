import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

# Load environment variables from project root .env (and optional backend/.env)
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "dev-galli-smartkottu-django-secret-change-in-prod",
)
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "DJANGO_ALLOWED_HOSTS",
        os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0,.onrender.com,galli-smartkottu.onrender.com"),
    ).split(",")
    if h.strip()
]
# If wildcard is supplied or allowed
if "*" in ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["*"]

# API routes do not require trailing slashes
APPEND_SLASH = False

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "channels",
    "api.apps.ApiConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "galli_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [PROJECT_ROOT / "dist"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "galli_backend.wsgi.application"
ASGI_APPLICATION = "galli_backend.asgi.application"

# Database: Supabase PostgreSQL
# Supports either DATABASE_URL (Supabase pooler/direct URI) or SUPABASE_DB_* variables.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if DATABASE_URL:
    _db_config = dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=0,  # Required for Supabase Transaction Pooler (PgBouncer)
        ssl_require=os.environ.get("SUPABASE_SSL_REQUIRE", "true").lower() in ("1", "true", "yes"),
    )
    _db_config["DISABLE_SERVER_SIDE_CURSORS"] = True
    _db_config.setdefault("OPTIONS", {})["connect_timeout"] = 10
    _db_config["OPTIONS"]["prepare_threshold"] = None  # Required for psycopg3 + Supabase PgBouncer (port 6543)
    DATABASES = {"default": _db_config}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("SUPABASE_DB_NAME", "postgres"),
            "USER": os.environ.get("SUPABASE_DB_USER", "postgres"),
            "PASSWORD": os.environ.get("SUPABASE_DB_PASSWORD", ""),
            "HOST": os.environ.get("SUPABASE_DB_HOST", "localhost"),
            "PORT": os.environ.get("SUPABASE_DB_PORT", "5432"),
            "CONN_MAX_AGE": 0,
            "DISABLE_SERVER_SIDE_CURSORS": True,
            "OPTIONS": {
                "sslmode": os.environ.get("SUPABASE_SSL_MODE", "require"),
                "connect_timeout": 5,
            },
        }
    }

# Supabase API credentials (optional, for Storage/Realtime integrations)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Auth & App Secrets
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-galli-smartkottu-jwt-secret-change-in-prod")
N8N_WEBHOOK_SECRET = os.environ.get("N8N_WEBHOOK_SECRET", "dev-n8n-hmac-secret-change-in-prod")
APP_URL = os.environ.get("APP_URL", "http://localhost:3000")

# Allow up to 5MB payloads (base64 image uploads <= 2MB raw)
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "/assets/"
STATICFILES_DIRS = [PROJECT_ROOT / "dist" / "assets"] if (PROJECT_ROOT / "dist" / "assets").exists() else []

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS Configuration
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,https://gallismartkottu.vercel.app",
    ).split(",")
    if o.strip()
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.vercel\.app$",
]
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "idempotency-key",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-n8n-signature",
    "x-requested-with",
]

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "api.auth_utils.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "EXCEPTION_HANDLER": "api.errors.custom_exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# Django Channels (WebSocket /ws broadcast hub)
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}
