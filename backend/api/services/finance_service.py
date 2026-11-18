import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from django.db.models import F, Max, Sum
from api.auth_utils import create_id, fmt_dt, now_utc
from api.models import (
    AdvisorAction,
    DailyClosing,
    Expense,
    KhataAccount,
    Order,
    OrderItem,
    Payment,
    Product,
    StockMovement,
    Supplier,
)
from api.services.config_service import write_audit_log
from api.services.inventory_service import list_products
from api.services.khata_service import list_khata_accounts


def _date_bounds(date_str: str) -> tuple[datetime, datetime]:
    d = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return d, d + timedelta(days=1)


def get_smo_home_snapshot(store_id: str) -> dict[str, Any]:
    now = now_utc()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    today_orders = Order.objects.filter(
        store_id=store_id, created_at__gte=today_start, created_at__lt=today_end
    ).only("channel", "status_code", "payment_status", "payment_method", "total_paise")

    today_sales_paise = 0
    today_order_count = 0
    cash_today_paise = 0
    upi_today_paise = 0

    for o in today_orders:
        if o.status_code == "completed" or (
            o.channel == "online" and o.status_code not in ("cancelled", "rejected")
        ):
            today_order_count += 1
            if o.status_code == "completed" or o.payment_status == "paid":
                today_sales_paise += o.total_paise
            if o.payment_method in ("cash", "pay_at_pickup"):
                cash_today_paise += o.total_paise
            elif o.payment_method == "upi" and o.payment_status == "paid":
                upi_today_paise += o.total_paise

    pending_online = Order.objects.filter(
        store_id=store_id,
        channel="online",
        status_code__in=["placed", "accepted", "packing", "ready", "out_for_delivery"],
    ).count()

    awaiting_verification = Payment.objects.filter(
        store_id=store_id, status="verification_pending"
    ).count()

    low_stock_count = (
        Product.objects.filter(store_id=store_id, archived_at__isnull=True)
        .annotate(avail=F("stock_qty") - F("reserved_qty"))
        .filter(avail__lte=F("reorder_level"))
        .count()
    )

    near_expiry_threshold = (now + timedelta(days=14)).strftime("%Y-%m-%d")
    near_expiry_count = Product.objects.filter(
        store_id=store_id,
        archived_at__isnull=True,
        expiry_date__isnull=False,
        expiry_date__lte=near_expiry_threshold,
    ).count()

    khata_dues_count = KhataAccount.objects.filter(store_id=store_id, balance_paise__gt=0).count()

    return {
        "todaySalesPaise": today_sales_paise,
        "todayOrderCount": today_order_count,
        "cashTodayPaise": cash_today_paise,
        "upiTodayPaise": upi_today_paise,
        "pendingOnline": pending_online,
        "awaitingVerification": awaiting_verification,
        "lowStockCount": low_stock_count,
        "nearExpiryCount": near_expiry_count,
        "khataDuesCount": khata_dues_count,
    }


def get_finance_summary_and_pnl(
    store_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> dict[str, Any]:
    now = now_utc()
    start = (from_date or (now - timedelta(days=30)).strftime("%Y-%m-%d"))[:10]
    end = (to_date or now.strftime("%Y-%m-%d"))[:10]

    start_dt, _ = _date_bounds(start)
    _, end_dt = _date_bounds(end)

    completed_orders = list(
        Order.objects.filter(
            store_id=store_id,
            status_code="completed",
            created_at__gte=start_dt,
            created_at__lt=end_dt,
        )
    )

    revenue_paise = 0
    cogs_paise = 0
    tax_collected_paise = 0
    tax_by_slab: dict[float, dict[str, Any]] = {}
    category_margins: dict[str, dict[str, Any]] = {}

    order_ids = [o.id for o in completed_orders]
    items_by_order: dict[str, list[OrderItem]] = {}
    if order_ids:
        for oi in (
            OrderItem.objects.select_related("product__category")
            .filter(order_id__in=order_ids)
            .exclude(availability_status="unavailable_approved")
        ):
            items_by_order.setdefault(oi.order_id, []).append(oi)

    for ord_obj in completed_orders:
        revenue_paise += ord_obj.total_paise
        tax_collected_paise += ord_obj.tax_paise

        for it in items_by_order.get(ord_obj.id, []):
            item_cost = round(it.cost_price_paise * it.qty)
            cogs_paise += item_cost
            item_tax = round((it.line_total_paise * it.tax_percent) / (100.0 + it.tax_percent)) if (100.0 + it.tax_percent) > 0 else 0

            slab = tax_by_slab.setdefault(
                it.tax_percent,
                {"ratePercent": it.tax_percent, "taxPaise": 0, "salesPaise": 0},
            )
            slab["taxPaise"] += item_tax
            slab["salesPaise"] += it.line_total_paise

            cat_name = (
                it.product.category.name
                if (it.product and it.product.category)
                else "Uncategorized"
            )
            cm = category_margins.setdefault(
                cat_name,
                {"category": cat_name, "revenuePaise": 0, "costPaise": 0},
            )
            cm["revenuePaise"] += it.line_total_paise
            cm["costPaise"] += item_cost

    expenses_paise = (
        Expense.objects.filter(
            store_id=store_id, expense_date__gte=start, expense_date__lte=end
        ).aggregate(total=Sum("amount_paise"))["total"]
        or 0
    )

    gross_profit_paise = revenue_paise - cogs_paise
    net_profit_paise = gross_profit_paise - expenses_paise

    khata_receivable_paise = (
        KhataAccount.objects.filter(store_id=store_id).aggregate(total=Sum("balance_paise"))["total"] or 0
    )
    supplier_payable_paise = (
        Supplier.objects.filter(store_id=store_id).aggregate(total=Sum("payable_paise"))["total"] or 0
    )

    return {
        "range": {"fromDate": start, "toDate": end},
        "orderCount": len(completed_orders),
        "revenuePaise": revenue_paise,
        "cogsPaise": cogs_paise,
        "grossProfitPaise": gross_profit_paise,
        "expensesPaise": expenses_paise,
        "netProfitPaise": net_profit_paise,
        "taxCollectedPaise": tax_collected_paise,
        "taxBySlab": sorted(tax_by_slab.values(), key=lambda x: x["ratePercent"]),
        "categoryMargins": [
            {
                **c,
                "marginPercent": round(((c["revenuePaise"] - c["costPaise"]) / c["revenuePaise"]) * 100)
                if c["revenuePaise"] > 0
                else 0,
            }
            for c in category_margins.values()
        ],
        "khataReceivablePaise": khata_receivable_paise,
        "supplierPayablePaise": supplier_payable_paise,
        "expectedCash30dPaise": max(0, khata_receivable_paise - supplier_payable_paise),
    }


def list_expenses(store_id: str) -> list[dict[str, Any]]:
    rows = Expense.objects.filter(store_id=store_id).order_by("-expense_date", "-created_at")
    return [
        {
            "id": r.id,
            "category": r.category,
            "title": r.title,
            "amountPaise": r.amount_paise,
            "expenseDate": r.expense_date,
            "isRecurring": 1 if r.is_recurring else 0,
            "notes": r.notes,
            "createdAt": fmt_dt(r.created_at),
        }
        for r in rows
    ]


def create_expense(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> list[dict[str, Any]]:
    eid = create_id()
    Expense.objects.create(
        id=eid,
        store_id=store_id,
        category=payload["category"].strip(),
        title=payload["title"].strip(),
        amount_paise=int(payload["amountPaise"]),
        expense_date=payload["expenseDate"],
        is_recurring=bool(payload.get("isRecurring")),
        notes=(payload.get("notes") or "").strip(),
        created_by=actor["id"],
        created_at=now_utc(),
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="expense.created",
        entity_type="expense",
        entity_id=eid,
        details={"title": payload["title"], "amountPaise": payload["amountPaise"]},
    )
    return list_expenses(store_id)


def delete_expense(store_id: str, expense_id: str, actor: dict[str, str]) -> list[dict[str, Any]]:
    Expense.objects.filter(id=expense_id, store_id=store_id).delete()
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="expense.deleted",
        entity_type="expense",
        entity_id=expense_id,
    )
    return list_expenses(store_id)


def get_daily_closing_preview(store_id: str, date_str: Optional[str] = None) -> dict[str, Any]:
    target_date = (date_str or now_utc().strftime("%Y-%m-%d"))[:10]
    start_dt, end_dt = _date_bounds(target_date)

    orders = Order.objects.filter(
        store_id=store_id,
        status_code="completed",
        created_at__gte=start_dt,
        created_at__lt=end_dt,
    ).only("payment_method", "payment_status", "total_paise")

    cash_sales = 0
    upi_verified = 0
    card_sales = 0
    khata_given = 0

    for o in orders:
        if o.payment_method in ("cash", "pay_at_pickup"):
            cash_sales += o.total_paise
        elif o.payment_method == "upi" and o.payment_status == "paid":
            upi_verified += o.total_paise
        elif o.payment_method == "card":
            card_sales += o.total_paise
        elif o.payment_method == "khata":
            khata_given += o.total_paise

    expenses_paise = (
        Expense.objects.filter(store_id=store_id, expense_date=target_date).aggregate(total=Sum("amount_paise"))["total"]
        or 0
    )

    history = DailyClosing.objects.filter(store_id=store_id).order_by("-closing_date", "-created_at")[:30]

    return {
        "closingDate": target_date,
        "cashSalesPaise": cash_sales,
        "upiVerifiedPaise": upi_verified,
        "cardSalesPaise": card_sales,
        "khataGivenPaise": khata_given,
        "expensesPaise": expenses_paise,
        "history": [
            {
                "id": h.id,
                "closingDate": h.closing_date,
                "openingCashPaise": h.opening_cash_paise,
                "cashSalesPaise": h.cash_sales_paise,
                "upiVerifiedPaise": h.upi_verified_paise,
                "cardSalesPaise": h.card_sales_paise,
                "khataGivenPaise": h.khata_given_paise,
                "expensesPaise": h.expenses_paise,
                "expectedCashPaise": h.expected_cash_paise,
                "actualCashPaise": h.actual_cash_paise,
                "differencePaise": h.difference_paise,
                "note": h.note,
                "createdAt": fmt_dt(h.created_at),
            }
            for h in history
        ],
    }


def submit_daily_closing(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    closing_date = payload["closingDate"]
    opening_cash = int(payload["openingCashPaise"])
    actual_cash = int(payload["actualCashPaise"])
    preview = get_daily_closing_preview(store_id, closing_date)
    expected_cash = opening_cash + preview["cashSalesPaise"] - preview["expensesPaise"]
    diff = actual_cash - expected_cash

    cid = create_id()
    DailyClosing.objects.create(
        id=cid,
        store_id=store_id,
        closing_date=closing_date,
        opening_cash_paise=opening_cash,
        cash_sales_paise=preview["cashSalesPaise"],
        upi_verified_paise=preview["upiVerifiedPaise"],
        card_sales_paise=preview["cardSalesPaise"],
        khata_given_paise=preview["khataGivenPaise"],
        expenses_paise=preview["expensesPaise"],
        expected_cash_paise=expected_cash,
        actual_cash_paise=actual_cash,
        difference_paise=diff,
        note=(payload.get("note") or "").strip(),
        closed_by=actor["id"],
        created_at=now_utc(),
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="finance.daily_closed",
        entity_type="daily_closing",
        entity_id=cid,
        details={"closingDate": closing_date, "differencePaise": diff},
    )
    return get_daily_closing_preview(store_id, closing_date)


def list_upi_reconciliation(store_id: str) -> list[dict[str, Any]]:
    rows = list(
        Payment.objects.select_related("order")
        .filter(store_id=store_id, method_code="upi")
        .order_by("-created_at")[:150]
    )
    ref_counts: dict[str, int] = {}
    for r in rows:
        if r.reference_no:
            k = r.reference_no.lower()
            ref_counts[k] = ref_counts.get(k, 0) + 1

    return [
        {
            "id": r.id,
            "orderId": r.order_id,
            "orderNumber": r.order.order_number,
            "customerName": r.order.customer_name,
            "amountPaise": r.amount_paise,
            "status": r.status,
            "referenceNo": r.reference_no,
            "submittedAt": fmt_dt(r.submitted_at),
            "verifiedAt": fmt_dt(r.verified_at),
            "rejectReason": r.reject_reason,
            "isDuplicate": (ref_counts.get(r.reference_no.lower(), 0) > 1) if r.reference_no else False,
        }
        for r in rows
    ]


def get_predictions(store_id: str) -> list[dict[str, Any]]:
    products = list_products(store_id, include_archived=False)
    khata_accounts = list_khata_accounts(store_id)
    now = now_utc()
    cutoff_30 = now - timedelta(days=30)

    sales30 = (
        OrderItem.objects.filter(
            order__store_id=store_id,
            order__status_code="completed",
            order__created_at__gte=cutoff_30,
        )
        .values("product_id")
        .annotate(qty_sold=Sum("qty"), last_sold_at=Max("order__created_at"))
    )
    velocity_map = {s["product_id"]: s for s in sales30}

    predictions: list[dict[str, Any]] = []

    for p in products:
        vel = velocity_map.get(p["id"])
        qty_sold = float(vel["qty_sold"] or 0) if vel else 0.0
        avg_daily = qty_sold / 30.0

        # 1. Expiry risk
        if p.get("expiryDate") and p["availableQty"] > 0:
            try:
                exp_dt = datetime.strptime(str(p["expiryDate"])[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                days_left = math.ceil((exp_dt - now).total_seconds() / 86400.0)
                if days_left <= 14:
                    expected_clear = avg_daily * max(0, days_left)
                    at_risk_qty = max(0.0, p["availableQty"] - expected_clear)
                    if at_risk_qty > 0 or days_left <= 7:
                        predictions.append(
                            {
                                "id": f"exp-{p['id']}",
                                "category": "expiry_risk",
                                "severity": "high" if days_left <= 5 else "medium",
                                "title": f"{p['name']} expires in {max(0, days_left)} day(s)",
                                "reasoning": f"{p['availableQty']} {p.get('unitLabel', '')} on hand; recent pace is {avg_daily:.1f}/day.",
                                "estimatedImpactPaise": round(at_risk_qty * p["costPricePaise"]),
                                "productId": p["id"],
                            }
                        )
            except Exception:
                pass

        # 2. Dead stock
        if p["availableQty"] > 0 and qty_sold == 0:
            predictions.append(
                {
                    "id": f"dead-{p['id']}",
                    "category": "dead_stock",
                    "severity": "low",
                    "title": f"No recent sales for {p['name']}",
                    "reasoning": f"{p['availableQty']} {p.get('unitLabel', '')} sitting unsold over the last 30 days.",
                    "estimatedImpactPaise": round(p["availableQty"] * p["costPricePaise"]),
                    "productId": p["id"],
                }
            )

        # 3. Stock-out risk
        if avg_daily > 0:
            days_of_cover = p["availableQty"] / avg_daily
            if days_of_cover <= 5:
                predictions.append(
                    {
                        "id": f"stk-{p['id']}",
                        "category": "stockout_risk",
                        "severity": "high" if days_of_cover <= 2 else "medium",
                        "title": f"{p['name']} covers {days_of_cover:.1f} day(s)",
                        "reasoning": f"Selling {avg_daily:.1f}/day; suggested reorder: {math.ceil(avg_daily * 14)} {p.get('unitLabel', '')}.",
                        "estimatedImpactPaise": round(avg_daily * 7 * (p["sellingPricePaise"] - p["costPricePaise"])),
                        "productId": p["id"],
                    }
                )

        # 4. Margin leakage
        effective = p["effectivePricePaise"] if p.get("effectivePricePaise") is not None else p["sellingPricePaise"]
        if effective <= p["costPricePaise"] and p["costPricePaise"] > 0:
            predictions.append(
                {
                    "id": f"mgn-{p['id']}",
                    "category": "margin_leakage",
                    "severity": "high",
                    "title": f"{p['name']} is priced at or below cost",
                    "reasoning": "Effective selling price does not exceed purchase cost.",
                    "estimatedImpactPaise": max(
                        0, (p["costPricePaise"] - effective) * max(1, round(p["availableQty"]))
                    ),
                    "productId": p["id"],
                }
            )

    # 5. Shrinkage anomaly
    shrink_rows = (
        StockMovement.objects.filter(
            store_id=store_id,
            movement_type__in=["stock_take", "adjustment"],
            qty_delta__lt=0,
        )
        .values("product_id", "product__name", "product__cost_price_paise")
        .annotate(net_delta=Sum("qty_delta"))
    )
    for sr in shrink_rows:
        net_delta = abs(float(sr["net_delta"] or 0))
        predictions.append(
            {
                "id": f"shr-{sr['product__name']}",
                "category": "shrinkage",
                "severity": "medium",
                "title": f"Stock shrinkage on {sr['product__name']}",
                "reasoning": f"Counted/adjusted loss of {net_delta} units recorded.",
                "estimatedImpactPaise": round(net_delta * int(sr["product__cost_price_paise"] or 0)),
            }
        )

    # 6. Khata risk
    for ka in khata_accounts:
        if ka["balancePaise"] > ka["creditLimitPaise"] * 0.85 and ka["balancePaise"] > 0:
            predictions.append(
                {
                    "id": f"kht-{ka['id']}",
                    "category": "khata_risk",
                    "severity": "high" if ka["overdueDays"] > 30 else "medium",
                    "title": f"High Khata balance: {ka['customerName']}",
                    "reasoning": f"Balance is near or above credit limit ({ka['overdueDays']} days since last activity).",
                    "estimatedImpactPaise": ka["balancePaise"],
                }
            )

    return predictions


def get_profit_advisor(store_id: str) -> dict[str, Any]:
    pnl = get_finance_summary_and_pnl(store_id)
    predictions = get_predictions(store_id)
    products = list_products(store_id, include_archived=False)

    state_map = {
        a.action_key: a.status for a in AdvisorAction.objects.filter(store_id=store_id)
    }

    score = 80
    margin_pct = (pnl["grossProfitPaise"] / pnl["revenuePaise"]) * 100.0 if pnl["revenuePaise"] > 0 else 20.0
    if margin_pct < 10:
        score -= 20
    elif margin_pct > 22:
        score += 10

    expense_ratio = (pnl["expensesPaise"] / pnl["revenuePaise"]) if pnl["revenuePaise"] > 0 else 0.0
    if expense_ratio > 0.25:
        score -= 15

    high_risks = sum(1 for p in predictions if p["severity"] == "high")
    score -= min(25, high_risks * 8)

    if len(products) == 0:
        score = 75
    score = max(0, min(100, round(score)))

    mistakes: list[str] = []
    margin_leak = [p for p in predictions if p["category"] == "margin_leakage"]
    if margin_leak:
        mistakes.append(f"{len(margin_leak)} product(s) are priced at or below cost price.")
    if expense_ratio > 0.25 and pnl["revenuePaise"] > 0:
        mistakes.append(f"Store expenses are {round(expense_ratio * 100)}% of revenue over the last 30 days.")
    dead_count = sum(1 for p in predictions if p["category"] == "dead_stock")
    if dead_count > 0:
        mistakes.append(f"{dead_count} item(s) have had zero sales in 30 days, tying up working capital.")

    actions = []
    for pred in predictions[:8]:
        key = pred["id"]
        action_type = "review_price"
        cta_label = "Review item"
        if pred["category"] in ("expiry_risk", "dead_stock"):
            action_type = "create_offer"
            cta_label = "Create clearance offer"
        elif pred["category"] == "stockout_risk":
            action_type = "reorder"
            cta_label = "Restock item"
        elif pred["category"] == "khata_risk":
            action_type = "collect_khata"
            cta_label = "View Khata dues"

        actions.append(
            {
                "actionKey": key,
                "title": pred["title"],
                "reasoning": pred["reasoning"],
                "estimatedImpactPaise": pred["estimatedImpactPaise"],
                "actionType": action_type,
                "ctaLabel": cta_label,
                "productId": pred.get("productId"),
                "status": state_map.get(key, "open"),
            }
        )

    return {
        "healthScore": score,
        "marginPercent": round(margin_pct),
        "mistakes": mistakes,
        "actions": actions,
    }


def set_advisor_action_status(store_id: str, action_key: str, status: str) -> dict[str, Any]:
    AdvisorAction.objects.update_or_create(
        store_id=store_id,
        action_key=action_key,
        defaults={"id": create_id(), "status": status, "updated_at": now_utc()},
    )
    return get_profit_advisor(store_id)
