from typing import Any, Optional
from urllib.parse import quote
from django.db import transaction
from api.auth_utils import create_id, now_utc
from api.errors import AppError
from api.models import Order, OrderEvent, Payment, Store, StorePaymentMethod
from api.realtime import realtime_hub
from api.services.config_service import get_setting_value, write_audit_log
from api.services.notification_service import notify_from_template, notify_store_team
from api.services.store_service import generate_qr_data_url


def create_payment_intent(store_id: str, order_id: str, amount_paise: int) -> dict[str, Any]:
    store = Store.objects.filter(id=store_id).only("name").first()
    method = StorePaymentMethod.objects.filter(store_id=store_id, method_code_id="upi").first()

    amount_rupees = f"{amount_paise / 100:.2f}"
    upi_id = method.upi_id if method and method.upi_id else None
    payee_name = (method.payee_name if method and method.payee_name else None) or (
        store.name if store else "Store"
    )
    upi_uri: Optional[str] = None
    generated_qr: Optional[str] = None

    if upi_id:
        upi_uri = (
            f"upi://pay?pa={quote(upi_id)}&pn={quote(payee_name)}"
            f"&am={amount_rupees}&cu=INR&tn={quote(f'Order {order_id[:8]}')}"
        )
        generated_qr = generate_qr_data_url(upi_uri, box_size=7)

    return {
        "upiUri": upi_uri,
        "generatedQrDataUrl": generated_qr,
        "uploadedQrUrl": method.upi_qr_url if method else None,
        "upiId": upi_id,
        "payeeName": payee_name,
        "requireReference": bool(method.require_reference) if method else True,
    }


def submit_payment_reference(
    order_id: str,
    customer_id: str,
    reference_no: str,
    proof_url: Optional[str] = None,
) -> dict[str, Any]:
    max_resub = int(float(get_setting_value("max_upi_resubmissions", "3")))
    clean_ref = (reference_no or "").strip()

    order = Order.objects.filter(id=order_id).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)
    if order.customer_id and order.customer_id != customer_id:
        raise AppError("FORBIDDEN", "You cannot update another customer order.", 403)

    method = StorePaymentMethod.objects.filter(store_id=order.store_id, method_code_id="upi").first()
    ref_required = bool(method.require_reference) if method else True

    if ref_required and len(clean_ref) < 4:
        raise AppError(
            "VALIDATION_ERROR",
            "Enter a valid UPI payment reference number.",
            400,
            {"referenceNo": "Reference number must be at least 4 characters."},
        )

    if clean_ref:
        duplicate = (
            Payment.objects.filter(
                store_id=order.store_id,
                reference_no__iexact=clean_ref,
            )
            .exclude(order_id=order.id)
            .exclude(status="rejected")
            .first()
        )
        if duplicate:
            raise AppError(
                "DUPLICATE_REFERENCE",
                "This UPI reference number has already been used on another order.",
                409,
                {"referenceNo": "Duplicate UPI reference number."},
            )

    now = now_utc()
    with transaction.atomic():
        existing = Payment.objects.filter(order_id=order.id).order_by("-created_at").first()
        if existing and existing.status == "rejected" and existing.resubmission_count >= max_resub:
            raise AppError(
                "MAX_RESUBMISSIONS",
                f"Maximum payment reference resubmissions ({max_resub}) reached. Please switch to Cash on Delivery.",
                400,
            )

        if existing:
            pid = existing.id
            if existing.status == "rejected":
                existing.resubmission_count += 1
            existing.status = "verification_pending"
            existing.reference_no = clean_ref or None
            existing.proof_url = proof_url
            existing.submitted_at = now
            existing.reject_reason = None
            existing.save()
        else:
            pid = create_id()
            Payment.objects.create(
                id=pid,
                order_id=order.id,
                store_id=order.store_id,
                method_code="upi",
                amount_paise=order.total_paise,
                status="verification_pending",
                reference_no=clean_ref or None,
                proof_url=proof_url,
                submitted_at=now,
                created_at=now,
            )

        Order.objects.filter(id=order.id).update(
            payment_status="verification_pending",
            payment_method="upi",
            updated_at=now,
        )

    currency = get_setting_value("currency_symbol", "₹")
    notify_store_team(
        store_id=order.store_id,
        notif_type="payment.submitted",
        vars_dict={
            "orderNumber": order.order_number,
            "referenceNo": clean_ref or "No Ref",
            "amount": f"{currency}{order.total_paise / 100:.2f}",
        },
        entity_type="order",
        entity_id=order.id,
    )
    realtime_hub.emit("payment.updated", store_id=order.store_id, entity_id=order.id)
    realtime_hub.emit("order.updated", store_id=order.store_id, entity_id=order.id)
    return {"paymentId": pid, "status": "verification_pending"}


def verify_payment(
    store_id: str,
    payment_id: str,
    decision: str,
    actor: dict[str, str],
    reason: Optional[str] = None,
) -> dict[str, Any]:
    payment = Payment.objects.filter(id=payment_id, store_id=store_id).first()
    if not payment:
        raise AppError("NOT_FOUND", "Payment record not found.", 404)

    clean_reason = (reason or "").strip()
    if decision == "reject" and not clean_reason:
        raise AppError(
            "VALIDATION_ERROR",
            "A reason is required when rejecting a payment.",
            400,
            {"reason": "Please enter the rejection reason."},
        )

    order = Order.objects.get(id=payment.order_id)
    now = now_utc()
    new_status = "paid" if decision == "confirm" else "rejected"
    old_status = payment.status

    with transaction.atomic():
        payment.status = new_status
        payment.verified_by = actor["id"]
        payment.verified_at = now
        payment.reject_reason = clean_reason if decision == "reject" else None
        payment.save()

        Order.objects.filter(id=order.id).update(payment_status=new_status, updated_at=now)
        OrderEvent.objects.create(
            id=create_id(),
            order_id=order.id,
            from_status=old_status,
            to_status=f"payment_{new_status}",
            actor_name=actor["name"],
            actor_role=actor["role"],
            reason=clean_reason or ("UPI payment confirmed" if decision == "confirm" else "UPI payment rejected"),
            created_at=now,
        )

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="payment.confirmed" if decision == "confirm" else "payment.rejected",
        entity_type="payment",
        entity_id=payment.id,
        details={"orderId": order.id, "referenceNo": payment.reference_no, "reason": clean_reason or None},
    )

    currency = get_setting_value("currency_symbol", "₹")
    if order.customer_id:
        notify_from_template(
            recipient_id=order.customer_id,
            store_id=store_id,
            notif_type="payment.confirmed" if decision == "confirm" else "payment.rejected",
            vars_dict={
                "orderNumber": order.order_number,
                "amount": f"{currency}{payment.amount_paise / 100:.2f}",
                "reason": clean_reason,
            },
            entity_type="order",
            entity_id=order.id,
        )

    realtime_hub.emit("payment.updated", store_id=store_id, entity_id=order.id)
    realtime_hub.emit("order.updated", store_id=store_id, entity_id=order.id)
    return {"paymentId": payment.id, "status": new_status}
