from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from api.auth_utils import create_id, now_utc, require_roles
from api.errors import AppError
from api.models import CustomerAddress, Favourite
from api.services.khata_service import get_customer_khata_statement
from api.services.order_service import (
    add_order_message,
    cancel_order_by_customer,
    create_online_order,
    hydrate_order,
    list_customer_orders,
    quote_customer_cart,
    rate_order,
    respond_unavailable_item,
    switch_order_payment_to_cash,
)
from api.services.payment_service import create_payment_intent, submit_payment_reference


@api_view(["POST"])
def customer_checkout_quote(request):
    body = request.data if isinstance(request.data, dict) else {}
    store_id = str(body.get("storeId") or "").strip()
    fulfilment = body.get("fulfilment")
    items = body.get("items")
    if not store_id or fulfilment not in ("pickup", "delivery") or not isinstance(items, list):
        raise AppError("VALIDATION_ERROR", "Invalid checkout quote request.", 400)
    return Response(quote_customer_cart(store_id, body))


@api_view(["GET", "POST"])
@permission_classes([require_roles("customer")])
def customer_orders(request):
    if request.method == "GET":
        store_id = request.query_params.get("storeId")
        return Response(list_customer_orders(request.user.id, store_id))

    body = request.data if isinstance(request.data, dict) else {}
    store_id = str(body.get("storeId") or "").strip()
    if not store_id or body.get("fulfilment") not in ("pickup", "delivery"):
        raise AppError("VALIDATION_ERROR", "Invalid order payload.", 400)
    if body.get("paymentMethod") not in ("upi", "pay_at_pickup", "cash", "khata"):
        raise AppError("VALIDATION_ERROR", "Invalid payment method.", 400)

    idem_key = request.META.get("HTTP_IDEMPOTENCY_KEY")
    payload = dict(body)
    if idem_key:
        payload["idempotencyKey"] = idem_key

    order = create_online_order(
        store_id,
        {"id": request.user.id, "name": request.user.name, "phone": request.user.phone},
        payload,
    )
    return Response(order, status=201)


@api_view(["GET"])
@permission_classes([require_roles("customer")])
def customer_order_detail(request, order_id: str):
    ord_data = hydrate_order(order_id)
    if ord_data["customerId"] != request.user.id:
        raise AppError("FORBIDDEN", "Order access denied.", 403)
    return Response(ord_data)


@api_view(["GET"])
@permission_classes([require_roles("customer")])
def customer_order_upi_intent(request, order_id: str):
    ord_data = hydrate_order(order_id)
    if ord_data["customerId"] != request.user.id:
        raise AppError("FORBIDDEN", "Order access denied.", 403)
    intent = create_payment_intent(ord_data["storeId"], ord_data["id"], ord_data["totalPaise"])
    return Response(intent)


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_order_payment_reference(request, order_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    result = submit_payment_reference(
        order_id=order_id,
        customer_id=request.user.id,
        reference_no=str(body.get("referenceNo") or ""),
        proof_url=body.get("proofUrl"),
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_order_switch_cash(request, order_id: str):
    return Response(switch_order_payment_to_cash(order_id, request.user.id))


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_order_cancel(request, order_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    reason = str(body.get("reason") or "")
    return Response(
        cancel_order_by_customer(order_id, {"id": request.user.id, "name": request.user.name}, reason)
    )


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_order_unavailable_response(request, order_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    decision = body.get("decision")
    if decision not in ("approve", "cancel"):
        raise AppError("VALIDATION_ERROR", "Decision must be approve or cancel.", 400)
    return Response(
        respond_unavailable_item(order_id, {"id": request.user.id, "name": request.user.name}, decision)
    )


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_order_messages(request, order_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    text = str(body.get("body") or "")
    return Response(add_order_message(order_id, {"role": "customer", "name": request.user.name}, text))


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_order_rating(request, order_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    try:
        rating = int(body.get("rating", 0))
    except Exception:
        rating = 0
    if rating < 1 or rating > 5:
        raise AppError("VALIDATION_ERROR", "Rating must be between 1 and 5.", 400)
    feedback = str(body.get("feedback") or "")
    return Response(rate_order(order_id, request.user.id, rating, feedback))


def _serialize_addresses(customer_id: str) -> list[dict]:
    rows = CustomerAddress.objects.filter(customer_id=customer_id).order_by("-created_at")
    return [
        {
            "id": r.id,
            "label": r.label,
            "addressLine": r.address_line,
            "landmark": r.landmark,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "isDefault": 1 if r.is_default else 0,
        }
        for r in rows
    ]


@api_view(["GET", "POST"])
@permission_classes([require_roles("customer")])
def customer_addresses(request):
    if request.method == "GET":
        return Response(_serialize_addresses(request.user.id))

    body = request.data if isinstance(request.data, dict) else {}
    label = str(body.get("label") or "").strip()
    address_line = str(body.get("addressLine") or "").strip()
    fields: dict[str, str] = {}
    if not label:
        fields["label"] = "Label is required."
    if len(address_line) < 4:
        fields["addressLine"] = "Address is required."
    if fields:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, fields)

    CustomerAddress.objects.create(
        id=create_id(),
        customer_id=request.user.id,
        label=label,
        address_line=address_line,
        landmark=str(body.get("landmark") or "").strip(),
        latitude=body.get("latitude"),
        longitude=body.get("longitude"),
        is_default=False,
        created_at=now_utc(),
    )
    return Response(_serialize_addresses(request.user.id), status=201)


@api_view(["DELETE"])
@permission_classes([require_roles("customer")])
def customer_address_delete(request, address_id: str):
    CustomerAddress.objects.filter(id=address_id, customer_id=request.user.id).delete()
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([require_roles("customer")])
def customer_favourites(request):
    store_id = str(request.query_params.get("storeId") or "")
    ids = list(
        Favourite.objects.filter(customer_id=request.user.id, store_id=store_id).values_list("product_id", flat=True)
    )
    return Response(ids)


@api_view(["POST"])
@permission_classes([require_roles("customer")])
def customer_favourites_toggle(request):
    body = request.data if isinstance(request.data, dict) else {}
    store_id = str(body.get("storeId") or "")
    product_id = str(body.get("productId") or "")
    if not store_id or not product_id:
        raise AppError("VALIDATION_ERROR", "storeId and productId are required.", 400)

    existing = Favourite.objects.filter(customer_id=request.user.id, store_id=store_id, product_id=product_id)
    if existing.exists():
        existing.delete()
    else:
        Favourite.objects.create(customer_id=request.user.id, store_id=store_id, product_id=product_id)

    ids = list(
        Favourite.objects.filter(customer_id=request.user.id, store_id=store_id).values_list("product_id", flat=True)
    )
    return Response(ids)


@api_view(["GET"])
@permission_classes([require_roles("customer")])
def customer_khata(request, store_id: str):
    return Response(get_customer_khata_statement(store_id, request.user.id))


@api_view(["DELETE"])
@permission_classes([require_roles("customer")])
def customer_delete_my_data(request):
    CustomerAddress.objects.filter(customer_id=request.user.id).delete()
    Favourite.objects.filter(customer_id=request.user.id).delete()
    return Response({"ok": True})
