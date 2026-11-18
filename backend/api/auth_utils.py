import hashlib
import hmac
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import bcrypt
import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission
from api.errors import AppError


def create_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return fmt_dt(now_utc()) or ""


def fmt_dt(val: Optional[Any]) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        else:
            val = val.astimezone(timezone.utc)
        return val.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    return str(val)


def hash_secret(plain: str) -> str:
    hashed = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=10))
    return hashed.decode("utf-8")


def verify_secret(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def sign_token(sub: str, role: str, store_id: Optional[str]) -> str:
    now = now_utc()
    payload = {
        "sub": sub,
        "role": role,
        "storeId": store_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=12)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401)


def verify_n8n_signature(raw_body: str, signature_header: Optional[str]) -> bool:
    if not signature_header:
        return False
    secret = settings.N8N_WEBHOOK_SECRET
    expected = hmac.new(secret.encode("utf-8"), raw_body.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)


@dataclass
class AuthUserPrincipal:
    id: str
    role: str
    name: str
    phone: Optional[str]
    email: Optional[str]
    store_id: Optional[str]
    store_slug: Optional[str]
    staff_permissions: list[str] = field(default_factory=list)
    is_authenticated: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "name": self.name,
            "phone": self.phone,
            "email": self.email,
            "storeId": self.store_id,
            "storeSlug": self.store_slug,
            "staffPermissions": self.staff_permissions,
        }

    def as_actor(self) -> dict[str, str]:
        return {"id": self.id, "role": self.role, "name": self.name}


class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header or not header.startswith("Bearer "):
            return None

        token = header[7:].strip()
        if not token:
            return None

        decoded = verify_token(token)
        sub = decoded.get("sub")
        if not sub:
            raise AppError("SESSION_EXPIRED", "Your session is no longer valid.", 401)

        from api.services.auth_service import get_user_principal_by_id

        principal = get_user_principal_by_id(sub)
        if not principal:
            raise AppError("SESSION_EXPIRED", "Your session is no longer valid.", 401)

        return (principal, token)


class IsAuthenticatedJWT(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            raise AppError("UNAUTHORIZED", "Please sign in to continue.", 401)
        return True


def require_roles(*allowed_roles: str):
    class RolePermission(BasePermission):
        def has_permission(self, request, view) -> bool:
            user = getattr(request, "user", None)
            if not user or not getattr(user, "is_authenticated", False):
                raise AppError("UNAUTHORIZED", "Please sign in to continue.", 401)
            if user.role not in allowed_roles:
                raise AppError(
                    "FORBIDDEN",
                    "You do not have permission to access this resource.",
                    403,
                )
            return True

    return RolePermission


def get_store_id_or_throw(request) -> str:
    user: Optional[AuthUserPrincipal] = getattr(request, "user", None)
    if not user or not user.store_id:
        raise AppError("FORBIDDEN", "No store associated with this account.", 403)
    return user.store_id
