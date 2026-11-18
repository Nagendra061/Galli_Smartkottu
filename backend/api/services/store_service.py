import base64
import io
import json
import math
import re
from datetime import timedelta
from typing import Any, Optional
import qrcode
from django.db import transaction
from django.db.models import Count, Q, Sum
from api.auth_utils import create_id, fmt_dt, hash_secret, now_utc
from api.errors import AppError
from api.models import (
    Order,
    PaymentMethodType,
    Plan,
    Product,
    QrScan,
    Store,
    StorePaymentMethod,
    StoreStaff,
    User,
)
from api.realtime import realtime_hub
from api.services.config_service import write_audit_log
from api.services.notification_service import notify_from_template, notify_store_team


def generate_qr_data_url(content: str, box_size: int = 8) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(content)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def serialize_store(store: Store) -> dict[str, Any]:
    plan_name = store.plan.name if store.plan_id else "Starter"
    methods = StorePaymentMethod.objects.filter(store_id=store.id)

    try:
        pickup_slots = json.loads(store.pickup_slots_json)
    except Exception:
        pickup_slots = []

    return {
        "id": store.id,
        "ownerId": store.owner_id,
        "slug": store.slug,
        "name": store.name,
        "status": store.status,
        "suspensionReason": store.suspension_reason,
        "supportContact": store.support_contact,
        "isOpen": bool(store.is_open),
        "closedReason": store.closed_reason,
        "address": store.address,
        "phone": store.phone,
        "timings": store.timings,
        "logoUrl": store.logo_url,
        "bannerUrl": store.banner_url,
        "brandColor": store.brand_color,
        "deliveryEnabled": bool(store.delivery_enabled),
        "pickupEnabled": bool(store.pickup_enabled),
        "deliveryFeePaise": store.delivery_fee_paise,
        "minOrderPaise": store.min_order_paise,
        "deliveryEtaText": store.delivery_eta_text,
        "deliveryRadiusKm": store.delivery_radius_km if store.delivery_radius_km is not None else 5.0,
        "storeLat": store.store_lat,
        "storeLng": store.store_lng,
        "pickupSlots": pickup_slots,
        "planId": store.plan_id,
        "planName": plan_name,
        "planExpiresAt": fmt_dt(store.plan_expires_at),
        "gstNumber": store.gst_number,
        "fssaiNumber": store.fssai_number,
        "docsVerified": bool(store.docs_verified),
        "requirePaymentReference": bool(store.require_payment_reference),
        "allowZeroStockPos": bool(store.allow_zero_stock_pos),
        "khataLimitBehavior": store.khata_limit_behavior,
        "lowStockThreshold": store.low_stock_threshold,
        "invoicePrefix": store.invoice_prefix,
        "nextInvoiceNo": store.next_invoice_no,
        "soundAlertsEnabled": bool(store.sound_alerts_enabled),
        "staffCanVerifyPayment": bool(store.staff_can_verify_payment),
        "qrVersion": store.qr_version,
        "paymentMethods": [
            {
                "id": m.id,
                "storeId": m.store_id,
                "methodCode": m.method_code_id,
                "enabled": bool(m.enabled),
                "upiId": m.upi_id,
                "payeeName": m.payee_name,
                "upiQrUrl": m.upi_qr_url,
                "requireReference": bool(m.require_reference),
            }
            for m in methods
        ],
    }


def get_store_by_id(store_id: str) -> dict[str, Any]:
    store = Store.objects.select_related("plan").filter(id=store_id, deleted_at__isnull=True).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)
    return serialize_store(store)


def get_public_store_by_slug(slug: str) -> dict[str, Any]:
    store = Store.objects.select_related("plan").filter(slug=slug, deleted_at__isnull=True).first()
    if not store:
        raise AppError("STORE_NOT_FOUND", "Store not found.", 404)
    return serialize_store(store)


def record_qr_scan(
    slug: str,
    utm_source: Optional[str] = None,
    utm_medium: Optional[str] = None,
    utm_campaign: Optional[str] = None,
) -> None:
    store = Store.objects.filter(slug=slug, deleted_at__isnull=True).only("id").first()
    if not store:
        return
    QrScan.objects.create(
        id=create_id(),
        store_id=store.id,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
        created_at=now_utc(),
    )


def update_store_settings(store_id: str, patch: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    store = Store.objects.select_related("plan").filter(id=store_id, deleted_at__isnull=True).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    if "deliveryRadiusKm" in patch and patch["deliveryRadiusKm"] is not None:
        try:
            rad = float(patch["deliveryRadiusKm"])
            if math.isnan(rad) or rad < 0:
                raise ValueError()
        except Exception:
            raise AppError(
                "VALIDATION_ERROR",
                "Delivery range must be 0 km or greater.",
                400,
                {"deliveryRadiusKm": "Enter a valid delivery radius in km."},
            )
        store.delivery_radius_km = rad

    field_map = {
        "name": "name",
        "address": "address",
        "phone": "phone",
        "timings": "timings",
        "isOpen": "is_open",
        "closedReason": "closed_reason",
        "brandColor": "brand_color",
        "logoUrl": "logo_url",
        "bannerUrl": "banner_url",
        "deliveryEnabled": "delivery_enabled",
        "pickupEnabled": "pickup_enabled",
        "deliveryFeePaise": "delivery_fee_paise",
        "minOrderPaise": "min_order_paise",
        "deliveryEtaText": "delivery_eta_text",
        "storeLat": "store_lat",
        "storeLng": "store_lng",
        "requirePaymentReference": "require_payment_reference",
        "allowZeroStockPos": "allow_zero_stock_pos",
        "khataLimitBehavior": "khata_limit_behavior",
        "lowStockThreshold": "low_stock_threshold",
        "invoicePrefix": "invoice_prefix",
        "soundAlertsEnabled": "sound_alerts_enabled",
        "staffCanVerifyPayment": "staff_can_verify_payment",
    }

    for camel_key, attr in field_map.items():
        if camel_key in patch:
            val = patch[camel_key]
            if val is not None or camel_key in ("closedReason", "logoUrl", "bannerUrl", "storeLat", "storeLng"):
                setattr(store, attr, val)

    if "pickupSlots" in patch and patch["pickupSlots"] is not None:
        store.pickup_slots_json = json.dumps(patch["pickupSlots"])

    store.updated_at = now_utc()
    store.save()

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="store.settings_updated",
        entity_type="store",
        entity_id=store_id,
    )
    realtime_hub.emit("store.updated", store_id=store_id, store_slug=store.slug)
    return get_store_by_id(store_id)


def update_store_payment_method(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    store = Store.objects.filter(id=store_id).only("id", "slug").first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    method_code = payload["methodCode"]
    enabled = bool(payload["enabled"])
    existing = StorePaymentMethod.objects.filter(store_id=store_id, method_code_id=method_code).first()

    if "upiId" in payload:
        final_upi_id = (payload["upiId"] or "").strip() or None
    else:
        final_upi_id = existing.upi_id if existing else None

    if "upiQrUrl" in payload:
        final_qr_url = payload["upiQrUrl"]
    else:
        final_qr_url = existing.upi_qr_url if existing else None

    if method_code == "upi" and enabled and not final_upi_id and not final_qr_url:
        raise AppError(
            "UPI_CONFIG_REQUIRED",
            "Upload a UPI QR image or enter a UPI ID before enabling UPI payments for customers.",
            400,
            {"upiId": "Provide a UPI ID or upload a UPI QR image."},
        )

    now = now_utc()
    if existing:
        existing.enabled = enabled
        existing.upi_id = final_upi_id
        if "payeeName" in payload:
            existing.payee_name = (payload["payeeName"] or "").strip() or None
        existing.upi_qr_url = final_qr_url
        if "requireReference" in payload and payload["requireReference"] is not None:
            existing.require_reference = bool(payload["requireReference"])
        existing.updated_at = now
        existing.save()
    else:
        StorePaymentMethod.objects.create(
            id=create_id(),
            store_id=store_id,
            method_code_id=method_code,
            enabled=enabled,
            upi_id=final_upi_id,
            payee_name=(payload.get("payeeName") or "").strip() or None,
            upi_qr_url=final_qr_url,
            require_reference=False if payload.get("requireReference") is False else True,
            updated_at=now,
        )

    if method_code == "upi" and payload.get("requireReference") is not None:
        Store.objects.filter(id=store_id).update(
            require_payment_reference=bool(payload["requireReference"]),
            updated_at=now,
        )

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="store.payment_method_updated",
        entity_type="store_payment_methods",
        entity_id=f"{store_id}:{method_code}",
        details={"enabled": enabled, "hasUpiId": bool(final_upi_id), "hasQr": bool(final_qr_url)},
    )
    realtime_hub.emit("store.updated", store_id=store_id, store_slug=store.slug)
    return get_store_by_id(store_id)


def list_store_staff(store_id: str) -> list[dict[str, Any]]:
    rows = StoreStaff.objects.select_related("user").filter(store_id=store_id).order_by("-created_at")
    return [
        {
            "id": r.id,
            "userId": r.user_id,
            "name": r.user.name,
            "phone": r.user.phone,
            "email": r.user.email,
            "staffRole": r.staff_role,
            "permissions": json.loads(r.permissions_json) if r.permissions_json else [],
            "isActive": bool(r.is_active),
            "createdAt": fmt_dt(r.created_at),
        }
        for r in rows
    ]


def create_store_staff(store_id: str, data: dict[str, Any], actor: dict[str, str]) -> list[dict[str, Any]]:
    store = Store.objects.select_related("plan").filter(id=store_id).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    active_count = StoreStaff.objects.filter(store_id=store_id, is_active=True).count()
    if active_count >= store.plan.max_staff:
        raise AppError(
            "PLAN_LIMIT_REACHED",
            f"Your current plan allows up to {store.plan.max_staff} staff members. Upgrade your plan via Super Admin.",
            403,
        )

    clean_phone = re.sub(r"\D", "", data["phone"])[-10:]
    if User.objects.filter(phone=clean_phone).exists():
        raise AppError(
            "DUPLICATE_PHONE",
            "A user with this phone number already exists.",
            409,
            {"phone": "Phone number already in use."},
        )

    now = now_utc()
    user_id = create_id()
    staff_id = create_id()
    role = data["staffRole"]
    perms = ["pos"] if role == "cashier" else (["pack"] if role == "packer" else ["pos", "pack", "stock"])

    with transaction.atomic():
        User.objects.create(
            id=user_id,
            role="staff",
            name=data["name"].strip(),
            phone=clean_phone,
            email=None,
            password_hash=hash_secret(data["password"]),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        StoreStaff.objects.create(
            id=staff_id,
            store_id=store_id,
            user_id=user_id,
            staff_role=role,
            permissions_json=json.dumps(perms),
            is_active=True,
            created_at=now,
        )

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="staff.created",
        entity_type="store_staff",
        entity_id=staff_id,
    )
    return list_store_staff(store_id)


def toggle_store_staff(store_id: str, staff_id: str, is_active: bool, actor: dict[str, str]) -> list[dict[str, Any]]:
    row = StoreStaff.objects.filter(id=staff_id, store_id=store_id).first()
    if not row:
        raise AppError("NOT_FOUND", "Staff member not found.", 404)

    StoreStaff.objects.filter(id=staff_id).update(is_active=is_active)
    User.objects.filter(id=row.user_id).update(is_active=is_active)

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="staff.activated" if is_active else "staff.deactivated",
        entity_type="store_staff",
        entity_id=staff_id,
    )
    return list_store_staff(store_id)


def list_all_stores_admin() -> list[dict[str, Any]]:
    stores = Store.objects.select_related("owner", "plan").filter(deleted_at__isnull=True).order_by("-created_at")
    results = []
    for s in stores:
        prod_count = Product.objects.filter(store_id=s.id, archived_at__isnull=True).count()
        ord_count = Order.objects.filter(store_id=s.id).count()
        gmv = (
            Order.objects.filter(store_id=s.id, status_code="completed").aggregate(total=Sum("total_paise"))["total"]
            or 0
        )
        item = serialize_store(s)
        item.update(
            {
                "ownerName": s.owner.name,
                "ownerEmail": s.owner.email,
                "ownerPhone": s.owner.phone,
                "planName": s.plan.name,
                "productCount": prod_count,
                "orderCount": ord_count,
                "gmvPaise": gmv,
            }
        )
        results.append(item)
    return results


def create_store_by_admin(payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    clean_slug = re.sub(r"-+", "-", re.sub(r"[^a-z0-9-]", "-", payload["slug"].lower()))
    if Store.objects.filter(slug=clean_slug).exists():
        raise AppError(
            "DUPLICATE_SLUG",
            "This store slug is already taken.",
            409,
            {"slug": "Store slug already exists."},
        )

    owner_email = payload["ownerEmail"].strip().lower()
    owner_phone = payload["ownerPhone"].strip()
    if User.objects.filter(Q(email__iexact=owner_email) | Q(phone=owner_phone)).exists():
        raise AppError("DUPLICATE_USER", "An account with this email or phone already exists.", 409)

    now = now_utc()
    owner_id = create_id()
    store_id = create_id()
    expiry = now + timedelta(days=30)

    with transaction.atomic():
        User.objects.create(
            id=owner_id,
            role="smo",
            name=payload["ownerName"].strip(),
            phone=owner_phone,
            email=owner_email,
            password_hash=hash_secret(payload["ownerPassword"]),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        Store.objects.create(
            id=store_id,
            owner_id=owner_id,
            slug=clean_slug,
            name=payload["storeName"].strip(),
            status="active",
            is_open=True,
            address=payload["address"].strip(),
            phone=owner_phone,
            timings=(payload.get("timings") or "").strip() or "08:00 AM - 09:00 PM",
            plan_id=payload["planId"],
            plan_expires_at=expiry,
            gst_number=payload.get("gstNumber"),
            fssai_number=payload.get("fssaiNumber"),
            docs_verified=True,
            created_at=now,
            updated_at=now,
        )
        for m in ("upi", "cash", "pay_at_pickup", "card", "khata"):
            StorePaymentMethod.objects.create(
                id=create_id(),
                store_id=store_id,
                method_code_id=m,
                enabled=(m != "upi"),
                payee_name=payload["storeName"].strip(),
                require_reference=True,
                updated_at=now,
            )

    notify_from_template(
        recipient_id=owner_id,
        store_id=store_id,
        notif_type="system.announcement",
        vars_dict={
            "title": f"Welcome to {payload['storeName']}",
            "body": "Checklist: 1) Add your first product in Inventory, 2) Upload your UPI QR in Store Settings, 3) Share your store QR poster with shoppers.",
        },
        entity_type="store",
        entity_id=store_id,
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="admin.store_created",
        entity_type="store",
        entity_id=store_id,
        details={"slug": clean_slug, "name": payload["storeName"]},
    )
    realtime_hub.emit("store.updated", store_id=store_id, store_slug=clean_slug)
    return get_store_by_id(store_id)


def set_store_status_admin(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    store = Store.objects.filter(id=store_id).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    status_val = payload["status"]
    reason = (payload.get("reason") or "").strip()
    if status_val == "suspended" and not reason:
        raise AppError(
            "VALIDATION_ERROR",
            "A suspension reason is required.",
            400,
            {"reason": "Please enter a suspension reason."},
        )

    support_contact = (payload.get("supportContact") or "").strip() or "support@gallismartkottu.local"
    store.status = status_val
    store.suspension_reason = (reason or "Suspended by platform admin") if status_val == "suspended" else None
    store.support_contact = support_contact
    store.updated_at = now_utc()
    store.save()

    notify_store_team(
        store_id=store_id,
        notif_type="system.announcement",
        vars_dict={
            "title": "Store suspended" if status_val == "suspended" else "Store reactivated",
            "body": (
                f"Your store was suspended: {reason}. Contact {support_contact}."
                if status_val == "suspended"
                else "Your store has been reactivated and is live for customers."
            ),
        },
        entity_type="store",
        entity_id=store_id,
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="admin.store_suspended" if status_val == "suspended" else "admin.store_reactivated",
        entity_type="store",
        entity_id=store_id,
        details={"reason": reason},
    )
    realtime_hub.emit("store.updated", store_id=store_id, store_slug=store.slug)
    return get_store_by_id(store_id)


def regenerate_store_qr_admin(store_id: str, actor: dict[str, str]) -> dict[str, Any]:
    store = Store.objects.filter(id=store_id).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    store.qr_version += 1
    store.updated_at = now_utc()
    store.save()

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="admin.store_qr_regenerated",
        entity_type="store",
        entity_id=store_id,
        details={"newVersion": store.qr_version},
    )
    return get_store_by_id(store_id)
