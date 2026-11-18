import json
import math
import random
from typing import Any, Optional
from django.db import transaction
from api.auth_utils import create_id, fmt_dt, now_utc
from api.errors import AppError
from api.geo import calculate_distance_km
from api.models import (
    HeldBill,
    IdempotencyKey,
    KhataAccount,
    KhataEntry,
    Order,
    OrderEvent,
    OrderItem,
    OrderMessage,
    OrderStatus,
    Payment,
    Product,
    Refund,
    StatusTransition,
    StockMovement,
    Store,
    StorePaymentMethod,
    User,
)
from api.realtime import realtime_hub
from api.services.config_service import get_setting_value, write_audit_log
from api.services.inventory_service import list_products
from api.services.notification_service import notify_from_template, notify_store_team


def hydrate_order(order_id: str) -> dict[str, Any]:
    order = (
        Order.objects.prefetch_related("items", "events", "payments", "messages")
        .filter(id=order_id)
        .first()
    )
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)

    items = [
        {
            "id": i.id,
            "orderId": i.order_id,
            "productId": i.product_id,
            "productName": i.product_name,
            "unitLabel": i.unit_label,
            "qty": i.qty,
            "unitPricePaise": i.unit_price_paise,
            "costPricePaise": i.cost_price_paise,
            "taxPercent": i.tax_percent,
            "discountPaise": i.discount_paise,
            "lineTotalPaise": i.line_total_paise,
            "availabilityStatus": i.availability_status,
            "substituteName": i.substitute_name,
            "substitutionPref": i.substitution_pref,
            "packed": bool(i.packed),
        }
        for i in order.items.all()
    ]

    events = [
        {
            "id": e.id,
            "orderId": e.order_id,
            "fromStatus": e.from_status,
            "toStatus": e.to_status,
            "actorName": e.actor_name,
            "actorRole": e.actor_role,
            "reason": e.reason,
            "createdAt": fmt_dt(e.created_at),
        }
        for e in order.events.order_by("created_at")
    ]

    payments = []
    for p in order.payments.order_by("-created_at"):
        is_dup = False
        if p.reference_no:
            is_dup = (
                Payment.objects.filter(store_id=p.store_id, reference_no__iexact=p.reference_no)
                .exclude(order_id=p.order_id)
                .exists()
            )
        payments.append(
            {
                "id": p.id,
                "orderId": p.order_id,
                "storeId": p.store_id,
                "methodCode": p.method_code,
                "amountPaise": p.amount_paise,
                "status": p.status,
                "referenceNo": p.reference_no,
                "proofUrl": p.proof_url,
                "submittedAt": fmt_dt(p.submitted_at),
                "verifiedBy": p.verified_by,
                "verifiedAt": fmt_dt(p.verified_at),
                "rejectReason": p.reject_reason,
                "resubmissionCount": p.resubmission_count,
                "isDuplicateRef": is_dup,
            }
        )

    messages = [
        {
            "id": m.id,
            "orderId": m.order_id,
            "senderRole": m.sender_role,
            "senderName": m.sender_name,
            "body": m.body,
            "createdAt": fmt_dt(m.created_at),
        }
        for m in order.messages.order_by("created_at")
    ]

    return {
        "id": order.id,
        "storeId": order.store_id,
        "orderNumber": order.order_number,
        "channel": order.channel,
        "fulfilment": order.fulfilment,
        "pickupSlot": order.pickup_slot,
        "deliveryAddress": order.delivery_address,
        "deliveryLat": order.delivery_lat,
        "deliveryLng": order.delivery_lng,
        "deliveryDistanceKm": order.delivery_distance_km,
        "statusCode": order.status_code,
        "paymentStatus": order.payment_status,
        "paymentMethod": order.payment_method,
        "customerId": order.customer_id,
        "customerName": order.customer_name,
        "customerPhone": order.customer_phone,
        "subtotalPaise": order.subtotal_paise,
        "discountPaise": order.discount_paise,
        "taxPaise": order.tax_paise,
        "deliveryFeePaise": order.delivery_fee_paise,
        "totalPaise": order.total_paise,
        "cashTenderedPaise": order.cash_tendered_paise,
        "changeReturnedPaise": order.change_returned_paise,
        "handoverCode": order.handover_code,
        "assignedStaffName": order.assigned_staff_name,
        "rating": order.rating,
        "feedback": order.feedback,
        "notes": order.notes,
        "createdAt": fmt_dt(order.created_at),
        "updatedAt": fmt_dt(order.updated_at),
        "items": items,
        "events": events,
        "payments": payments,
        "messages": messages,
    }


def list_store_orders(store_id: str, channel: Optional[str] = None) -> list[dict[str, Any]]:
    qs = Order.objects.filter(store_id=store_id)
    if channel in ("pos", "online"):
        qs = qs.filter(channel=channel)
    ids = list(qs.order_by("-created_at").values_list("id", flat=True)[:200])
    return [hydrate_order(oid) for oid in ids]


def list_customer_orders(customer_id: str, store_id: Optional[str] = None) -> list[dict[str, Any]]:
    qs = Order.objects.filter(customer_id=customer_id)
    if store_id:
        qs = qs.filter(store_id=store_id)
    ids = list(qs.order_by("-created_at").values_list("id", flat=True)[:100])
    return [hydrate_order(oid) for oid in ids]


def _next_order_number(store_id: str) -> str:
    store = Store.objects.select_for_update().get(id=store_id)
    num = f"{store.invoice_prefix}-{store.next_invoice_no}"
    store.next_invoice_no += 1
    store.save(update_fields=["next_invoice_no"])
    return num


def create_pos_bill(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    idem_key = payload.get("idempotencyKey")
    if idem_key:
        existing_key = IdempotencyKey.objects.filter(key=idem_key, store_id=store_id).first()
        if existing_key:
            return json.loads(existing_key.response_json)

    items = payload.get("items") or []
    if not items:
        raise AppError("VALIDATION_ERROR", "Add at least one item to create a bill.", 400)

    low_stock_events: list[dict[str, Any]] = []
    now = now_utc()

    with transaction.atomic():
        store = Store.objects.get(id=store_id)
        order_id = create_id()
        order_number = _next_order_number(store_id)

        subtotal = 0
        line_discount_sum = 0
        tax_sum = 0
        prepared_items: list[dict[str, Any]] = []

        for item in items:
            cost_price = 0
            tax_pct = float(item["taxPercent"]) if item.get("taxPercent") is not None else 0.0
            qty = float(item["qty"])
            unit_price = int(item["unitPricePaise"])

            if item.get("productId"):
                prod = (
                    Product.objects.select_related("tax_rate")
                    .select_for_update()
                    .filter(id=item["productId"], store_id=store_id)
                    .first()
                )
                if not prod:
                    raise AppError("NOT_FOUND", f"Product {item.get('name', '')} not found.", 404)
                if not store.allow_zero_stock_pos and prod.stock_qty < qty:
                    raise AppError("INSUFFICIENT_STOCK", f"Not enough stock for {prod.name}.", 400)

                cost_price = prod.cost_price_paise
                if item.get("taxPercent") is None:
                    tax_pct = prod.tax_rate.rate_percent

                next_stock = max(0.0, prod.stock_qty - qty)
                prod.stock_qty = next_stock
                prod.updated_at = now
                prod.save(update_fields=["stock_qty", "updated_at"])

                StockMovement.objects.create(
                    id=create_id(),
                    store_id=store_id,
                    product_id=prod.id,
                    movement_type="pos_sale",
                    qty_delta=-qty,
                    qty_after=next_stock,
                    reason=f"POS Bill {order_number}",
                    reference_id=order_id,
                    actor_id=actor["id"],
                    created_at=now,
                )

                if next_stock <= prod.reorder_level:
                    low_stock_events.append(
                        {
                            "productId": prod.id,
                            "name": prod.name,
                            "qty": next_stock,
                            "reorder": prod.reorder_level,
                        }
                    )

            raw_line = round(unit_price * qty)
            disc = min(raw_line, int(item.get("discountPaise") or 0))
            net_line = raw_line - disc
            line_tax = round((net_line * tax_pct) / (100.0 + tax_pct)) if (100.0 + tax_pct) > 0 else 0

            subtotal += raw_line
            line_discount_sum += disc
            tax_sum += line_tax

            prepared_items.append(
                {
                    "productId": item.get("productId") or None,
                    "name": item["name"],
                    "unitLabel": item.get("unitLabel") or "pcs",
                    "qty": qty,
                    "unitPricePaise": unit_price,
                    "costPricePaise": cost_price,
                    "taxPercent": tax_pct,
                    "discountPaise": disc,
                    "lineTotalPaise": net_line,
                }
            )

        bill_disc = min(subtotal - line_discount_sum, int(payload.get("billDiscountPaise") or 0))
        total_discount = line_discount_sum + bill_disc
        total_paise = max(0, subtotal - total_discount)

        customer_id: Optional[str] = None
        customer_name = (payload.get("customerName") or "").strip() or "Walk-in Customer"
        customer_phone = (payload.get("customerPhone") or "").strip() or None
        payment_method = payload["paymentMethod"]

        khata_to_debit: Optional[tuple[KhataAccount, int]] = None

        if payment_method == "khata":
            khata_id = payload.get("khataAccountId")
            if not khata_id:
                raise AppError(
                    "VALIDATION_ERROR",
                    "Select a Khata customer for Pay Later.",
                    400,
                    {"khataAccountId": "Select a Khata account."},
                )
            khata = KhataAccount.objects.select_for_update().filter(id=khata_id, store_id=store_id).first()
            if not khata:
                raise AppError("NOT_FOUND", "Khata account not found.", 404)
            if khata.status != "active":
                raise AppError("KHATA_INACTIVE", f"Khata account is {khata.status}.", 400)

            new_bal = khata.balance_paise + total_paise
            if new_bal > khata.credit_limit_paise and not payload.get("overrideKhataLimit"):
                raise AppError(
                    "KHATA_LIMIT_EXCEEDED",
                    f"This bill pushes {khata.customer_name}'s balance over their credit limit.",
                    409,
                    {
                        "limit": str(khata.credit_limit_paise),
                        "currentBalance": str(khata.balance_paise),
                        "newBalance": str(new_bal),
                    },
                )
            customer_id = khata.customer_id
            customer_name = khata.customer_name
            customer_phone = khata.phone
            khata_to_debit = (khata, new_bal)
        elif customer_phone:
            cust = User.objects.filter(phone=customer_phone, role="customer").only("id", "name").first()
            if cust:
                customer_id = cust.id
                customer_name = cust.name

        cash_tendered = payload.get("cashTenderedPaise")
        change_returned = (
            max(0, int(cash_tendered) - total_paise)
            if (payment_method == "cash" and cash_tendered is not None)
            else None
        )
        payment_status = "on_khata" if payment_method == "khata" else "paid"

        Order.objects.create(
            id=order_id,
            store_id=store_id,
            order_number=order_number,
            channel="pos",
            fulfilment="counter",
            status_code="completed",
            payment_status=payment_status,
            payment_method=payment_method,
            customer_id=customer_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            subtotal_paise=subtotal,
            discount_paise=total_discount,
            tax_paise=tax_sum,
            delivery_fee_paise=0,
            total_paise=total_paise,
            cash_tendered_paise=int(cash_tendered) if cash_tendered is not None else None,
            change_returned_paise=change_returned,
            notes=payload.get("notes"),
            idempotency_key=idem_key,
            created_by=actor["id"],
            created_at=now,
            updated_at=now,
        )

        if khata_to_debit:
            khata_obj, new_bal = khata_to_debit
            override_reason = (payload.get("overrideReason") or "").strip()
            KhataEntry.objects.create(
                id=create_id(),
                store_id=store_id,
                account_id=khata_obj.id,
                order_id=order_id,
                entry_type="debit",
                amount_paise=total_paise,
                balance_after_paise=new_bal,
                note=f"POS Bill {order_number} (Override: {override_reason})" if override_reason else f"POS Bill {order_number}",
                created_by=actor["id"],
                created_at=now,
            )
            khata_obj.balance_paise = new_bal
            khata_obj.updated_at = now
            khata_obj.save(update_fields=["balance_paise", "updated_at"])

        for pi in prepared_items:
            OrderItem.objects.create(
                id=create_id(),
                order_id=order_id,
                product_id=pi["productId"],
                product_name=pi["name"],
                unit_label=pi["unitLabel"],
                qty=pi["qty"],
                unit_price_paise=pi["unitPricePaise"],
                cost_price_paise=pi["costPricePaise"],
                tax_percent=pi["taxPercent"],
                discount_paise=pi["discountPaise"],
                line_total_paise=pi["lineTotalPaise"],
                packed=True,
            )

        Payment.objects.create(
            id=create_id(),
            order_id=order_id,
            store_id=store_id,
            method_code=payment_method,
            amount_paise=total_paise,
            status=payment_status,
            verified_by=actor["id"],
            verified_at=now,
            created_at=now,
        )

        OrderEvent.objects.create(
            id=create_id(),
            order_id=order_id,
            from_status=None,
            to_status="completed",
            actor_name=actor["name"],
            actor_role=actor["role"],
            reason="POS sale completed",
            created_at=now,
        )

    hydrated = hydrate_order(order_id)
    if idem_key:
        IdempotencyKey.objects.get_or_create(
            key=idem_key,
            defaults={"store_id": store_id, "response_json": json.dumps(hydrated), "created_at": now},
        )

    for ls in low_stock_events:
        notify_store_team(
            store_id=store_id,
            notif_type="stock.low",
            vars_dict={"productName": ls["name"], "qty": ls["qty"], "unit": "", "reorder": ls["reorder"]},
            entity_type="product",
            entity_id=ls["productId"],
        )

    realtime_hub.emit("order.created", store_id=store_id, entity_id=order_id)
    realtime_hub.emit("catalog.updated", store_id=store_id)
    if payload["paymentMethod"] == "khata":
        realtime_hub.emit("khata.updated", store_id=store_id)
    return hydrated


def list_held_bills(store_id: str) -> list[dict[str, Any]]:
    rows = HeldBill.objects.filter(store_id=store_id).order_by("-created_at")
    return [
        {
            "id": r.id,
            "label": r.label,
            "payload": json.loads(r.payload_json),
            "createdAt": fmt_dt(r.created_at),
        }
        for r in rows
    ]


def hold_pos_bill(store_id: str, label: str, payload: Any, actor_id: str) -> list[dict[str, Any]]:
    HeldBill.objects.create(
        id=create_id(),
        store_id=store_id,
        label=(label or "").strip() or "Held Bill",
        payload_json=json.dumps(payload),
        created_by=actor_id,
        created_at=now_utc(),
    )
    return list_held_bills(store_id)


def delete_held_bill(store_id: str, bill_id: str) -> list[dict[str, Any]]:
    HeldBill.objects.filter(id=bill_id, store_id=store_id).delete()
    return list_held_bills(store_id)


def void_or_refund_order(
    store_id: str,
    order_id: str,
    payload: dict[str, Any],
    actor: dict[str, str],
) -> dict[str, Any]:
    reason = (payload.get("reason") or "").strip()
    if not reason:
        raise AppError(
            "VALIDATION_ERROR",
            "A reason is required to void or refund.",
            400,
            {"reason": "Reason is required."},
        )

    now = now_utc()
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(id=order_id, store_id=store_id).first()
        if not order:
            raise AppError("NOT_FOUND", "Order not found.", 404)
        if order.status_code in ("refunded", "cancelled"):
            raise AppError("INVALID_TRANSITION", "Order is already voided or refunded.", 400)

        if payload.get("restoreStock"):
            for item in OrderItem.objects.filter(order_id=order_id):
                if not item.product_id:
                    continue
                prod = Product.objects.select_for_update().filter(id=item.product_id).first()
                if not prod:
                    continue
                next_qty = prod.stock_qty + item.qty
                prod.stock_qty = next_qty
                prod.updated_at = now
                prod.save(update_fields=["stock_qty", "updated_at"])
                StockMovement.objects.create(
                    id=create_id(),
                    store_id=store_id,
                    product_id=item.product_id,
                    movement_type="return_restore",
                    qty_delta=item.qty,
                    qty_after=next_qty,
                    reason=f"Refund/Void {order.order_number}: {reason}",
                    reference_id=order_id,
                    actor_id=actor["id"],
                    created_at=now,
                )

        old_status = order.status_code
        order.status_code = "refunded"
        order.payment_status = "refunded"
        order.updated_at = now
        order.save(update_fields=["status_code", "payment_status", "updated_at"])

        Refund.objects.create(
            id=create_id(),
            order_id=order_id,
            store_id=store_id,
            amount_paise=order.total_paise,
            method_code=payload.get("refundMethod") or order.payment_method,
            reference_no=payload.get("referenceNo"),
            reason=reason,
            actor_id=actor["id"],
            created_at=now,
        )

        OrderEvent.objects.create(
            id=create_id(),
            order_id=order_id,
            from_status=old_status,
            to_status="refunded",
            actor_name=actor["name"],
            actor_role=actor["role"],
            reason=reason,
            created_at=now,
        )

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="order.refunded",
        entity_type="order",
        entity_id=order_id,
        details={"reason": reason},
    )
    realtime_hub.emit("order.updated", store_id=store_id, entity_id=order_id)
    realtime_hub.emit("catalog.updated", store_id=store_id)
    return hydrate_order(order_id)


def quote_customer_cart(store_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    store = Store.objects.filter(id=store_id, deleted_at__isnull=True).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)
    if store.status != "active":
        raise AppError("STORE_UNAVAILABLE", store.suspension_reason or "This store is currently unavailable.", 400)
    if not store.is_open:
        raise AppError("STORE_CLOSED", store.closed_reason or "The store is currently closed for orders.", 400)

    catalog = list_products(store_id, online_only=True)
    catalog_map = {p["id"]: p for p in catalog}

    conflicts: list[dict[str, Any]] = []
    subtotal_paise = 0
    savings_paise = 0
    validated_items: list[dict[str, Any]] = []

    for req_item in payload.get("items") or []:
        prod = catalog_map.get(req_item["productId"])
        if not prod:
            conflicts.append(
                {
                    "productId": req_item["productId"],
                    "productName": "Unavailable Item",
                    "issue": "unavailable",
                    "availableQty": 0,
                    "newPricePaise": 0,
                }
            )
            continue

        qty = float(req_item["qty"])
        effective_price = prod["effectivePricePaise"] if prod.get("effectivePricePaise") is not None else prod["sellingPricePaise"]
        if prod["availableQty"] <= 0:
            conflicts.append(
                {
                    "productId": prod["id"],
                    "productName": prod["name"],
                    "issue": "out_of_stock",
                    "availableQty": 0,
                    "newPricePaise": effective_price,
                }
            )
        elif prod["availableQty"] < qty:
            conflicts.append(
                {
                    "productId": prod["id"],
                    "productName": prod["name"],
                    "issue": "insufficient_stock",
                    "availableQty": prod["availableQty"],
                    "newPricePaise": effective_price,
                }
            )
        elif req_item.get("expectedPricePaise") is not None and int(req_item["expectedPricePaise"]) != effective_price:
            conflicts.append(
                {
                    "productId": prod["id"],
                    "productName": prod["name"],
                    "issue": "price_changed",
                    "availableQty": prod["availableQty"],
                    "newPricePaise": effective_price,
                }
            )

        line_total = round(effective_price * qty)
        mrp_total = round(prod["mrpPaise"] * qty)
        subtotal_paise += line_total
        savings_paise += max(0, mrp_total - line_total)

        validated_items.append(
            {
                "productId": prod["id"],
                "productName": prod["name"],
                "unitLabel": prod.get("unitLabel") or "pcs",
                "qty": qty,
                "unitPricePaise": effective_price,
                "costPricePaise": prod["costPricePaise"],
                "taxPercent": prod.get("taxRatePercent") or 0.0,
                "lineTotalPaise": line_total,
            }
        )

    fulfilment = payload["fulfilment"]
    delivery_fee_paise = store.delivery_fee_paise if fulfilment == "delivery" else 0
    total_paise = subtotal_paise + delivery_fee_paise

    radius_km = store.delivery_radius_km if store.delivery_radius_km is not None else 0.0
    delivery_distance_km: Optional[float] = None
    d_lat = payload.get("deliveryLat")
    d_lng = payload.get("deliveryLng")
    if d_lat is not None and d_lng is not None and store.store_lat is not None and store.store_lng is not None:
        delivery_distance_km = calculate_distance_km(store.store_lat, store.store_lng, float(d_lat), float(d_lng))
    elif payload.get("deliveryDistanceKm") is not None:
        raw_dist = float(payload["deliveryDistanceKm"])
        if math.isfinite(raw_dist):
            delivery_distance_km = round(raw_dist * 100.0) / 100.0

    if fulfilment != "delivery" or radius_km <= 0:
        is_within_range: Optional[bool] = True
    elif delivery_distance_km is not None:
        is_within_range = delivery_distance_km <= radius_km
    else:
        is_within_range = None

    return {
        "items": validated_items,
        "subtotalPaise": subtotal_paise,
        "savingsPaise": savings_paise,
        "deliveryFeePaise": delivery_fee_paise,
        "totalPaise": total_paise,
        "minOrderPaise": store.min_order_paise,
        "meetsMinOrder": subtotal_paise >= store.min_order_paise,
        "deliveryRadiusKm": radius_km,
        "deliveryDistanceKm": delivery_distance_km,
        "isWithinDeliveryRange": is_within_range,
        "conflicts": conflicts,
    }


def create_online_order(
    store_id: str,
    customer: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    idem_key = payload.get("idempotencyKey")
    if idem_key:
        existing_key = IdempotencyKey.objects.filter(key=idem_key, store_id=store_id).first()
        if existing_key:
            return json.loads(existing_key.response_json)

    req_items = payload.get("items") or []
    if not req_items:
        raise AppError("EMPTY_CART", "Your cart is empty.", 400)

    quote = quote_customer_cart(
        store_id,
        {
            "fulfilment": payload["fulfilment"],
            "deliveryLat": payload.get("deliveryLat"),
            "deliveryLng": payload.get("deliveryLng"),
            "deliveryDistanceKm": payload.get("deliveryDistanceKm"),
            "items": [{"productId": i["productId"], "qty": i["qty"]} for i in req_items],
        },
    )

    if quote["conflicts"]:
        raise AppError("CART_CONFLICTS", "Some items in your cart changed availability or price.", 409)
    if not quote["meetsMinOrder"]:
        raise AppError("MIN_ORDER_NOT_MET", "Your order is below the store minimum order amount.", 400)
    if payload["fulfilment"] == "delivery" and quote["isWithinDeliveryRange"] is False:
        raise AppError(
            "OUT_OF_DELIVERY_RANGE",
            "Sorry, you are out of range and unable to deliver. You can choose the pickup option to come to the store and get your things.",
            400,
        )

    now = now_utc()
    with transaction.atomic():
        method_row = StorePaymentMethod.objects.filter(
            store_id=store_id, method_code_id=payload["paymentMethod"]
        ).first()
        if not method_row or not method_row.enabled:
            raise AppError("PAYMENT_METHOD_DISABLED", "Selected payment method is not enabled by this store.", 400)

        order_id = create_id()
        order_number = _next_order_number(store_id)
        handover_code = str(random.randint(1000, 9999)) if payload["fulfilment"] == "delivery" else None

        payment_status = "unpaid"
        khata_to_debit: Optional[tuple[KhataAccount, int]] = None

        if payload["paymentMethod"] in ("pay_at_pickup", "cash"):
            payment_status = "pay_on_delivery"
        elif payload["paymentMethod"] == "khata":
            khata = KhataAccount.objects.select_for_update().filter(
                store_id=store_id, customer_id=customer["id"], status="active"
            ).first()
            if not khata:
                raise AppError("KHATA_NOT_LINKED", "Khata credit is not enabled for your account at this store.", 400)
            if khata.balance_paise + quote["totalPaise"] > khata.credit_limit_paise:
                raise AppError("KHATA_LIMIT_EXCEEDED", "Order exceeds your Khata credit limit.", 400)
            khata_to_debit = (khata, khata.balance_paise + quote["totalPaise"])
            payment_status = "on_khata"

        for item in quote["items"]:
            prod = Product.objects.select_for_update().get(id=item["productId"])
            prod.reserved_qty += item["qty"]
            prod.updated_at = now
            prod.save(update_fields=["reserved_qty", "updated_at"])
            StockMovement.objects.create(
                id=create_id(),
                store_id=store_id,
                product_id=item["productId"],
                movement_type="online_reserve",
                qty_delta=0.0,
                qty_after=prod.stock_qty,
                reason=f"Reserved {item['qty']} for online order {order_number}",
                reference_id=order_id,
                actor_id=customer["id"],
                created_at=now,
            )

        tax_paise = sum(
            round((it["lineTotalPaise"] * it["taxPercent"]) / (100.0 + it["taxPercent"]))
            for it in quote["items"]
            if (100.0 + it["taxPercent"]) > 0
        )

        is_delivery = payload["fulfilment"] == "delivery"
        Order.objects.create(
            id=order_id,
            store_id=store_id,
            order_number=order_number,
            channel="online",
            fulfilment=payload["fulfilment"],
            pickup_slot=payload.get("pickupSlot"),
            delivery_address=payload.get("deliveryAddress"),
            delivery_lat=payload.get("deliveryLat") if is_delivery else None,
            delivery_lng=payload.get("deliveryLng") if is_delivery else None,
            delivery_distance_km=quote["deliveryDistanceKm"] if is_delivery else None,
            status_code="placed",
            payment_status=payment_status,
            payment_method=payload["paymentMethod"],
            customer_id=customer["id"],
            customer_name=customer["name"],
            customer_phone=customer.get("phone"),
            subtotal_paise=quote["subtotalPaise"],
            discount_paise=0,
            tax_paise=tax_paise,
            delivery_fee_paise=quote["deliveryFeePaise"],
            total_paise=quote["totalPaise"],
            handover_code=handover_code,
            notes=payload.get("notes"),
            idempotency_key=idem_key,
            created_by=customer["id"],
            created_at=now,
            updated_at=now,
        )

        if khata_to_debit:
            khata_obj, next_bal = khata_to_debit
            KhataEntry.objects.create(
                id=create_id(),
                store_id=store_id,
                account_id=khata_obj.id,
                order_id=order_id,
                entry_type="debit",
                amount_paise=quote["totalPaise"],
                balance_after_paise=next_bal,
                note=f"Online Order {order_number}",
                created_by=customer["id"],
                created_at=now,
            )
            khata_obj.balance_paise = next_bal
            khata_obj.updated_at = now
            khata_obj.save(update_fields=["balance_paise", "updated_at"])

        pref_map = {i["productId"]: i.get("substitutionPref") or "call_me" for i in req_items}
        for item in quote["items"]:
            OrderItem.objects.create(
                id=create_id(),
                order_id=order_id,
                product_id=item["productId"],
                product_name=item["productName"],
                unit_label=item["unitLabel"],
                qty=item["qty"],
                unit_price_paise=item["unitPricePaise"],
                cost_price_paise=item["costPricePaise"],
                tax_percent=item["taxPercent"],
                discount_paise=0,
                line_total_paise=item["lineTotalPaise"],
                substitution_pref=pref_map.get(item["productId"], "call_me"),
            )

        Payment.objects.create(
            id=create_id(),
            order_id=order_id,
            store_id=store_id,
            method_code=payload["paymentMethod"],
            amount_paise=quote["totalPaise"],
            status=payment_status,
            created_at=now,
        )

        OrderEvent.objects.create(
            id=create_id(),
            order_id=order_id,
            from_status=None,
            to_status="placed",
            actor_name=customer["name"],
            actor_role="customer",
            reason="Order placed by customer",
            created_at=now,
        )

    hydrated = hydrate_order(order_id)
    if idem_key:
        IdempotencyKey.objects.get_or_create(
            key=idem_key,
            defaults={"store_id": store_id, "response_json": json.dumps(hydrated), "created_at": now},
        )

    currency = get_setting_value("currency_symbol", "₹")
    notify_store_team(
        store_id=store_id,
        notif_type="order.new",
        vars_dict={
            "orderNumber": hydrated["orderNumber"],
            "customerName": customer["name"],
            "fulfilment": payload["fulfilment"],
            "amount": f"{currency}{hydrated['totalPaise'] / 100:.2f}",
        },
        entity_type="order",
        entity_id=order_id,
    )
    realtime_hub.emit("order.created", store_id=store_id, entity_id=order_id)
    realtime_hub.emit("catalog.updated", store_id=store_id)
    return hydrated


def transition_order_status(
    store_id: str,
    order_id: str,
    payload: dict[str, Any],
    actor: dict[str, str],
) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id, store_id=store_id).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)

    to_status = payload["toStatus"]
    if not StatusTransition.objects.filter(from_code=order.status_code, to_code=to_status).exists():
        raise AppError("INVALID_TRANSITION", f"Cannot move order from {order.status_code} to {to_status}.", 400)

    target_meta = OrderStatus.objects.filter(code=to_status).first()
    reason_clean = (payload.get("reason") or "").strip()
    if target_meta and target_meta.requires_reason and not reason_clean:
        raise AppError(
            "VALIDATION_ERROR",
            "A reason is required for this status change.",
            400,
            {"reason": "Please enter a reason."},
        )

    if (
        to_status == "completed"
        and order.payment_method == "upi"
        and order.payment_status != "paid"
        and not payload.get("overrideUnpaid")
    ):
        raise AppError("PAYMENT_NOT_CONFIRMED", "Confirm UPI payment before completing this order.", 400)

    if (
        to_status == "completed"
        and order.fulfilment == "delivery"
        and order.handover_code
        and (payload.get("handoverCode") or "").strip() != order.handover_code
    ):
        raise AppError(
            "INVALID_HANDOVER_CODE",
            "Enter the 4-digit delivery handover code shown in the customer app.",
            400,
            {"handoverCode": "Handover code does not match."},
        )

    now = now_utc()
    low_stock_alerts: list[dict[str, Any]] = []

    with transaction.atomic():
        order = Order.objects.select_for_update().get(id=order_id)
        old_status = order.status_code
        items = list(OrderItem.objects.filter(order_id=order_id))

        if to_status in ("cancelled", "rejected", "failed"):
            for it in items:
                if not it.product_id or it.availability_status == "unavailable_approved":
                    continue
                prod = Product.objects.select_for_update().filter(id=it.product_id).first()
                if not prod:
                    continue
                prod.reserved_qty = max(0.0, prod.reserved_qty - it.qty)
                prod.updated_at = now
                prod.save(update_fields=["reserved_qty", "updated_at"])
                StockMovement.objects.create(
                    id=create_id(),
                    store_id=store_id,
                    product_id=prod.id,
                    movement_type="online_release",
                    qty_delta=0.0,
                    qty_after=prod.stock_qty,
                    reason=f"Released reservation on {to_status} ({order.order_number})",
                    reference_id=order_id,
                    actor_id=actor["id"],
                    created_at=now,
                )

        if to_status == "completed":
            for it in items:
                if not it.product_id or it.availability_status == "unavailable_approved":
                    continue
                prod = Product.objects.select_for_update().filter(id=it.product_id).first()
                if not prod:
                    continue
                next_stock = max(0.0, prod.stock_qty - it.qty)
                prod.stock_qty = next_stock
                prod.reserved_qty = max(0.0, prod.reserved_qty - it.qty)
                prod.updated_at = now
                prod.save(update_fields=["stock_qty", "reserved_qty", "updated_at"])
                StockMovement.objects.create(
                    id=create_id(),
                    store_id=store_id,
                    product_id=prod.id,
                    movement_type="online_deduct",
                    qty_delta=-it.qty,
                    qty_after=next_stock,
                    reason=f"Online order completed {order.order_number}",
                    reference_id=order_id,
                    actor_id=actor["id"],
                    created_at=now,
                )
                if next_stock <= prod.reorder_level:
                    low_stock_alerts.append(
                        {
                            "productId": prod.id,
                            "name": prod.name,
                            "qty": next_stock,
                            "reorder": prod.reorder_level,
                        }
                    )

            if order.payment_status == "pay_on_delivery":
                order.payment_status = "paid"
                Payment.objects.filter(order_id=order_id).update(
                    status="paid", verified_by=actor["id"], verified_at=now
                )

        order.status_code = to_status
        if payload.get("assignedStaffName"):
            order.assigned_staff_name = payload["assignedStaffName"]
        order.updated_at = now
        order.save()

        OrderEvent.objects.create(
            id=create_id(),
            order_id=order_id,
            from_status=old_status,
            to_status=to_status,
            actor_name=actor["name"],
            actor_role=actor["role"],
            reason=reason_clean or ("Completed with unpaid override" if payload.get("overrideUnpaid") else None),
            created_at=now,
        )

    if order.customer_id and actor["role"] != "customer":
        notify_from_template(
            recipient_id=order.customer_id,
            store_id=store_id,
            notif_type="order.cancelled" if to_status in ("cancelled", "rejected") else "order.status_changed",
            vars_dict={
                "orderNumber": order.order_number,
                "statusLabel": target_meta.label if target_meta else to_status,
                "reason": reason_clean,
            },
            entity_type="order",
            entity_id=order_id,
        )

    for ls in low_stock_alerts:
        notify_store_team(
            store_id=store_id,
            notif_type="stock.low",
            vars_dict={"productName": ls["name"], "qty": ls["qty"], "unit": "", "reorder": ls["reorder"]},
            entity_type="product",
            entity_id=ls["productId"],
        )

    realtime_hub.emit("order.updated", store_id=store_id, entity_id=order_id)
    realtime_hub.emit("catalog.updated", store_id=store_id)
    return hydrate_order(order_id)


def cancel_order_by_customer(order_id: str, customer: dict[str, str], reason: str) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id, customer_id=customer["id"]).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)
    if order.status_code != "placed":
        raise AppError("CANNOT_CANCEL", "Orders can only be cancelled before the store accepts them.", 400)

    final_reason = (reason or "").strip() or "Cancelled by customer"
    updated = transition_order_status(
        order.store_id,
        order_id,
        {"toStatus": "cancelled", "reason": final_reason},
        {"id": customer["id"], "role": "customer", "name": customer["name"]},
    )
    notify_store_team(
        store_id=order.store_id,
        notif_type="order.cancelled",
        vars_dict={"orderNumber": order.order_number, "reason": final_reason},
        entity_type="order",
        entity_id=order_id,
    )
    return updated


def mark_order_item_packing(
    store_id: str,
    order_id: str,
    item_id: str,
    payload: dict[str, Any],
    actor: dict[str, str],
) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id, store_id=store_id).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)
    item = OrderItem.objects.filter(id=item_id, order_id=order_id).first()
    if not item:
        raise AppError("NOT_FOUND", "Order item not found.", 404)

    action = payload.get("action")
    if action == "toggle_pack":
        item.packed = bool(payload.get("packed"))
        item.save(update_fields=["packed"])
    elif action == "mark_unavailable":
        item.availability_status = "unavailable_pending"
        item.save(update_fields=["availability_status"])
        if order.customer_id:
            notify_from_template(
                recipient_id=order.customer_id,
                store_id=store_id,
                notif_type="order.item_unavailable",
                vars_dict={"orderNumber": order.order_number, "productName": item.product_name},
                entity_type="order",
                entity_id=order_id,
            )
    elif action == "substitute":
        item.availability_status = "substituted"
        item.substitute_name = (payload.get("substituteName") or "").strip() or "Store substitute"
        item.packed = True
        item.save(update_fields=["availability_status", "substitute_name", "packed"])

    Order.objects.filter(id=order_id).update(updated_at=now_utc())
    realtime_hub.emit("order.updated", store_id=store_id, entity_id=order_id)
    return hydrate_order(order_id)


def respond_unavailable_item(order_id: str, customer: dict[str, str], decision: str) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id, customer_id=customer["id"]).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)

    if decision == "cancel":
        return transition_order_status(
            order.store_id,
            order_id,
            {"toStatus": "cancelled", "reason": "Customer cancelled due to unavailable item"},
            {"id": customer["id"], "role": "customer", "name": customer["name"]},
        )

    now = now_utc()
    with transaction.atomic():
        pending_items = list(OrderItem.objects.filter(order_id=order_id, availability_status="unavailable_pending"))
        for pit in pending_items:
            pit.availability_status = "unavailable_approved"
            pit.line_total_paise = 0
            pit.save(update_fields=["availability_status", "line_total_paise"])
            if pit.product_id:
                prod = Product.objects.select_for_update().filter(id=pit.product_id).first()
                if prod:
                    prod.reserved_qty = max(0.0, prod.reserved_qty - pit.qty)
                    prod.updated_at = now
                    prod.save(update_fields=["reserved_qty", "updated_at"])

        active_items = list(OrderItem.objects.filter(order_id=order_id).exclude(availability_status="unavailable_approved"))
        new_subtotal = sum(a.line_total_paise for a in active_items)
        new_tax = sum(
            round((a.line_total_paise * a.tax_percent) / (100.0 + a.tax_percent))
            for a in active_items
            if (100.0 + a.tax_percent) > 0
        )
        new_total = new_subtotal + order.delivery_fee_paise

        Order.objects.filter(id=order_id).update(
            subtotal_paise=new_subtotal,
            tax_paise=new_tax,
            total_paise=new_total,
            updated_at=now,
        )
        OrderEvent.objects.create(
            id=create_id(),
            order_id=order_id,
            from_status=order.status_code,
            to_status=order.status_code,
            actor_name=customer["name"],
            actor_role="customer",
            reason="Customer approved updated items and total",
            created_at=now,
        )

    realtime_hub.emit("order.updated", store_id=order.store_id, entity_id=order_id)
    return hydrate_order(order_id)


def switch_order_payment_to_cash(order_id: str, customer_id: str) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id, customer_id=customer_id).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)

    new_method = "pay_at_pickup" if order.fulfilment == "pickup" else "cash"
    Order.objects.filter(id=order_id).update(
        payment_method=new_method,
        payment_status="pay_on_delivery",
        updated_at=now_utc(),
    )
    realtime_hub.emit("order.updated", store_id=order.store_id, entity_id=order_id)
    realtime_hub.emit("payment.updated", store_id=order.store_id, entity_id=order_id)
    return hydrate_order(order_id)


def add_order_message(order_id: str, sender: dict[str, str], body: str) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id).only("store_id").first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)
    clean_body = (body or "").strip()
    if not clean_body:
        raise AppError("VALIDATION_ERROR", "Message cannot be empty.", 400)

    OrderMessage.objects.create(
        id=create_id(),
        order_id=order_id,
        sender_role=sender["role"],
        sender_name=sender["name"],
        body=clean_body,
        created_at=now_utc(),
    )
    realtime_hub.emit("order.updated", store_id=order.store_id, entity_id=order_id)
    return hydrate_order(order_id)


def rate_order(order_id: str, customer_id: str, rating: int, feedback: str) -> dict[str, Any]:
    order = Order.objects.filter(id=order_id, customer_id=customer_id).first()
    if not order:
        raise AppError("NOT_FOUND", "Order not found.", 404)

    Order.objects.filter(id=order_id).update(
        rating=rating,
        feedback=(feedback or "").strip(),
        updated_at=now_utc(),
    )
    realtime_hub.emit("order.updated", store_id=order.store_id, entity_id=order_id)
    return hydrate_order(order_id)
