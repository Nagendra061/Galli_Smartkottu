from datetime import timedelta
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from api.auth_utils import create_id, fmt_dt, hash_secret, now_utc, require_roles
from api.errors import AppError
from api.models import (
    AuditLog,
    AutomationJob,
    FeatureFlag,
    MasterProduct,
    Order,
    Plan,
    QrScan,
    Store,
    SupportTicket,
    User,
)
from api.realtime import realtime_hub
from api.services.config_service import (
    delete_faq,
    get_bootstrap_config,
    update_app_settings,
    update_order_status_label,
    upsert_faq,
    write_audit_log,
)
from api.services.finance_service import get_smo_home_snapshot
from api.services.inventory_service import list_master_products, list_products
from api.services.order_service import list_store_orders
from api.services.store_service import (
    create_store_by_admin,
    get_store_by_id,
    list_all_stores_admin,
    regenerate_store_qr_admin,
    set_store_status_admin,
)
from api.services.support_service import (
    list_automation_jobs,
    list_deletion_requests_admin,
    list_tickets,
    process_deletion_request_admin,
    reply_to_ticket,
    run_automation_job,
)


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_dashboard(request):
    now = now_utc()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    stores = list_all_stores_admin()
    today_agg = Order.objects.filter(created_at__gte=today_start, created_at__lt=today_end).aggregate(
        cnt=Count("id"), gmv=Sum("total_paise")
    )
    total_scans = QrScan.objects.count()
    open_tickets = SupportTicket.objects.filter(status__in=["open", "in_progress"]).count()

    return Response(
        {
            "totalStores": len(stores),
            "activeStores": sum(1 for s in stores if s["status"] == "active"),
            "ordersToday": today_agg["cnt"] or 0,
            "gmvTodayPaise": today_agg["gmv"] or 0,
            "totalQrScans": total_scans,
            "openTickets": open_tickets,
            "topStores": stores[:5],
            "systemHealth": {"api": "healthy", "database": "healthy", "automation": "healthy"},
        }
    )


@api_view(["GET", "POST"])
@permission_classes([require_roles("super_admin")])
def admin_stores(request):
    if request.method == "GET":
        return Response(list_all_stores_admin())

    body = request.data if isinstance(request.data, dict) else {}
    required = ["ownerName", "ownerEmail", "ownerPhone", "ownerPassword", "storeName", "slug", "address", "planId"]
    missing = {k: f"{k} is required." for k in required if not str(body.get(k) or "").strip()}
    if missing:
        raise AppError("VALIDATION_ERROR", "Please fix the highlighted fields.", 400, missing)
    return Response(create_store_by_admin(body, request.user.as_actor()), status=201)


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_store_status(request, store_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    if body.get("status") not in ("active", "suspended"):
        raise AppError("VALIDATION_ERROR", "Status must be active or suspended.", 400)
    return Response(set_store_status_admin(store_id, body, request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_store_regenerate_qr(request, store_id: str):
    return Response(regenerate_store_qr_admin(store_id, request.user.as_actor()))


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_store_impersonate(request, store_id: str):
    store = get_store_by_id(store_id)
    snapshot = get_smo_home_snapshot(store["id"])
    products = list_products(store["id"], include_archived=False)
    orders = list_store_orders(store["id"])
    write_audit_log(
        store_id=store["id"],
        actor_id=request.user.id,
        actor_role=request.user.role,
        actor_name=request.user.name,
        action="admin.impersonate_readonly",
        entity_type="store",
        entity_id=store["id"],
    )
    return Response(
        {
            "store": store,
            "snapshot": snapshot,
            "productsCount": len(products),
            "recentOrders": orders[:10],
        }
    )


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_store_plan(request, store_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    plan_id = str(body.get("planId") or "").strip()
    if not plan_id:
        raise AppError("VALIDATION_ERROR", "planId is required.", 400)
    Store.objects.filter(id=store_id).update(plan_id=plan_id, updated_at=now_utc())
    write_audit_log(
        store_id=store_id,
        actor_id=request.user.id,
        actor_role=request.user.role,
        actor_name=request.user.name,
        action="admin.store_plan_changed",
        entity_type="store",
        entity_id=store_id,
        details={"planId": plan_id},
    )
    return Response(get_store_by_id(store_id))


@api_view(["GET", "POST"])
@permission_classes([require_roles("super_admin")])
def admin_plans(request):
    if request.method == "GET":
        rows = Plan.objects.order_by("price_paise")
        return Response(
            [
                {
                    "id": p.id,
                    "name": p.name,
                    "tagline": p.tagline,
                    "maxProducts": p.max_products,
                    "maxStaff": p.max_staff,
                    "maxMonthlyOrders": p.max_monthly_orders,
                    "pricePaise": p.price_paise,
                    "billingCycle": p.billing_cycle,
                    "isActive": 1 if p.is_active else 0,
                }
                for p in rows
            ]
        )

    body = request.data if isinstance(request.data, dict) else {}
    if not str(body.get("name") or "").strip() or body.get("billingCycle") not in ("monthly", "yearly"):
        raise AppError("VALIDATION_ERROR", "Invalid plan details.", 400)
    pid = create_id()
    Plan.objects.create(
        id=pid,
        name=body["name"].strip(),
        tagline=str(body.get("tagline") or "").strip(),
        max_products=int(body["maxProducts"]),
        max_staff=int(body["maxStaff"]),
        max_monthly_orders=int(body["maxMonthlyOrders"]),
        price_paise=int(body["pricePaise"]),
        billing_cycle=body["billingCycle"],
        is_active=True,
        created_at=now_utc(),
    )
    write_audit_log(
        actor_id=request.user.id,
        actor_role=request.user.role,
        actor_name=request.user.name,
        action="admin.plan_created",
        entity_type="plan",
        entity_id=pid,
    )
    return Response({"id": pid, **body, "isActive": 1}, status=201)


@api_view(["GET", "POST"])
@permission_classes([require_roles("super_admin")])
def admin_master_catalogue(request):
    if request.method == "GET":
        return Response(list_master_products())

    body = request.data if isinstance(request.data, dict) else {}
    for k in ("name", "categoryName", "brandName", "unitCode"):
        if not str(body.get(k) or "").strip():
            raise AppError("VALIDATION_ERROR", f"{k} is required.", 400)
    MasterProduct.objects.create(
        id=create_id(),
        name=body["name"].strip(),
        category_name=body["categoryName"].strip(),
        brand_name=body["brandName"].strip(),
        unit_code=body["unitCode"].strip(),
        tax_rate_percent=float(body.get("taxRatePercent") or 0),
        barcode=(body.get("barcode") or "").strip() or None,
        mrp_paise=int(body.get("mrpPaise") or 0),
        created_at=now_utc(),
    )
    return Response(list_master_products(), status=201)


@api_view(["PATCH"])
@permission_classes([require_roles("super_admin")])
def admin_config_app_settings(request):
    body = request.data if isinstance(request.data, dict) else {}
    return Response(update_app_settings(body, request.user.as_actor()))


@api_view(["PATCH"])
@permission_classes([require_roles("super_admin")])
def admin_config_order_status(request, code: str):
    body = request.data if isinstance(request.data, dict) else {}
    label = str(body.get("label") or "").strip()
    if not label:
        raise AppError("VALIDATION_ERROR", "Label is required.", 400)
    return Response(update_order_status_label(code, label, body.get("tone"), request.user.as_actor()))


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_config_faqs(request):
    body = request.data if isinstance(request.data, dict) else {}
    if len(str(body.get("question") or "").strip()) < 3 or len(str(body.get("answer") or "").strip()) < 3:
        raise AppError("VALIDATION_ERROR", "Question and answer are required.", 400)
    return Response(upsert_faq(body, request.user.as_actor()))


@api_view(["DELETE"])
@permission_classes([require_roles("super_admin")])
def admin_config_faq_delete(request, faq_id: str):
    return Response(delete_faq(faq_id, request.user.as_actor()))


@api_view(["PATCH"])
@permission_classes([require_roles("super_admin")])
def admin_config_feature_flag(request, key: str):
    body = request.data if isinstance(request.data, dict) else {}
    enabled = bool(body.get("enabled"))
    FeatureFlag.objects.filter(key=key).update(enabled=enabled, updated_at=now_utc())
    realtime_hub.emit("config.updated")
    return Response(get_bootstrap_config())


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_tickets(request):
    return Response(list_tickets(None))


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_ticket_reply(request, ticket_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    return Response(reply_to_ticket(ticket_id, body, request.user.as_actor()))


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_analytics(request):
    by_day_qs = (
        Order.objects.exclude(status_code__in=["cancelled", "rejected"])
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(orders=Count("id"), gmvPaise=Sum("total_paise"))
        .order_by("-day")[:14]
    )
    by_day = [
        {
            "day": row["day"].strftime("%Y-%m-%d") if row["day"] else "",
            "orders": row["orders"],
            "gmvPaise": row["gmvPaise"] or 0,
        }
        for row in by_day_qs
    ]
    scans = QrScan.objects.count()
    online_orders = Order.objects.filter(channel="online").count()
    return Response({"byDay": by_day, "qrScans": scans, "onlineOrders": online_orders})


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_audit_logs(request):
    rows = AuditLog.objects.order_by("-created_at")[:200]
    return Response(
        [
            {
                "id": r.id,
                "storeId": r.store_id,
                "actorRole": r.actor_role,
                "actorName": r.actor_name,
                "action": r.action,
                "entityType": r.entity_type,
                "entityId": r.entity_id,
                "detailsJson": r.details_json,
                "createdAt": fmt_dt(r.created_at),
            }
            for r in rows
        ]
    )


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_deletions(request):
    return Response(list_deletion_requests_admin())


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_deletion_process(request, request_id: str):
    body = request.data if isinstance(request.data, dict) else {}
    action = body.get("action")
    if action not in ("restore", "finalise"):
        raise AppError("VALIDATION_ERROR", "Action must be restore or finalise.", 400)
    return Response(process_deletion_request_admin(request_id, action, request.user.as_actor()))


@api_view(["GET"])
@permission_classes([require_roles("super_admin")])
def admin_automations(request):
    return Response(list_automation_jobs())


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_automation_run(request, key: str):
    return Response(run_automation_job(key))


@api_view(["POST"])
@permission_classes([require_roles("super_admin")])
def admin_automation_toggle(request, key: str):
    body = request.data if isinstance(request.data, dict) else {}
    AutomationJob.objects.filter(key=key).update(enabled=bool(body.get("enabled")))
    return Response(list_automation_jobs())


def _serialize_admin_users() -> list[dict]:
    rows = User.objects.filter(role="super_admin").order_by("-created_at")
    return [
        {
            "id": u.id,
            "role": u.role,
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "isActive": 1 if u.is_active else 0,
            "lastLoginAt": fmt_dt(u.last_login_at),
            "createdAt": fmt_dt(u.created_at),
        }
        for u in rows
    ]


@api_view(["GET", "POST"])
@permission_classes([require_roles("super_admin")])
def admin_users(request):
    if request.method == "GET":
        return Response(_serialize_admin_users())

    body = request.data if isinstance(request.data, dict) else {}
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not name or "@" not in email or len(password) < 6:
        raise AppError("VALIDATION_ERROR", "Valid name, email, and password (6+ chars) are required.", 400)
    if User.objects.filter(email__iexact=email).exists():
        raise AppError("DUPLICATE_USER", "An account with this email already exists.", 409)

    now = now_utc()
    User.objects.create(
        id=create_id(),
        role="super_admin",
        name=name,
        email=email,
        password_hash=hash_secret(password),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    return Response(_serialize_admin_users(), status=201)
