import json
from typing import Any, Optional
from django.db import transaction
from api.auth_utils import create_id, now_utc
from api.errors import AppError
from api.models import (
    AppSetting,
    AuditLog,
    Faq,
    FeatureFlag,
    I18nString,
    NotificationChannel,
    NotificationType,
    OrderStatus,
    PaymentMethodType,
    PaymentStatus,
    StatusTransition,
    Store,
    TaxRate,
    Unit,
)
from api.realtime import realtime_hub


def write_audit_log(
    actor_id: str,
    actor_role: str,
    actor_name: str,
    action: str,
    entity_type: str,
    entity_id: str,
    store_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    AuditLog.objects.create(
        id=create_id(),
        store_id=store_id,
        actor_id=actor_id,
        actor_role=actor_role,
        actor_name=actor_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details_json=json.dumps(details or {}),
        created_at=now_utc(),
    )


def get_setting_value(key: str, fallback: str = "") -> str:
    row = AppSetting.objects.filter(key=key).first()
    return row.value if row else fallback


def get_bootstrap_config() -> dict[str, Any]:
    settings_map = {s.key: s.value for s in AppSetting.objects.all()}

    trans_map: dict[str, list[str]] = {}
    for t in StatusTransition.objects.all():
        trans_map.setdefault(t.from_code, []).append(t.to_code)

    order_statuses = [
        {
            "id": s.id,
            "code": s.code,
            "label": s.label,
            "appliesTo": s.applies_to,
            "tone": s.tone,
            "sortOrder": s.sort_order,
            "requiresReason": bool(s.requires_reason),
            "allowedNext": trans_map.get(s.code, []),
        }
        for s in OrderStatus.objects.order_by("sort_order")
    ]

    payment_statuses = [
        {"code": p.code, "label": p.label, "tone": p.tone}
        for p in PaymentStatus.objects.order_by("sort_order")
    ]

    units = [
        {
            "id": u.id,
            "code": u.code,
            "label": u.label,
            "allowDecimal": bool(u.allow_decimal),
        }
        for u in Unit.objects.order_by("sort_order")
    ]

    tax_rates = [
        {
            "id": t.id,
            "name": t.name,
            "ratePercent": t.rate_percent,
            "hsnDefault": t.hsn_default,
        }
        for t in TaxRate.objects.order_by("sort_order")
    ]

    payment_method_types = [
        {
            "code": m.code,
            "label": m.label,
            "enabledByDefault": bool(m.enabled_by_default),
        }
        for m in PaymentMethodType.objects.order_by("sort_order")
    ]

    notification_types = [
        {
            "code": n.code,
            "label": n.label,
            "isCritical": bool(n.is_critical),
        }
        for n in NotificationType.objects.all()
    ]

    notification_channels = [
        {
            "code": c.code,
            "label": c.label,
            "enabled": bool(c.enabled),
            "visibleInUi": bool(c.visible_in_ui),
        }
        for c in NotificationChannel.objects.all()
    ]

    faqs = [
        {
            "id": f.id,
            "question": f.question,
            "answer": f.answer,
            "category": f.category,
            "sortOrder": f.sort_order,
        }
        for f in Faq.objects.order_by("sort_order", "created_at")
    ]

    feature_flags = {f.key: bool(f.enabled) for f in FeatureFlag.objects.all()}
    i18n_strings = {row.key: row.value for row in I18nString.objects.all()}

    first_store = Store.objects.filter(deleted_at__isnull=True).order_by("created_at").only("slug").first()

    return {
        "appSettings": {
            "appName": settings_map.get("app_name") or "Galli Smartkottu",
            "appSlogan": settings_map.get("app_slogan") or "",
            "currencyCode": settings_map.get("currency_code") or "INR",
            "currencySymbol": settings_map.get("currency_symbol") or "₹",
            "defaultLanguage": settings_map.get("default_language") or "en",
            "appVersion": settings_map.get("app_version") or "1.1.0",
            "changelog": settings_map.get("changelog") or "",
            "forceUpdate": settings_map.get("force_update") == "true",
            "defaultLowStockThreshold": int(float(settings_map.get("default_low_stock_threshold") or 5)),
            "defaultExpiryWindowDays": int(float(settings_map.get("default_expiry_window_days") or 14)),
            "defaultPaymentTimeoutMinutes": int(float(settings_map.get("default_payment_timeout_minutes") or 15)),
            "maxUpiResubmissions": int(float(settings_map.get("max_upi_resubmissions") or 3)),
            "notificationRetentionDays": int(float(settings_map.get("notification_retention_days") or 30)),
        },
        "orderStatuses": order_statuses,
        "paymentStatuses": payment_statuses,
        "units": units,
        "taxRates": tax_rates,
        "paymentMethodTypes": payment_method_types,
        "notificationTypes": notification_types,
        "notificationChannels": notification_channels,
        "faqs": faqs,
        "featureFlags": feature_flags,
        "i18nStrings": i18n_strings,
        "seededStoreSlug": first_store.slug if first_store else None,
    }


def update_app_settings(updates: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    now = now_utc()
    with transaction.atomic():
        for key, val in updates.items():
            str_val = "true" if val is True else ("false" if val is False else str(val))
            AppSetting.objects.update_or_create(
                key=key,
                defaults={"value": str_val, "updated_at": now},
            )
        write_audit_log(
            actor_id=actor["id"],
            actor_role=actor["role"],
            actor_name=actor["name"],
            action="config.app_settings_updated",
            entity_type="app_settings",
            entity_id="global",
            details=updates,
        )
    realtime_hub.emit("config.updated")
    return get_bootstrap_config()


def update_order_status_label(
    code: str,
    label: str,
    tone: Optional[str],
    actor: dict[str, str],
) -> dict[str, Any]:
    status_obj = OrderStatus.objects.filter(code=code).first()
    if not status_obj:
        raise AppError("NOT_FOUND", "Order status not found.", 404)

    status_obj.label = label.strip()
    if tone:
        status_obj.tone = tone
    status_obj.save()

    write_audit_log(
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="config.order_status_updated",
        entity_type="order_status",
        entity_id=code,
        details={"label": label, "tone": tone},
    )
    realtime_hub.emit("config.updated")
    return get_bootstrap_config()


def upsert_faq(data: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    faq_id = data.get("id") or create_id()
    if data.get("id") and Faq.objects.filter(id=faq_id).exists():
        Faq.objects.filter(id=faq_id).update(
            question=data["question"].strip(),
            answer=data["answer"].strip(),
            category=data["category"].strip(),
            sort_order=data.get("sortOrder") if data.get("sortOrder") is not None else 1,
        )
    else:
        Faq.objects.create(
            id=faq_id,
            question=data["question"].strip(),
            answer=data["answer"].strip(),
            category=data["category"].strip(),
            sort_order=data.get("sortOrder") if data.get("sortOrder") is not None else 1,
            created_at=now_utc(),
        )
    write_audit_log(
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="config.faq_saved",
        entity_type="faq",
        entity_id=faq_id,
    )
    realtime_hub.emit("config.updated")
    return get_bootstrap_config()


def delete_faq(faq_id: str, actor: dict[str, str]) -> dict[str, Any]:
    Faq.objects.filter(id=faq_id).delete()
    write_audit_log(
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="config.faq_deleted",
        entity_type="faq",
        entity_id=faq_id,
    )
    realtime_hub.emit("config.updated")
    return get_bootstrap_config()
