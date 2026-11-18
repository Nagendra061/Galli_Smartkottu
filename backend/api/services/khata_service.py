import re
from typing import Any, Optional
from django.db import transaction
from django.db.models import Max
from api.auth_utils import create_id, fmt_dt, now_utc
from api.errors import AppError
from api.models import KhataAccount, KhataEntry, User
from api.realtime import realtime_hub
from api.services.config_service import get_setting_value, write_audit_log
from api.services.notification_service import notify_from_template


def list_khata_accounts(store_id: str) -> list[dict[str, Any]]:
    rows = (
        KhataAccount.objects.filter(store_id=store_id)
        .annotate(last_entry_at=Max("entries__created_at"))
        .order_by("-balance_paise", "customer_name")
    )
    now = now_utc()
    results = []
    for r in rows:
        overdue_days = 0
        if r.balance_paise > 0 and r.last_entry_at:
            diff_days = int((now - r.last_entry_at).total_seconds() // 86400)
            overdue_days = max(0, diff_days)
        results.append(
            {
                "id": r.id,
                "storeId": r.store_id,
                "customerId": r.customer_id,
                "customerName": r.customer_name,
                "phone": r.phone,
                "address": r.address,
                "creditLimitPaise": r.credit_limit_paise,
                "billingCycleDay": r.billing_cycle_day,
                "balancePaise": r.balance_paise,
                "status": r.status,
                "notes": r.notes,
                "lastEntryAt": fmt_dt(r.last_entry_at),
                "overdueDays": overdue_days,
            }
        )
    return results


def get_khata_detail(store_id: str, account_id: str) -> dict[str, Any]:
    accounts = list_khata_accounts(store_id)
    account = next((a for a in accounts if a["id"] == account_id), None)
    if not account:
        raise AppError("NOT_FOUND", "Khata account not found.", 404)

    entries = (
        KhataEntry.objects.select_related("order")
        .filter(account_id=account_id, store_id=store_id)
        .order_by("-created_at")
    )
    return {
        "account": account,
        "entries": [
            {
                "id": e.id,
                "accountId": e.account_id,
                "orderId": e.order_id,
                "orderNumber": e.order.order_number if e.order else None,
                "entryType": e.entry_type,
                "amountPaise": e.amount_paise,
                "balanceAfterPaise": e.balance_after_paise,
                "paymentMethod": e.payment_method,
                "referenceNo": e.reference_no,
                "note": e.note,
                "createdAt": fmt_dt(e.created_at),
            }
            for e in entries
        ],
    }


def create_khata_account(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    clean_phone = re.sub(r"\D", "", payload["phone"])[-10:]
    if len(clean_phone) < 10:
        raise AppError(
            "VALIDATION_ERROR",
            "Enter a valid 10-digit phone number.",
            400,
            {"phone": "Enter a valid 10-digit phone number."},
        )
    if KhataAccount.objects.filter(store_id=store_id, phone=clean_phone).exists():
        raise AppError(
            "DUPLICATE_KHATA",
            "A Khata account already exists for this phone number.",
            409,
            {"phone": "Phone already has a Khata account."},
        )

    linked_user = User.objects.filter(phone=clean_phone, role="customer").only("id").first()
    acc_id = create_id()
    now = now_utc()

    KhataAccount.objects.create(
        id=acc_id,
        store_id=store_id,
        customer_id=linked_user.id if linked_user else None,
        customer_name=payload["customerName"].strip(),
        phone=clean_phone,
        address=(payload.get("address") or "").strip(),
        credit_limit_paise=int(payload["creditLimitPaise"]),
        billing_cycle_day=int(payload.get("billingCycleDay") or 1),
        balance_paise=0,
        status="active",
        notes=(payload.get("notes") or "").strip(),
        created_at=now,
        updated_at=now,
    )

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="khata.account_created",
        entity_type="khata_account",
        entity_id=acc_id,
        details={"customerName": payload["customerName"], "linkedCustomer": bool(linked_user)},
    )
    realtime_hub.emit("khata.updated", store_id=store_id, entity_id=acc_id)
    return get_khata_detail(store_id, acc_id)


def add_khata_entry(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    now = now_utc()
    entry_type = payload["entryType"]
    amount_paise = int(payload["amountPaise"])

    with transaction.atomic():
        account = KhataAccount.objects.select_for_update().filter(
            id=payload["accountId"], store_id=store_id
        ).first()
        if not account:
            raise AppError("NOT_FOUND", "Khata account not found.", 404)
        if account.status == "closed":
            raise AppError("KHATA_CLOSED", "This Khata account is closed.", 400)
        if entry_type == "debit" and account.status == "frozen":
            raise AppError("KHATA_FROZEN", "Credit is frozen for this customer.", 400)

        note_clean = (payload.get("note") or "").strip()
        if entry_type == "write_off" and not note_clean:
            raise AppError(
                "VALIDATION_ERROR",
                "A reason is required to write off Khata dues.",
                400,
                {"note": "Write-off reason is required."},
            )

        next_balance = account.balance_paise
        if entry_type == "debit":
            next_balance += amount_paise
            if next_balance > account.credit_limit_paise and not payload.get("overrideLimit"):
                raise AppError(
                    "KHATA_LIMIT_EXCEEDED",
                    "Adding this charge exceeds the customer Khata credit limit.",
                    409,
                    {
                        "limit": str(account.credit_limit_paise),
                        "currentBalance": str(account.balance_paise),
                        "newBalance": str(next_balance),
                    },
                )
        else:
            next_balance = max(0, account.balance_paise - amount_paise)

        override_reason = (payload.get("overrideReason") or "").strip()
        final_note = f"{note_clean} (Override: {override_reason})".strip() if override_reason else note_clean

        KhataEntry.objects.create(
            id=create_id(),
            store_id=store_id,
            account_id=account.id,
            order_id=payload.get("orderId"),
            entry_type=entry_type,
            amount_paise=amount_paise,
            balance_after_paise=next_balance,
            payment_method=payload.get("paymentMethod"),
            reference_no=(payload.get("referenceNo") or "").strip() or None,
            note=final_note,
            created_by=actor["id"],
            created_at=now,
        )
        account.balance_paise = next_balance
        account.updated_at = now
        account.save(update_fields=["balance_paise", "updated_at"])
        customer_id = account.customer_id

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action=f"khata.{entry_type}",
        entity_type="khata_account",
        entity_id=payload["accountId"],
        details={"amountPaise": amount_paise, "nextBalance": next_balance},
    )

    if entry_type == "credit" and customer_id:
        currency = get_setting_value("currency_symbol", "₹")
        notify_from_template(
            recipient_id=customer_id,
            store_id=store_id,
            notif_type="khata.payment",
            vars_dict={
                "amount": f"{currency}{amount_paise / 100:.2f}",
                "balance": f"{currency}{next_balance / 100:.2f}",
            },
            entity_type="khata",
            entity_id=payload["accountId"],
        )

    realtime_hub.emit("khata.updated", store_id=store_id, entity_id=payload["accountId"])
    return get_khata_detail(store_id, payload["accountId"])


def update_khata_control(
    store_id: str,
    account_id: str,
    payload: dict[str, Any],
    actor: dict[str, str],
) -> dict[str, Any]:
    acc = KhataAccount.objects.filter(id=account_id, store_id=store_id).first()
    if not acc:
        raise AppError("NOT_FOUND", "Khata account not found.", 404)

    if payload.get("status") == "closed" and acc.balance_paise > 0:
        raise AppError("NON_ZERO_BALANCE", "Khata balance must be zero before closing the account.", 400)

    if payload.get("status"):
        acc.status = payload["status"]
    if payload.get("creditLimitPaise") is not None:
        acc.credit_limit_paise = int(payload["creditLimitPaise"])
    acc.updated_at = now_utc()
    acc.save()

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="khata.updated",
        entity_type="khata_account",
        entity_id=account_id,
        details=payload,
    )
    realtime_hub.emit("khata.updated", store_id=store_id, entity_id=account_id)
    return get_khata_detail(store_id, account_id)


def get_customer_khata_statement(store_id: str, customer_id: str) -> Optional[dict[str, Any]]:
    row = KhataAccount.objects.filter(store_id=store_id, customer_id=customer_id).only("id").first()
    if not row:
        return None
    return get_khata_detail(store_id, row.id)
