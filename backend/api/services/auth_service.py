import json
import re
from datetime import timedelta
from typing import Any, Optional
from django.db import transaction
from django.db.models import Q
from api.auth_utils import (
    AuthUserPrincipal,
    create_id,
    hash_secret,
    now_utc,
    sign_token,
    verify_secret,
)
from api.errors import AppError
from api.models import KhataAccount, Store, StoreStaff, User
from api.services.config_service import write_audit_log


def _build_principal(user: User) -> AuthUserPrincipal:
    store_id: Optional[str] = None
    store_slug: Optional[str] = None
    staff_permissions: list[str] = []

    if user.role == "smo":
        store = Store.objects.filter(owner_id=user.id, deleted_at__isnull=True).only("id", "slug").first()
        if store:
            store_id = store.id
            store_slug = store.slug
    elif user.role == "staff":
        staff = (
            StoreStaff.objects.select_related("store")
            .filter(user_id=user.id, is_active=True, store__deleted_at__isnull=True)
            .first()
        )
        if staff:
            store_id = staff.store_id
            store_slug = staff.store.slug
            try:
                staff_permissions = json.loads(staff.permissions_json)
            except Exception:
                staff_permissions = ["pos", "pack"]

    return AuthUserPrincipal(
        id=user.id,
        role=user.role,
        name=user.name,
        phone=user.phone,
        email=user.email,
        store_id=store_id,
        store_slug=store_slug,
        staff_permissions=staff_permissions,
    )


def get_user_principal_by_id(user_id: str) -> Optional[AuthUserPrincipal]:
    user = User.objects.filter(id=user_id, is_active=True).first()
    if not user:
        return None
    return _build_principal(user)


def login_with_password(identifier: str, password: str, portal: str) -> dict[str, Any]:
    clean_id = identifier.strip().lower()
    raw_id = identifier.strip()

    user = (
        User.objects.filter(is_active=True)
        .filter(Q(email__iexact=clean_id) | Q(phone=raw_id))
        .first()
    )

    if not user or not user.password_hash or not verify_secret(password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Invalid email/phone or password.", 401)

    if portal == "admin" and user.role != "super_admin":
        raise AppError("FORBIDDEN", "Only Super Admin accounts can sign in here.", 403)
    if portal == "owner" and user.role not in ("smo", "staff"):
        raise AppError("FORBIDDEN", "Only Store Owner or Staff accounts can sign in here.", 403)

    principal = _build_principal(user)
    User.objects.filter(id=user.id).update(last_login_at=now_utc())

    write_audit_log(
        store_id=principal.store_id,
        actor_id=principal.id,
        actor_role=principal.role,
        actor_name=principal.name,
        action="auth.login",
        entity_type="user",
        entity_id=principal.id,
    )

    token = sign_token(principal.id, principal.role, principal.store_id)
    return {"token": token, "user": principal.to_dict()}


def identify_customer_by_phone(phone: str) -> dict[str, Any]:
    clean_phone = re.sub(r"\D", "", phone)[-10:]
    if len(clean_phone) < 10:
        raise AppError(
            "VALIDATION_ERROR",
            "Enter a valid 10-digit mobile number.",
            400,
            {"phone": "Enter a valid 10-digit mobile number."},
        )

    existing = User.objects.filter(phone=clean_phone, role="customer").first()
    now = now_utc()
    has_pin = bool(existing and existing.pin_hash)
    is_locked = bool(existing and existing.locked_until and existing.locked_until > now)
    return {
        "phone": clean_phone,
        "exists": has_pin,
        "hasPin": has_pin,
        "name": existing.name if existing else None,
        "isLocked": is_locked,
    }


def authenticate_customer_with_pin(phone: str, pin: str, name: Optional[str] = None) -> dict[str, Any]:
    clean_phone = re.sub(r"\D", "", phone)[-10:]
    if len(clean_phone) < 10:
        raise AppError(
            "VALIDATION_ERROR",
            "Enter a valid 10-digit phone number.",
            400,
            {"phone": "Enter a valid 10-digit phone number."},
        )
    if not re.match(r"^\d{4,6}$", pin):
        raise AppError(
            "VALIDATION_ERROR",
            "PIN must be 4 to 6 digits.",
            400,
            {"pin": "PIN must be 4 to 6 digits."},
        )

    now = now_utc()
    existing = User.objects.filter(phone=clean_phone, role="customer").first()

    if existing and existing.pin_hash:
        if existing.locked_until and existing.locked_until > now:
            raise AppError(
                "PIN_LOCKED",
                "Too many wrong PIN attempts. Ask the store owner to reset your PIN or wait 15 minutes.",
                423,
            )

        if not verify_secret(pin, existing.pin_hash):
            next_attempts = existing.failed_pin_attempts + 1
            lock_until = (now + timedelta(minutes=15)) if next_attempts >= 5 else None
            User.objects.filter(id=existing.id).update(
                failed_pin_attempts=next_attempts,
                locked_until=lock_until,
                updated_at=now,
            )
            msg = (
                "Too many wrong PIN attempts. Account temporarily locked for 15 minutes."
                if next_attempts >= 5
                else f"Incorrect PIN. {5 - next_attempts} attempt(s) remaining."
            )
            raise AppError("INVALID_PIN", msg, 401, {"pin": "Incorrect PIN."})

        User.objects.filter(id=existing.id).update(
            failed_pin_attempts=0,
            locked_until=None,
            last_login_at=now,
            updated_at=now,
        )
        principal = _build_principal(existing)
        token = sign_token(principal.id, "customer", None)
        return {"token": token, "user": principal.to_dict(), "isNewCustomer": False}

    clean_name = (name or "").strip()
    if not clean_name:
        raise AppError(
            "VALIDATION_ERROR",
            "Please enter your name to create your account.",
            400,
            {"name": "Your name is required."},
        )

    with transaction.atomic():
        if existing:
            customer_id = existing.id
            User.objects.filter(id=customer_id).update(
                name=clean_name,
                pin_hash=hash_secret(pin),
                failed_pin_attempts=0,
                locked_until=None,
                last_login_at=now,
                updated_at=now,
            )
        else:
            customer_id = create_id()
            User.objects.create(
                id=customer_id,
                role="customer",
                name=clean_name,
                phone=clean_phone,
                email=None,
                password_hash=None,
                pin_hash=hash_secret(pin),
                is_active=True,
                last_login_at=now,
                created_at=now,
                updated_at=now,
            )

        KhataAccount.objects.filter(phone=clean_phone, customer__isnull=True).update(
            customer_id=customer_id,
            updated_at=now,
        )

    created_user = User.objects.get(id=customer_id)
    principal = _build_principal(created_user)
    token = sign_token(principal.id, "customer", None)
    return {"token": token, "user": principal.to_dict(), "isNewCustomer": True}
