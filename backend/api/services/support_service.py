from datetime import timedelta
from typing import Any, Optional
from django.db import connection, transaction
from django.db.models import F
from api.auth_utils import create_id, fmt_dt, now_utc
from api.errors import AppError
from api.models import (
    AutomationJob,
    DeletionRequest,
    Notification,
    Product,
    Store,
    SupportTicket,
    TicketMessage,
    User,
)
from api.realtime import realtime_hub
from api.services.config_service import get_setting_value, write_audit_log
from api.services.finance_service import get_predictions, get_profit_advisor
from api.services.notification_service import notify_from_template, notify_store_team


def list_tickets(store_id: Optional[str]) -> list[dict[str, Any]]:
    qs = SupportTicket.objects.select_related("store", "created_by").prefetch_related("messages")
    if store_id:
        qs = qs.filter(store_id=store_id)
    rows = qs.order_by("-updated_at")

    return [
        {
            "id": r.id,
            "storeId": r.store_id,
            "storeName": r.store.name,
            "creatorName": r.created_by.name,
            "subject": r.subject,
            "status": r.status,
            "priority": r.priority,
            "assignedTo": r.assigned_to,
            "internalNotes": r.internal_notes,
            "slaDueAt": fmt_dt(r.sla_due_at),
            "createdAt": fmt_dt(r.created_at),
            "updatedAt": fmt_dt(r.updated_at),
            "messages": [
                {
                    "id": m.id,
                    "senderRole": m.sender_role,
                    "senderName": m.sender_name,
                    "body": m.body,
                    "attachmentUrl": m.attachment_url,
                    "createdAt": fmt_dt(m.created_at),
                }
                for m in r.messages.order_by("created_at")
            ],
        }
        for r in rows
    ]


def create_support_ticket(
    store_id: str,
    payload: dict[str, Any],
    actor: dict[str, str],
) -> list[dict[str, Any]]:
    now = now_utc()
    sla_due = now + timedelta(hours=24)
    ticket_id = create_id()

    with transaction.atomic():
        SupportTicket.objects.create(
            id=ticket_id,
            store_id=store_id,
            created_by_id=actor["id"],
            subject=payload["subject"].strip(),
            status="open",
            priority=payload.get("priority") or "normal",
            sla_due_at=sla_due,
            created_at=now,
            updated_at=now,
        )
        TicketMessage.objects.create(
            id=create_id(),
            ticket_id=ticket_id,
            sender_id=actor["id"],
            sender_role=actor["role"],
            sender_name=actor["name"],
            body=payload["body"].strip(),
            attachment_url=payload.get("attachmentUrl"),
            created_at=now,
        )

    for adm_id in User.objects.filter(role="super_admin").values_list("id", flat=True):
        notify_from_template(
            recipient_id=adm_id,
            store_id=store_id,
            notif_type="ticket.reply",
            vars_dict={
                "subject": payload["subject"].strip(),
                "senderName": actor["name"],
                "snippet": payload["body"][:60],
            },
            entity_type="ticket",
            entity_id=ticket_id,
        )

    realtime_hub.emit("ticket.updated", store_id=store_id, entity_id=ticket_id)
    return list_tickets(store_id)


def reply_to_ticket(
    ticket_id: str,
    payload: dict[str, Any],
    actor: dict[str, str],
) -> list[dict[str, Any]]:
    ticket = SupportTicket.objects.filter(id=ticket_id).first()
    if not ticket:
        raise AppError("NOT_FOUND", "Support ticket not found.", 404)

    now = now_utc()
    body = (payload.get("body") or "").strip()
    with transaction.atomic():
        if body:
            TicketMessage.objects.create(
                id=create_id(),
                ticket_id=ticket_id,
                sender_id=actor["id"],
                sender_role=actor["role"],
                sender_name=actor["name"],
                body=body,
                created_at=now,
            )
        if payload.get("status"):
            ticket.status = payload["status"]
        if payload.get("internalNotes") is not None:
            ticket.internal_notes = payload["internalNotes"]
        ticket.updated_at = now
        ticket.save()

    if actor["role"] == "super_admin":
        notify_store_team(
            store_id=ticket.store_id,
            notif_type="ticket.reply",
            vars_dict={
                "subject": ticket.subject,
                "senderName": actor["name"],
                "snippet": (body or "Status updated")[:60],
            },
            entity_type="ticket",
            entity_id=ticket_id,
        )
    else:
        for adm_id in User.objects.filter(role="super_admin").values_list("id", flat=True):
            notify_from_template(
                recipient_id=adm_id,
                store_id=ticket.store_id,
                notif_type="ticket.reply",
                vars_dict={
                    "subject": ticket.subject,
                    "senderName": actor["name"],
                    "snippet": body[:60],
                },
                entity_type="ticket",
                entity_id=ticket_id,
            )

    realtime_hub.emit("ticket.updated", store_id=ticket.store_id, entity_id=ticket_id)
    return list_tickets(None if actor["role"] == "super_admin" else ticket.store_id)


def request_account_deletion(store_id: str, reason: str, actor: dict[str, str]) -> dict[str, Any]:
    if DeletionRequest.objects.filter(store_id=store_id, status="pending_grace").exists():
        raise AppError(
            "ALREADY_REQUESTED",
            "A deletion request is already in the 30-day grace queue.",
            409,
        )

    now = now_utc()
    grace_ends = now + timedelta(days=30)
    req_id = create_id()
    dr = DeletionRequest.objects.create(
        id=req_id,
        store_id=store_id,
        owner_id=actor["id"],
        reason=reason.strip(),
        status="pending_grace",
        grace_ends_at=grace_ends,
        created_at=now,
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="account.deletion_requested",
        entity_type="deletion_request",
        entity_id=req_id,
        details={"reason": reason},
    )
    return {
        "id": dr.id,
        "store_id": dr.store_id,
        "owner_id": dr.owner_id,
        "reason": dr.reason,
        "status": dr.status,
        "grace_ends_at": fmt_dt(dr.grace_ends_at),
        "processed_by": dr.processed_by,
        "processed_at": fmt_dt(dr.processed_at),
        "created_at": fmt_dt(dr.created_at),
    }


def list_deletion_requests_admin() -> list[dict[str, Any]]:
    rows = DeletionRequest.objects.select_related("store", "owner").order_by("-created_at")
    return [
        {
            "id": r.id,
            "store_id": r.store_id,
            "owner_id": r.owner_id,
            "reason": r.reason,
            "status": r.status,
            "grace_ends_at": fmt_dt(r.grace_ends_at),
            "processed_by": r.processed_by,
            "processed_at": fmt_dt(r.processed_at),
            "created_at": fmt_dt(r.created_at),
            "store_name": r.store.name,
            "store_slug": r.store.slug,
            "owner_name": r.owner.name,
            "owner_email": r.owner.email,
        }
        for r in rows
    ]


def process_deletion_request_admin(
    request_id: str,
    action: str,
    actor: dict[str, str],
) -> list[dict[str, Any]]:
    req_row = DeletionRequest.objects.filter(id=request_id).first()
    if not req_row:
        raise AppError("NOT_FOUND", "Deletion request not found.", 404)

    now = now_utc()
    with transaction.atomic():
        req_row.status = "restored" if action == "restore" else "finalised"
        req_row.processed_by = actor["id"]
        req_row.processed_at = now
        req_row.save()

        if action == "finalise":
            Store.objects.filter(id=req_row.store_id).update(
                deleted_at=now, status="suspended", updated_at=now
            )
            User.objects.filter(id=req_row.owner_id).update(
                name="Deleted Owner", email=None, phone=None, is_active=False, updated_at=now
            )

    write_audit_log(
        store_id=req_row.store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action=f"admin.deletion_{action}",
        entity_type="deletion_request",
        entity_id=request_id,
    )
    return list_deletion_requests_admin()


def list_automation_jobs() -> list[dict[str, Any]]:
    rows = AutomationJob.objects.order_by("name")
    return [
        {
            "key": r.key,
            "name": r.name,
            "triggerDesc": r.trigger_desc,
            "actionDesc": r.action_desc,
            "enabled": 1 if r.enabled else 0,
            "lastRunAt": fmt_dt(r.last_run_at),
            "lastStatus": r.last_status,
            "lastMessage": r.last_message,
        }
        for r in rows
    ]


def run_automation_job(job_key: str) -> list[dict[str, Any]]:
    job = AutomationJob.objects.filter(key=job_key).first()
    if not job:
        raise AppError("NOT_FOUND", "Automation workflow not found.", 404)

    now = now_utc()
    active_stores = list(Store.objects.filter(status="active", deleted_at__isnull=True))
    summary = "Completed"

    if job_key == "low_stock_digest":
        total_alerts = 0
        for s in active_stores:
            low = list(
                Product.objects.filter(
                    store_id=s.id, archived_at__isnull=True, stock_qty__lte=F("reorder_level")
                )
            )
            if low:
                total_alerts += len(low)
                notify_store_team(
                    store_id=s.id,
                    notif_type="stock.low",
                    vars_dict={
                        "productName": f"{len(low)} item(s)",
                        "qty": low[0].stock_qty,
                        "unit": "",
                        "reorder": low[0].reorder_level,
                    },
                    entity_type="inventory",
                    entity_id=s.id,
                )
        summary = f"Checked {len(active_stores)} stores; {total_alerts} low-stock item(s) notified."
    elif job_key == "expiry_damage_prediction":
        high_count = 0
        for s in active_stores:
            preds = [p for p in get_predictions(s.id) if p["severity"] == "high"]
            high_count += len(preds)
            if preds:
                notify_store_team(
                    store_id=s.id,
                    notif_type="prediction.alert",
                    vars_dict={"title": preds[0]["title"], "summary": preds[0]["reasoning"]},
                    entity_type="finance",
                    entity_id=s.id,
                )
        summary = f"Predictions updated; {high_count} high-risk alerts sent."
    elif job_key == "weekly_advisor_digest":
        for s in active_stores:
            adv = get_profit_advisor(s.id)
            notify_store_team(
                store_id=s.id,
                notif_type="finance.advisor_digest",
                vars_dict={"score": adv["healthScore"]},
                entity_type="finance",
                entity_id=s.id,
            )
        summary = f"Weekly advisor digest sent to {len(active_stores)} store(s)."
    elif job_key == "notification_retention":
        days = int(float(get_setting_value("notification_retention_days", "30")))
        cutoff = now - timedelta(days=days)
        archived_count = Notification.objects.filter(created_at__lt=cutoff, archived_at__isnull=True).update(
            archived_at=now
        )
        summary = f"Archived {archived_count} notification(s) older than {days} days."
    elif job_key == "health_monitor":
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        summary = "API and Supabase PostgreSQL database healthy."
    else:
        summary = f"Workflow {job.name} executed across {len(active_stores)} store(s)."

    job.last_run_at = now
    job.last_status = "success"
    job.last_message = summary
    job.save()
    return list_automation_jobs()
