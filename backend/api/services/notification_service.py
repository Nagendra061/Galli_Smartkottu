import re
from typing import Any, Optional
from api.auth_utils import create_id, fmt_dt, now_utc
from api.models import (
    MessageTemplate,
    Notification,
    NotificationChannel,
    NotificationPreference,
    NotificationType,
    Store,
    StoreStaff,
)
from api.realtime import realtime_hub


def _interpolate(template: str, params: dict[str, Any]) -> str:
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        return str(params[key]) if key in params and params[key] is not None else ""

    return re.sub(r"\{\{(\w+)\}\}", _replace, template)


def _deliver_in_app(
    recipient_id: str,
    store_id: Optional[str],
    notif_type: str,
    title: str,
    body: str,
    entity_type: Optional[str],
    entity_id: Optional[str],
) -> str:
    nid = create_id()
    Notification.objects.create(
        id=nid,
        recipient_id=recipient_id,
        store_id=store_id,
        type=notif_type,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        created_at=now_utc(),
    )
    realtime_hub.emit(
        "notification.created",
        recipient_id=recipient_id,
        store_id=store_id,
        entity_id=nid,
    )
    return nid


def notify_from_template(
    recipient_id: str,
    notif_type: str,
    store_id: Optional[str] = None,
    vars_dict: Optional[dict[str, Any]] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> Optional[str]:
    type_meta = NotificationType.objects.filter(code=notif_type).first()
    if not type_meta or not type_meta.is_critical:
        pref = NotificationPreference.objects.filter(user_id=recipient_id, type_code=notif_type).first()
        if pref and not pref.enabled:
            return None

    tmpl = MessageTemplate.objects.filter(type_code=notif_type, language="en").first()
    params = vars_dict or {}
    title = _interpolate(tmpl.title_template, params) if tmpl else str(params.get("title") or notif_type)
    body = _interpolate(tmpl.body_template, params) if tmpl else str(params.get("body") or "")

    in_app_chan = NotificationChannel.objects.filter(code="in_app").first()
    if not in_app_chan or in_app_chan.enabled:
        return _deliver_in_app(
            recipient_id=recipient_id,
            store_id=store_id,
            notif_type=notif_type,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    return None


def notify_store_team(
    store_id: str,
    notif_type: str,
    vars_dict: Optional[dict[str, Any]] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> None:
    store = Store.objects.filter(id=store_id).only("owner_id").first()
    if not store:
        return

    notify_from_template(
        recipient_id=store.owner_id,
        store_id=store_id,
        notif_type=notif_type,
        vars_dict=vars_dict,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    staff_user_ids = StoreStaff.objects.filter(store_id=store_id, is_active=True).values_list("user_id", flat=True)
    for uid in staff_user_ids:
        notify_from_template(
            recipient_id=uid,
            store_id=store_id,
            notif_type=notif_type,
            vars_dict=vars_dict,
            entity_type=entity_type,
            entity_id=entity_id,
        )


def list_notifications(
    recipient_id: str,
    filter_mode: str = "all",
    notif_type: Optional[str] = None,
) -> dict[str, Any]:
    qs = Notification.objects.filter(recipient_id=recipient_id, archived_at__isnull=True)
    if filter_mode == "unread":
        qs = qs.filter(read_at__isnull=True)
    if notif_type and notif_type != "all":
        qs = qs.filter(type=notif_type)
    rows = qs.order_by("-created_at")[:100]

    unread_count = Notification.objects.filter(
        recipient_id=recipient_id, read_at__isnull=True, archived_at__isnull=True
    ).count()

    return {
        "unreadCount": unread_count,
        "items": [
            {
                "id": r.id,
                "recipientId": r.recipient_id,
                "storeId": r.store_id,
                "type": r.type,
                "title": r.title,
                "body": r.body,
                "entityType": r.entity_type,
                "entityId": r.entity_id,
                "readAt": fmt_dt(r.read_at),
                "createdAt": fmt_dt(r.created_at),
            }
            for r in rows
        ],
    }


def mark_notification_read(recipient_id: str, notification_id: str) -> None:
    Notification.objects.filter(id=notification_id, recipient_id=recipient_id).update(read_at=now_utc())


def mark_all_notifications_read(recipient_id: str) -> None:
    Notification.objects.filter(recipient_id=recipient_id, read_at__isnull=True).update(read_at=now_utc())


def delete_notification(recipient_id: str, notification_id: str) -> None:
    Notification.objects.filter(id=notification_id, recipient_id=recipient_id).delete()
