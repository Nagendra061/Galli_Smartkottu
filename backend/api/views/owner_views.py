from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from api.auth_utils import fmt_dt, get_store_id_or_throw, require_roles
from api.errors import AppError
from api.models import Plan, Product, StoreStaff
from api.services.finance_service import (
    create_expense,
    delete_expense,
    get_daily_closing_preview,
    get_finance_summary_and_pnl,
    get_predictions,
    get_profit_advisor,
    get_smo_home_snapshot,
    list_expenses,
    list_upi_reconciliation,
    set_advisor_action_status,
    submit_daily_closing,
)
from api.services.inventory_service import (
    adjust_stock,
    archive_or_restore_product,
    create_brand,
    create_category,
    create_offer,
    create_product,
    create_supplier,
    get_inventory_predictions,
    import_products_bulk,
    list_brands,
    list_categories,
    list_master_products,
    list_offers,
    list_products,
    list_stock_movements,
    list_suppliers,
    toggle_offer,
    update_brand,
    update_category,
    update_product,
)
from api.services.khata_service import (
    add_khata_entry,
    create_khata_account,
    get_khata_detail,
    list_khata_accounts,
    update_khata_control,
)
from api.services.order_service import (
    add_order_message,
    create_pos_bill,
    delete_held_bill,
    hold_pos_bill,
    hydrate_order,
    list_held_bills,
    list_store_orders,
    mark_order_item_packing,
    transition_order_status,
    void_or_refund_order,
)
from api.services.payment_service import verify_payment
from api.services.store_service import (
    create_store_staff,
    generate_qr_data_url,
    get_store_by_id,
    list_store_staff,
    toggle_store_staff,
    update_store_payment_method,
    update_store_settings,
)
from api.services.support_service import (
    create_support_ticket,
    list_tickets,
    reply_to_ticket,
    request_account_deletion,
)


def _assert_smo(request) -> None:
    if request.user.role != "smo":
        raise AppError("FORBIDDEN", "You do not have permission to access this resource.", 403)


def _get_base_url(request) -> str:
    app_url = getattr(settings, "APP_URL", "").strip().rstrip("/")
    if app_url:
        return app_url
    scheme = "https" if request.is_secure() else "http"
    return f"{scheme}://{request.get_host()}"


# ---------- HOME & ORDERS & POS ----------


@api_view(["GET"])
@permission_classes([require_roles("smo", "staff")])
def owner_home(request):
    store_id = get_store_id_or_throw(request)
    store = get_store_by_id(store_id)
    snapshot = get_smo_home_snapshot(store_id)
    return Response({"store": store, "snapshot": snapshot})


@api_view(["GET"])
@permission_classes([require_roles("smo", "staff")])
def owner_orders_list(request):
    store_id = get_store_id_or_throw(request)
    channel = request.query_params.get("channel")
    if channel not in ("pos", "online"):
        channel = None
    return Response(list_store_orders(store_id, channel))


@api_view(["GET"])
@permission_classes([require_roles("smo", "staff")])
def owner_order_detail(request, order_id: str):
    store_id = get_store_id_or_throw(request)
    ord_data = hydrate_order(order_id)
    if ord_data["storeId"] != store_id:
        raise AppError("FORBIDDEN", "Order belongs to another store.", 403)
    return Response(ord_data)


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_pos_bills(request):
    store_id = get_store_id_or_throw(request)
    body = dict(request.data) if isinstance(request.data, dict) else {}
    idem_key = request.META.get("HTTP_IDEMPOTENCY_KEY") or body.get("idempotencyKey")
    if idem_key:
        body["idempotencyKey"] = idem_key
    result = create_pos_bill(store_id, body, request.user.as_actor())
    return Response(result, status=201)


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_pos_held(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_held_bills(store_id))
    body = request.data if isinstance(request.data, dict) else {}
    return Response(
        hold_pos_bill(store_id, str(body.get("label") or ""), body.get("payload"), request.user.id),
        status=201,
    )


@api_view(["DELETE"])
@permission_classes([require_roles("smo", "staff")])
def owner_pos_held_delete(request, bill_id: str):
    store_id = get_store_id_or_throw(request)
    return Response(delete_held_bill(store_id, bill_id))


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_order_transition(request, order_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(transition_order_status(store_id, order_id, body, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_order_item_pack(request, order_id: str, item_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(mark_order_item_packing(store_id, order_id, item_id, body, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_order_messages(request, order_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    text = str(body.get("body") or "")
    if not text.strip():
        raise AppError("VALIDATION_ERROR", "Message cannot be empty.", 400)
    return Response(add_order_message(order_id, {"role": request.user.role, "name": request.user.name}, text))


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_order_refund(request, order_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(void_or_refund_order(store_id, order_id, body, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_payment_confirm(request, payment_id: str):
    store_id = get_store_id_or_throw(request)
    store = get_store_by_id(store_id)
    if request.user.role == "staff" and not store["staffCanVerifyPayment"]:
        raise AppError("FORBIDDEN", "Staff payment verification is disabled in store settings.", 403)
    return Response(verify_payment(store_id, payment_id, "confirm", request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_payment_reject(request, payment_id: str):
    store_id = get_store_id_or_throw(request)
    store = get_store_by_id(store_id)
    if request.user.role == "staff" and not store["staffCanVerifyPayment"]:
        raise AppError("FORBIDDEN", "Staff payment verification is disabled in store settings.", 403)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(verify_payment(store_id, payment_id, "reject", request.user.as_actor(), body.get("reason")))


# ---------- INVENTORY ----------


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_products(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        include_archived = request.query_params.get("includeArchived") == "true"
        return Response(list_products(store_id, include_archived=include_archived))

    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    fields: dict[str, str] = {}
    if not str(body.get("name") or "").strip():
        fields["name"] = "Product name is required."
    if not str(body.get("unitId") or "").strip():
        fields["unitId"] = "Select a unit."
    if not str(body.get("taxRateId") or "").strip():
        fields["taxRateId"] = "Select a tax slab."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)

    return Response(create_product(store_id, body, request.user.as_actor()), status=201)


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_products_import(request):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    rows = body.get("rows")
    if not isinstance(rows, list) or len(rows) == 0:
        raise AppError("VALIDATION_ERROR", "Provide at least one product row.", 400)
    return Response(import_products_bulk(store_id, rows, request.user.as_actor()), status=201)


@api_view(["GET"])
@permission_classes([require_roles("smo", "staff")])
def owner_master_products(request):
    return Response(list_master_products())


@api_view(["GET"])
@permission_classes([require_roles("smo", "staff")])
def owner_inventory_predictions(request):
    return Response(get_inventory_predictions(get_store_id_or_throw(request)))


@api_view(["PATCH"])
@permission_classes([require_roles("smo")])
def owner_product_update(request, product_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(update_product(store_id, product_id, body, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_product_archive(request, product_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    archive = bool(body.get("archive"))
    return Response(archive_or_restore_product(store_id, product_id, archive, request.user.as_actor()))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_categories(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_categories(store_id, include_archived=True))
    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(
        create_category(store_id, str(body.get("name") or ""), body.get("parentId"), request.user.as_actor()),
        status=201,
    )


@api_view(["PATCH"])
@permission_classes([require_roles("smo")])
def owner_category_update(request, category_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(update_category(store_id, category_id, str(body.get("name") or ""), request.user.as_actor()))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_brands(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_brands(store_id))
    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(create_brand(store_id, str(body.get("name") or ""), request.user.as_actor()), status=201)


@api_view(["PATCH"])
@permission_classes([require_roles("smo")])
def owner_brand_update(request, brand_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(update_brand(store_id, brand_id, str(body.get("name") or ""), request.user.as_actor()))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_offers(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_offers(store_id, active_only=False))
    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    fields: dict[str, str] = {}
    if not str(body.get("title") or "").strip():
        fields["title"] = "Offer title is required."
    if body.get("offerType") not in ("percent", "flat", "combo", "bogo"):
        fields["offerType"] = "Invalid offer type."
    if not isinstance(body.get("productIds"), list) or len(body["productIds"]) == 0:
        fields["productIds"] = "Select at least one product."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)
    return Response(create_offer(store_id, body, request.user.as_actor()), status=201)


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_offer_toggle(request, offer_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(toggle_offer(store_id, offer_id, bool(body.get("isActive")), request.user.as_actor()))


@api_view(["GET"])
@permission_classes([require_roles("smo", "staff")])
def owner_stock_movements(request):
    return Response(list_stock_movements(get_store_id_or_throw(request)))


@api_view(["POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_stock_adjust(request):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    if not str(body.get("productId") or "").strip() or body.get("movementType") not in (
        "stock_in",
        "adjustment",
        "stock_take",
        "damaged",
    ):
        raise AppError("VALIDATION_ERROR", "Invalid stock adjustment request.", 400)
    if not str(body.get("reason") or "").strip():
        raise AppError("VALIDATION_ERROR", "Reason is required.", 400, {"reason": "Reason is required."})
    return Response(adjust_stock(store_id, body, request.user.as_actor()))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo")])
def owner_suppliers(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_suppliers(store_id))
    body = request.data if isinstance(request.data, dict) else {}
    if not str(body.get("name") or "").strip():
        raise AppError("VALIDATION_ERROR", "Supplier name is required.", 400, {"name": "Supplier name is required."})
    return Response(create_supplier(store_id, body, request.user.as_actor()), status=201)


# ---------- FINANCE (SMO ONLY) ----------


@api_view(["GET"])
@permission_classes([require_roles("smo")])
def owner_finance_summary(request):
    from_date = request.query_params.get("from")
    to_date = request.query_params.get("to")
    return Response(get_finance_summary_and_pnl(get_store_id_or_throw(request), from_date, to_date))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo")])
def owner_finance_closings(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(get_daily_closing_preview(store_id, request.query_params.get("date")))
    body = request.data if isinstance(request.data, dict) else {}
    if len(str(body.get("closingDate") or "")) < 10:
        raise AppError("VALIDATION_ERROR", "Valid closingDate is required.", 400)
    return Response(submit_daily_closing(store_id, body, request.user.as_actor()), status=201)


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo")])
def owner_finance_expenses(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_expenses(store_id))
    body = request.data if isinstance(request.data, dict) else {}
    fields: dict[str, str] = {}
    if not str(body.get("category") or "").strip():
        fields["category"] = "Category is required."
    if not str(body.get("title") or "").strip():
        fields["title"] = "Expense title is required."
    if int(body.get("amountPaise") or 0) <= 0:
        fields["amountPaise"] = "Amount must be greater than zero."
    if len(str(body.get("expenseDate") or "")) < 10:
        fields["expenseDate"] = "Valid expense date is required."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)
    return Response(create_expense(store_id, body, request.user.as_actor()), status=201)


@api_view(["DELETE"])
@permission_classes([require_roles("smo")])
def owner_finance_expense_delete(request, expense_id: str):
    return Response(delete_expense(get_store_id_or_throw(request), expense_id, request.user.as_actor()))


@api_view(["GET"])
@permission_classes([require_roles("smo")])
def owner_finance_upi_payments(request):
    return Response(list_upi_reconciliation(get_store_id_or_throw(request)))


@api_view(["GET"])
@permission_classes([require_roles("smo")])
def owner_finance_predictions(request):
    return Response(get_predictions(get_store_id_or_throw(request)))


@api_view(["GET"])
@permission_classes([require_roles("smo")])
def owner_finance_advisor(request):
    return Response(get_profit_advisor(get_store_id_or_throw(request)))


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_finance_advisor_action(request):
    body = request.data if isinstance(request.data, dict) else {}
    action_key = str(body.get("actionKey") or "")
    status = body.get("status")
    if not action_key or status not in ("done", "dismissed"):
        raise AppError("VALIDATION_ERROR", "Valid actionKey and status are required.", 400)
    return Response(set_advisor_action_status(get_store_id_or_throw(request), action_key, status))


# ---------- KHATA ----------


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo", "staff")])
def owner_khata_accounts(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_khata_accounts(store_id))
    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    fields: dict[str, str] = {}
    if not str(body.get("customerName") or "").strip():
        fields["customerName"] = "Customer name is required."
    if len(str(body.get("phone") or "")) < 10:
        fields["phone"] = "Phone number is required."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)
    return Response(create_khata_account(store_id, body, request.user.as_actor()), status=201)


@api_view(["GET", "PATCH"])
@permission_classes([require_roles("smo", "staff")])
def owner_khata_account_detail(request, account_id: str):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(get_khata_detail(store_id, account_id))
    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(update_khata_control(store_id, account_id, body, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_khata_entries(request):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    if not body.get("accountId") or body.get("entryType") not in ("debit", "credit", "write_off"):
        raise AppError("VALIDATION_ERROR", "Invalid Khata entry.", 400)
    if int(body.get("amountPaise") or 0) <= 0:
        raise AppError("VALIDATION_ERROR", "Amount must be positive.", 400)
    return Response(add_khata_entry(store_id, body, request.user.as_actor()), status=201)


# ---------- STORE SETTINGS, STAFF, TICKETS, DELETION ----------


@api_view(["GET", "PATCH"])
@permission_classes([require_roles("smo", "staff")])
def owner_store_settings(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        store = get_store_by_id(store_id)
        base_url = _get_base_url(request)
        qr_data_url = generate_qr_data_url(f"{base_url}/store/{store['slug']}?utm_source=qr")
        plan_obj = Plan.objects.filter(id=store["planId"]).first()
        plan_data = (
            {
                "id": plan_obj.id,
                "name": plan_obj.name,
                "tagline": plan_obj.tagline,
                "max_products": plan_obj.max_products,
                "max_staff": plan_obj.max_staff,
                "max_monthly_orders": plan_obj.max_monthly_orders,
                "price_paise": plan_obj.price_paise,
                "billing_cycle": plan_obj.billing_cycle,
                "is_active": 1 if plan_obj.is_active else 0,
                "created_at": fmt_dt(plan_obj.created_at),
            }
            if plan_obj
            else None
        )
        products_count = Product.objects.filter(store_id=store["id"], archived_at__isnull=True).count()
        staff_count = StoreStaff.objects.filter(store_id=store["id"], is_active=True).count()
        return Response(
            {
                "store": store,
                "qrDataUrl": qr_data_url,
                "plan": plan_data,
                "usage": {"productsCount": products_count, "staffCount": staff_count},
            }
        )

    _assert_smo(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(update_store_settings(store_id, body, request.user.as_actor()))


@api_view(["PUT"])
@permission_classes([require_roles("smo")])
def owner_store_payment_methods(request):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    if not str(body.get("methodCode") or "").strip():
        raise AppError("VALIDATION_ERROR", "methodCode is required.", 400)
    return Response(update_store_payment_method(store_id, body, request.user.as_actor()))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo")])
def owner_staff(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_store_staff(store_id))
    body = request.data if isinstance(request.data, dict) else {}
    if (
        not str(body.get("name") or "").strip()
        or len(str(body.get("phone") or "")) < 10
        or len(str(body.get("password") or "")) < 4
        or body.get("staffRole") not in ("cashier", "packer", "manager")
    ):
        raise AppError("VALIDATION_ERROR", "Please fill in all staff details properly.", 400)
    return Response(create_store_staff(store_id, body, request.user.as_actor()), status=201)


@api_view(["PATCH"])
@permission_classes([require_roles("smo")])
def owner_staff_toggle(request, staff_id: str):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    return Response(toggle_store_staff(store_id, staff_id, bool(body.get("isActive")), request.user.as_actor()))


@api_view(["GET", "POST"])
@permission_classes([require_roles("smo")])
def owner_tickets(request):
    store_id = get_store_id_or_throw(request)
    if request.method == "GET":
        return Response(list_tickets(store_id))
    body = request.data if isinstance(request.data, dict) else {}
    fields: dict[str, str] = {}
    if len(str(body.get("subject") or "").strip()) < 3:
        fields["subject"] = "Enter a subject."
    if len(str(body.get("body") or "").strip()) < 3:
        fields["body"] = "Describe your issue."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)
    return Response(create_support_ticket(store_id, body, request.user.as_actor()), status=201)


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_ticket_reply(request, ticket_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    text = str(body.get("body") or "").strip()
    if not text:
        raise AppError("VALIDATION_ERROR", "Reply body is required.", 400)
    return Response(reply_to_ticket(ticket_id, {"body": text}, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("smo")])
def owner_account_delete_request(request):
    store_id = get_store_id_or_throw(request)
    body = request.data if isinstance(request.data, dict) else {}
    reason = str(body.get("reason") or "").strip()
    if len(reason) < 3:
        raise AppError("VALIDATION_ERROR", "Provide a reason.", 400, {"reason": "Provide a reason."})
    return Response(request_account_deletion(store_id, reason, request.user.as_actor()), status=201)
