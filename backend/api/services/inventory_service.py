import math
import secrets
from datetime import timedelta
from typing import Any, Optional
from django.db import transaction
from django.db.models import Case, F, FloatField, Max, Q, Sum, Value, When
from api.auth_utils import create_id, fmt_dt, now_utc
from api.errors import AppError
from api.models import (
    Brand,
    Category,
    MasterProduct,
    Offer,
    OfferProduct,
    OrderItem,
    PriceHistory,
    Product,
    PurchaseOrder,
    StockMovement,
    Store,
    Supplier,
    TaxRate,
    Unit,
    User,
)
from api.realtime import realtime_hub
from api.services.config_service import write_audit_log
from api.services.notification_service import notify_store_team


def _emit_catalog_update(store_id: str) -> None:
    store = Store.objects.filter(id=store_id).only("slug").first()
    realtime_hub.emit("catalog.updated", store_id=store_id, store_slug=store.slug if store else None)


def _compute_ean13_check_digit(twelve_digits: str) -> str:
    total = 0
    for i, ch in enumerate(twelve_digits[:12]):
        d = int(ch)
        total += d if i % 2 == 0 else d * 3
    mod = total % 10
    return str(0 if mod == 0 else 10 - mod)


def _generate_unique_barcode(store_id: str) -> str:
    acc = 100
    for ch in store_id:
        acc = (acc * 31 + ord(ch)) % 1000
    store_numeric = str(acc).zfill(3)

    for _ in range(25):
        rand6 = str(100000 + (secrets.randbits(32) % 900000))
        base12 = f"890{store_numeric}{rand6}"
        candidate = f"{base12}{_compute_ean13_check_digit(base12)}"
        if not Product.objects.filter(store_id=store_id, barcode=candidate).exists():
            return candidate
    return f"890{int(now_utc().timestamp() * 1000)}"[:13]


def _generate_batch_no(store_id: str) -> str:
    date_part = now_utc().strftime("%Y%m%d")
    for _ in range(15):
        suffix = secrets.token_hex(2).upper()
        candidate = f"B-{date_part}-{suffix}"
        if not Product.objects.filter(store_id=store_id, batch_no=candidate).exists():
            return candidate
    return f"B-{date_part}-{int(now_utc().timestamp()) % 10000:04d}"


def _upsert_store_category_by_name(store_id: str, name: str) -> str:
    clean = name.strip()
    existing = Category.objects.filter(store_id=store_id, name__iexact=clean, archived_at__isnull=True).first()
    if existing:
        return existing.id
    cid = create_id()
    Category.objects.create(id=cid, store_id=store_id, name=clean, parent_id=None, created_at=now_utc())
    return cid


def _upsert_store_brand_by_name(store_id: str, name: str) -> str:
    clean = name.strip()
    existing = Brand.objects.filter(store_id=store_id, name__iexact=clean, archived_at__isnull=True).first()
    if existing:
        return existing.id
    bid = create_id()
    Brand.objects.create(id=bid, store_id=store_id, name=clean, created_at=now_utc())
    return bid


def list_categories(store_id: Optional[str], include_archived: bool = False) -> list[dict[str, Any]]:
    qs = Category.objects.filter(store_id=store_id) if store_id else Category.objects.filter(store__isnull=True)
    if not include_archived:
        qs = qs.filter(archived_at__isnull=True)
    rows = qs.order_by("name")
    return [
        {
            "id": r.id,
            "storeId": r.store_id,
            "name": r.name,
            "parentId": r.parent_id,
            "archivedAt": fmt_dt(r.archived_at),
        }
        for r in rows
    ]


def create_category(
    store_id: Optional[str],
    name: str,
    parent_id: Optional[str],
    actor: dict[str, str],
) -> dict[str, Any]:
    clean_name = name.strip()
    if not clean_name:
        raise AppError("VALIDATION_ERROR", "Category name is required.", 400, {"name": "Enter a category name."})

    qs = Category.objects.filter(store_id=store_id) if store_id else Category.objects.filter(store__isnull=True)
    existing = qs.filter(name__iexact=clean_name, archived_at__isnull=True).first()
    if existing:
        return {
            "id": existing.id,
            "storeId": existing.store_id,
            "name": existing.name,
            "parentId": existing.parent_id,
            "archivedAt": fmt_dt(existing.archived_at),
        }

    cid = create_id()
    Category.objects.create(
        id=cid,
        store_id=store_id,
        name=clean_name,
        parent_id=parent_id,
        created_at=now_utc(),
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="category.created",
        entity_type="category",
        entity_id=cid,
        details={"name": clean_name},
    )
    if store_id:
        _emit_catalog_update(store_id)
    return {"id": cid, "storeId": store_id, "name": clean_name, "parentId": parent_id, "archivedAt": None}


def update_category(store_id: str, category_id: str, name: str, actor: dict[str, str]) -> dict[str, Any]:
    clean_name = name.strip()
    if not clean_name:
        raise AppError("VALIDATION_ERROR", "Category name is required.", 400, {"name": "Enter a category name."})

    existing = Category.objects.filter(id=category_id, store_id=store_id).first()
    if not existing:
        raise AppError("NOT_FOUND", "Category not found in this store.", 404)

    duplicate = (
        Category.objects.filter(store_id=store_id, name__iexact=clean_name, archived_at__isnull=True)
        .exclude(id=category_id)
        .exists()
    )
    if duplicate:
        raise AppError("CONFLICT", f'Category "{clean_name}" already exists in this store.', 409)

    old_name = existing.name
    existing.name = clean_name
    existing.save(update_fields=["name"])

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="category.updated",
        entity_type="category",
        entity_id=category_id,
        details={"oldName": old_name, "newName": clean_name},
    )
    _emit_catalog_update(store_id)
    return {
        "id": existing.id,
        "storeId": existing.store_id,
        "name": clean_name,
        "parentId": existing.parent_id,
        "archivedAt": fmt_dt(existing.archived_at),
    }


def list_brands(store_id: Optional[str]) -> list[dict[str, Any]]:
    qs = Brand.objects.filter(store_id=store_id) if store_id else Brand.objects.filter(store__isnull=True)
    rows = qs.filter(archived_at__isnull=True).order_by("name")
    return [
        {
            "id": r.id,
            "storeId": r.store_id,
            "name": r.name,
            "archivedAt": fmt_dt(r.archived_at),
        }
        for r in rows
    ]


def create_brand(store_id: Optional[str], name: str, actor: dict[str, str]) -> dict[str, Any]:
    clean = name.strip()
    if not clean:
        raise AppError("VALIDATION_ERROR", "Brand name is required.", 400, {"name": "Enter a brand name."})

    qs = Brand.objects.filter(store_id=store_id) if store_id else Brand.objects.filter(store__isnull=True)
    existing = qs.filter(name__iexact=clean, archived_at__isnull=True).first()
    if existing:
        return {
            "id": existing.id,
            "storeId": existing.store_id,
            "name": existing.name,
            "archivedAt": fmt_dt(existing.archived_at),
        }

    bid = create_id()
    Brand.objects.create(id=bid, store_id=store_id, name=clean, created_at=now_utc())
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="brand.created",
        entity_type="brand",
        entity_id=bid,
        details={"name": clean},
    )
    if store_id:
        _emit_catalog_update(store_id)
    return {"id": bid, "storeId": store_id, "name": clean, "archivedAt": None}


def update_brand(store_id: str, brand_id: str, name: str, actor: dict[str, str]) -> dict[str, Any]:
    clean = name.strip()
    if not clean:
        raise AppError("VALIDATION_ERROR", "Brand name is required.", 400, {"name": "Enter a brand name."})

    existing = Brand.objects.filter(id=brand_id, store_id=store_id).first()
    if not existing:
        raise AppError("NOT_FOUND", "Brand not found in this store.", 404)

    duplicate = (
        Brand.objects.filter(store_id=store_id, name__iexact=clean, archived_at__isnull=True)
        .exclude(id=brand_id)
        .exists()
    )
    if duplicate:
        raise AppError("CONFLICT", f'Brand "{clean}" already exists in this store.', 409)

    old_name = existing.name
    existing.name = clean
    existing.save(update_fields=["name"])

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="brand.updated",
        entity_type="brand",
        entity_id=brand_id,
        details={"oldName": old_name, "newName": clean},
    )
    _emit_catalog_update(store_id)
    return {
        "id": existing.id,
        "storeId": existing.store_id,
        "name": clean,
        "archivedAt": fmt_dt(existing.archived_at),
    }


def list_offers(store_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    qs = Offer.objects.filter(store_id=store_id)
    if active_only:
        qs = qs.filter(is_active=True)
    rows = qs.prefetch_related("offer_products").order_by("-created_at")
    return [
        {
            "id": r.id,
            "storeId": r.store_id,
            "title": r.title,
            "offerType": r.offer_type,
            "discountValue": r.discount_value,
            "minQty": r.min_qty,
            "startsAt": fmt_dt(r.starts_at),
            "endsAt": fmt_dt(r.ends_at),
            "isActive": bool(r.is_active),
            "productIds": [op.product_id for op in r.offer_products.all()],
        }
        for r in rows
    ]


def list_products(
    store_id: str,
    include_archived: bool = False,
    online_only: bool = False,
    search: Optional[str] = None,
    category_id: Optional[str] = None,
    brand_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    qs = Product.objects.select_related("category", "brand", "unit", "tax_rate").filter(store_id=store_id)
    if not include_archived:
        qs = qs.filter(archived_at__isnull=True)
    if online_only:
        qs = qs.filter(is_available=True)
    if category_id:
        qs = qs.filter(category_id=category_id)
    if brand_id:
        qs = qs.filter(brand_id=brand_id)
    if search and search.strip():
        q = search.strip()
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(barcode__icontains=q)
            | Q(category__name__icontains=q)
            | Q(brand__name__icontains=q)
        )
    rows = qs.order_by("-created_at")

    active_offers = list_offers(store_id, active_only=True)
    offer_by_product: dict[str, dict[str, Any]] = {}
    for off in active_offers:
        for pid in off["productIds"]:
            if pid not in offer_by_product:
                offer_by_product[pid] = off

    results = []
    for r in rows:
        active_offer = offer_by_product.get(r.id)
        effective_price = r.selling_price_paise
        if active_offer:
            if active_offer["offerType"] == "percent":
                effective_price = max(0, round(r.selling_price_paise * (1 - active_offer["discountValue"] / 100.0)))
            elif active_offer["offerType"] == "flat":
                effective_price = max(0, r.selling_price_paise - active_offer["discountValue"])

        cat_name = r.category.name if (r.category and r.category.store_id == r.store_id) else None
        brand_name = r.brand.name if (r.brand and r.brand.store_id == r.store_id) else None

        results.append(
            {
                "id": r.id,
                "storeId": r.store_id,
                "categoryId": r.category_id,
                "categoryName": cat_name,
                "brandId": r.brand_id,
                "brandName": brand_name,
                "unitId": r.unit_id,
                "unitCode": r.unit.code,
                "unitLabel": r.unit.label,
                "taxRateId": r.tax_rate_id,
                "taxRatePercent": r.tax_rate.rate_percent,
                "name": r.name,
                "description": r.description,
                "barcode": r.barcode,
                "imageUrl": r.image_url,
                "mrpPaise": r.mrp_paise,
                "sellingPricePaise": r.selling_price_paise,
                "costPricePaise": r.cost_price_paise,
                "stockQty": r.stock_qty,
                "reservedQty": r.reserved_qty,
                "availableQty": max(0.0, r.stock_qty - r.reserved_qty),
                "reorderLevel": r.reorder_level,
                "expiryDate": r.expiry_date,
                "batchNo": r.batch_no,
                "damagedQty": r.damaged_qty or 0.0,
                "damageNote": r.damage_note or "",
                "onlineVisible": True,
                "isFavourite": False,
                "isAvailable": bool(r.is_available),
                "archivedAt": fmt_dt(r.archived_at),
                "updatedAt": fmt_dt(r.updated_at),
                "activeOffer": active_offer,
                "effectivePricePaise": effective_price,
            }
        )
    return results


def _resolve_store_category_and_brand(store_id: str, payload: dict[str, Any]) -> tuple[Any, Any]:
    resolved_cat = payload.get("categoryId") if "categoryId" in payload else "__UNSET__"
    cat_name = payload.get("categoryName")
    if cat_name and str(cat_name).strip():
        resolved_cat = _upsert_store_category_by_name(store_id, str(cat_name))
    elif resolved_cat not in ("__UNSET__", None, ""):
        if not Category.objects.filter(id=resolved_cat, store_id=store_id).exists():
            raise AppError("FORBIDDEN", "Selected category does not belong to your store.", 403)

    resolved_brand = payload.get("brandId") if "brandId" in payload else "__UNSET__"
    brand_name = payload.get("brandName")
    if brand_name and str(brand_name).strip():
        resolved_brand = _upsert_store_brand_by_name(store_id, str(brand_name))
    elif resolved_brand not in ("__UNSET__", None, ""):
        if not Brand.objects.filter(id=resolved_brand, store_id=store_id).exists():
            raise AppError("FORBIDDEN", "Selected brand does not belong to your store.", 403)

    return resolved_cat, resolved_brand


def create_product(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    store = Store.objects.select_related("plan").filter(id=store_id).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    active_count = Product.objects.filter(store_id=store_id, archived_at__isnull=True).count()
    if active_count >= store.plan.max_products:
        raise AppError(
            "PLAN_LIMIT_REACHED",
            f"Product limit ({store.plan.max_products}) reached for your plan.",
            403,
        )

    now = now_utc()
    product_id = create_id()
    stock_qty = float(payload.get("stockQty", 0))

    with transaction.atomic():
        resolved_cat, resolved_brand = _resolve_store_category_and_brand(store_id, payload)
        barcode = (payload.get("barcode") or "").strip() or _generate_unique_barcode(store_id)
        batch_no = (payload.get("batchNo") or "").strip() or _generate_batch_no(store_id)

        Product.objects.create(
            id=product_id,
            store_id=store_id,
            category_id=None if resolved_cat in ("__UNSET__", "") else resolved_cat,
            brand_id=None if resolved_brand in ("__UNSET__", "") else resolved_brand,
            unit_id=payload["unitId"],
            tax_rate_id=payload["taxRateId"],
            name=payload["name"].strip(),
            description=(payload.get("description") or "").strip(),
            barcode=barcode,
            image_url=payload.get("imageUrl") or None,
            mrp_paise=int(payload["mrpPaise"]),
            selling_price_paise=int(payload["sellingPricePaise"]),
            cost_price_paise=int(payload["costPricePaise"]),
            stock_qty=stock_qty,
            reserved_qty=0.0,
            reorder_level=float(payload["reorderLevel"]) if payload.get("reorderLevel") is not None else 5.0,
            expiry_date=payload.get("expiryDate") or None,
            batch_no=batch_no,
            damaged_qty=max(0.0, float(payload.get("damagedQty") or 0)),
            damage_note=(payload.get("damageNote") or "").strip(),
            online_visible=True,
            is_favourite=False,
            is_available=True,
            created_at=now,
            updated_at=now,
        )

        if stock_qty != 0:
            StockMovement.objects.create(
                id=create_id(),
                store_id=store_id,
                product_id=product_id,
                movement_type="initial",
                qty_delta=stock_qty,
                qty_after=stock_qty,
                reason="Initial opening stock",
                actor_id=actor["id"],
                created_at=now,
            )

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="product.created",
        entity_type="product",
        entity_id=product_id,
        details={"name": payload["name"], "stockQty": stock_qty},
    )
    _emit_catalog_update(store_id)
    return next(p for p in list_products(store_id, include_archived=True) if p["id"] == product_id)


def update_product(store_id: str, product_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    current = Product.objects.filter(id=product_id, store_id=store_id).first()
    if not current:
        raise AppError("NOT_FOUND", "Product not found.", 404)

    now = now_utc()
    old_selling = current.selling_price_paise
    old_cost = current.cost_price_paise
    new_selling = int(payload["sellingPricePaise"]) if payload.get("sellingPricePaise") is not None else old_selling
    new_cost = int(payload["costPricePaise"]) if payload.get("costPricePaise") is not None else old_cost

    with transaction.atomic():
        resolved_cat, resolved_brand = _resolve_store_category_and_brand(store_id, payload)
        if resolved_cat != "__UNSET__":
            current.category_id = resolved_cat or None
        if resolved_brand != "__UNSET__":
            current.brand_id = resolved_brand or None

        if payload.get("unitId"):
            current.unit_id = payload["unitId"]
        if payload.get("taxRateId"):
            current.tax_rate_id = payload["taxRateId"]
        if payload.get("name"):
            current.name = payload["name"].strip()
        if "description" in payload and payload["description"] is not None:
            current.description = payload["description"].strip()

        if "barcode" in payload:
            current.barcode = (payload["barcode"] or "").strip() or current.barcode or _generate_unique_barcode(store_id)
        elif not current.barcode:
            current.barcode = _generate_unique_barcode(store_id)

        if "batchNo" in payload:
            current.batch_no = (payload["batchNo"] or "").strip() or current.batch_no or _generate_batch_no(store_id)
        elif not current.batch_no:
            current.batch_no = _generate_batch_no(store_id)

        if "imageUrl" in payload:
            current.image_url = payload["imageUrl"]
        if payload.get("mrpPaise") is not None:
            current.mrp_paise = int(payload["mrpPaise"])
        current.selling_price_paise = new_selling
        current.cost_price_paise = new_cost
        if payload.get("reorderLevel") is not None:
            current.reorder_level = float(payload["reorderLevel"])
        if "expiryDate" in payload:
            current.expiry_date = payload["expiryDate"] or None
        if payload.get("damagedQty") is not None:
            current.damaged_qty = max(0.0, float(payload["damagedQty"]))
        if "damageNote" in payload and payload["damageNote"] is not None:
            current.damage_note = payload["damageNote"].strip()
        if payload.get("isAvailable") is not None:
            current.is_available = bool(payload["isAvailable"])

        current.online_visible = True
        current.is_favourite = False
        current.updated_at = now
        current.save()

        if new_selling != old_selling or new_cost != old_cost:
            PriceHistory.objects.create(
                id=create_id(),
                store_id=store_id,
                product_id=product_id,
                old_selling_paise=old_selling,
                new_selling_paise=new_selling,
                old_cost_paise=old_cost,
                new_cost_paise=new_cost,
                changed_by=actor["id"],
                created_at=now,
            )

    details = {}
    if "damagedQty" in payload or "damageNote" in payload:
        details = {"damagedQty": payload.get("damagedQty"), "damageNote": payload.get("damageNote")}

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="product.updated",
        entity_type="product",
        entity_id=product_id,
        details=details,
    )
    _emit_catalog_update(store_id)
    return next(p for p in list_products(store_id, include_archived=True) if p["id"] == product_id)


def import_products_bulk(store_id: str, rows: list[dict[str, Any]], actor: dict[str, str]) -> dict[str, Any]:
    store = Store.objects.select_related("plan").filter(id=store_id).first()
    if not store:
        raise AppError("NOT_FOUND", "Store not found.", 404)

    current_count = Product.objects.filter(store_id=store_id, archived_at__isnull=True).count()
    units = list(Unit.objects.order_by("sort_order"))
    tax_rates = list(TaxRate.objects.order_by("sort_order"))
    if not units or not tax_rates:
        raise AppError("CONFIG_ERROR", "Platform units or tax slabs are not configured.", 500)

    default_unit_id = units[0].id
    default_tax_id = tax_rates[0].id
    imported_count = 0
    skipped_count = 0
    errors: list[str] = []
    now = now_utc()

    with transaction.atomic():
        for idx, r in enumerate(rows):
            name = (r.get("name") or "").strip()
            if not name:
                skipped_count += 1
                errors.append(f"Row {idx + 1}: Missing product name.")
                continue
            if current_count >= store.plan.max_products:
                skipped_count += 1
                errors.append(f"Row {idx + 1} ({name}): Plan product limit ({store.plan.max_products}) reached.")
                continue

            sell_raw = r.get("sellingPrice", 0)
            sell_rupees = float(sell_raw) if isinstance(sell_raw, (int, float)) and math.isfinite(sell_raw) and sell_raw >= 0 else 0.0
            mrp_raw = r.get("mrp")
            mrp_rupees = float(mrp_raw) if isinstance(mrp_raw, (int, float)) and math.isfinite(mrp_raw) and mrp_raw >= 0 else sell_rupees
            cost_raw = r.get("costPrice")
            cost_rupees = (
                float(cost_raw)
                if isinstance(cost_raw, (int, float)) and math.isfinite(cost_raw) and cost_raw >= 0
                else round(sell_rupees * 0.8, 2)
            )

            unit_clean = (r.get("unit") or "").strip().lower()
            matched_unit = next(
                (u.id for u in units if u.code.lower() == unit_clean or u.label.lower() == unit_clean),
                default_unit_id,
            )

            tax_raw = r.get("taxRatePercent")
            tax_pct = float(tax_raw) if isinstance(tax_raw, (int, float)) and math.isfinite(tax_raw) else 0.0
            matched_tax = next(
                (t.id for t in tax_rates if abs(t.rate_percent - tax_pct) < 0.01),
                default_tax_id,
            )

            cat_name = (r.get("categoryName") or "").strip()
            brand_name = (r.get("brandName") or "").strip()
            cat_id = _upsert_store_category_by_name(store_id, cat_name) if cat_name else None
            brand_id = _upsert_store_brand_by_name(store_id, brand_name) if brand_name else None

            barcode = (r.get("barcode") or "").strip() or _generate_unique_barcode(store_id)
            batch_no = (r.get("batchNo") or "").strip() or _generate_batch_no(store_id)
            stock_qty = max(0.0, float(r.get("stockQty") or 0))
            reorder_level = max(0.0, float(r.get("reorderLevel") if r.get("reorderLevel") is not None else 5))
            damaged_qty = max(0.0, float(r.get("damagedQty") or 0))
            damage_note = (r.get("damageNote") or "").strip()

            product_id = create_id()
            Product.objects.create(
                id=product_id,
                store_id=store_id,
                category_id=cat_id,
                brand_id=brand_id,
                unit_id=matched_unit,
                tax_rate_id=matched_tax,
                name=name,
                description=(r.get("description") or "").strip(),
                barcode=barcode,
                image_url=None,
                mrp_paise=round(mrp_rupees * 100),
                selling_price_paise=round(sell_rupees * 100),
                cost_price_paise=round(cost_rupees * 100),
                stock_qty=stock_qty,
                reserved_qty=0.0,
                reorder_level=reorder_level,
                expiry_date=None,
                batch_no=batch_no,
                damaged_qty=damaged_qty,
                damage_note=damage_note,
                online_visible=True,
                is_favourite=False,
                is_available=True,
                created_at=now,
                updated_at=now,
            )

            if stock_qty > 0:
                StockMovement.objects.create(
                    id=create_id(),
                    store_id=store_id,
                    product_id=product_id,
                    movement_type="initial",
                    qty_delta=stock_qty,
                    qty_after=stock_qty,
                    reason="Excel inventory import",
                    actor_id=actor["id"],
                    created_at=now,
                )

            imported_count += 1
            current_count += 1

    if imported_count > 0:
        write_audit_log(
            store_id=store_id,
            actor_id=actor["id"],
            actor_role=actor["role"],
            actor_name=actor["name"],
            action="product.bulk_imported",
            entity_type="product",
            entity_id=store_id,
            details={"importedCount": imported_count, "skippedCount": skipped_count},
        )
        _emit_catalog_update(store_id)

    return {"importedCount": imported_count, "skippedCount": skipped_count, "errors": errors}


def archive_or_restore_product(
    store_id: str,
    product_id: str,
    archive: bool,
    actor: dict[str, str],
) -> dict[str, Any]:
    prod = Product.objects.filter(id=product_id, store_id=store_id).first()
    if not prod:
        raise AppError("NOT_FOUND", "Product not found.", 404)

    now = now_utc()
    prod.archived_at = now if archive else None
    prod.updated_at = now
    prod.save(update_fields=["archived_at", "updated_at"])

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="product.archived" if archive else "product.restored",
        entity_type="product",
        entity_id=product_id,
        details={"name": prod.name},
    )
    _emit_catalog_update(store_id)
    return {"id": product_id, "archivedAt": fmt_dt(now) if archive else None}


def adjust_stock(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    now = now_utc()
    movement_type = payload["movementType"]

    with transaction.atomic():
        prod = Product.objects.select_for_update().filter(id=payload["productId"], store_id=store_id).first()
        if not prod:
            raise AppError("NOT_FOUND", "Product not found.", 404)

        delta = float(payload.get("qtyDelta") or 0)
        new_qty = prod.stock_qty + delta
        new_damaged_qty = prod.damaged_qty or 0.0
        new_damage_note = prod.damage_note or ""

        if movement_type == "stock_take" and payload.get("countedQty") is not None:
            counted = float(payload["countedQty"])
            delta = counted - prod.stock_qty
            new_qty = counted
        elif movement_type == "damaged":
            dmg_units = max(0.0, abs(float(payload.get("qtyDelta") or 0)))
            delta = -dmg_units
            new_qty = max(0.0, prod.stock_qty - dmg_units)
            new_damaged_qty += dmg_units
            if (payload.get("reason") or "").strip():
                new_damage_note = payload["reason"].strip()

        if new_qty < 0:
            new_qty = 0.0

        prod.stock_qty = new_qty
        prod.damaged_qty = new_damaged_qty
        prod.damage_note = new_damage_note
        prod.updated_at = now
        prod.save(update_fields=["stock_qty", "damaged_qty", "damage_note", "updated_at"])

        StockMovement.objects.create(
            id=create_id(),
            store_id=store_id,
            product_id=prod.id,
            movement_type=movement_type,
            qty_delta=delta,
            qty_after=new_qty,
            reason=(payload.get("reason") or "").strip() or movement_type,
            reference_id=payload.get("invoiceNo"),
            actor_id=actor["id"],
            created_at=now,
        )

        if movement_type == "stock_in" and payload.get("supplierId"):
            po_total = int(payload.get("totalCostPaise") or 0)
            PurchaseOrder.objects.create(
                id=create_id(),
                store_id=store_id,
                supplier_id=payload["supplierId"],
                invoice_no=payload.get("invoiceNo") or f"PO-{int(now.timestamp() * 1000)}",
                total_paise=po_total,
                paid_paise=0,
                status="received",
                created_at=now,
            )
            Supplier.objects.filter(id=payload["supplierId"], store_id=store_id).update(
                payable_paise=F("payable_paise") + po_total
            )

        result = {
            "productId": prod.id,
            "name": prod.name,
            "newQty": new_qty,
            "reorderLevel": prod.reorder_level,
        }

    if result["newQty"] <= result["reorderLevel"]:
        notify_store_team(
            store_id=store_id,
            notif_type="stock.low",
            vars_dict={
                "productName": result["name"],
                "qty": result["newQty"],
                "unit": "",
                "reorder": result["reorderLevel"],
            },
            entity_type="product",
            entity_id=result["productId"],
        )

    _emit_catalog_update(store_id)
    return result


def get_inventory_predictions(store_id: str) -> dict[str, Any]:
    products = list_products(store_id, include_archived=False)
    now = now_utc()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_label = now.strftime("%B %Y")
    day_of_month = max(1, now.day)
    cutoff_30 = now - timedelta(days=30)

    meta_map = {
        r.id: (r.created_at, r.updated_at)
        for r in Product.objects.filter(store_id=store_id, archived_at__isnull=True).only("id", "created_at", "updated_at")
    }

    excluded_statuses = ["cancelled", "rejected", "refunded", "failed"]

    month_sales_qs = (
        OrderItem.objects.filter(
            order__store_id=store_id,
            product_id__isnull=False,
            order__created_at__gte=month_start,
        )
        .exclude(order__status_code__in=excluded_statuses)
        .values("product_id")
        .annotate(
            total_qty=Sum("qty"),
            pos_qty=Sum(Case(When(order__channel="pos", then=F("qty")), default=Value(0.0), output_field=FloatField())),
            online_qty=Sum(
                Case(When(order__channel="online", then=F("qty")), default=Value(0.0), output_field=FloatField())
            ),
            revenue_paise=Sum("line_total_paise"),
        )
    )
    month_map = {row["product_id"]: row for row in month_sales_qs}

    last30_qs = (
        OrderItem.objects.filter(order__store_id=store_id, product_id__isnull=False)
        .exclude(order__status_code__in=excluded_statuses)
        .values("product_id")
        .annotate(
            qty_30d=Sum(
                Case(When(order__created_at__gte=cutoff_30, then=F("qty")), default=Value(0.0), output_field=FloatField())
            ),
            last_sold_at=Max("order__created_at"),
        )
    )
    last30_map = {row["product_id"]: row for row in last30_qs}

    low_stock: list[dict[str, Any]] = []
    high_demand: list[dict[str, Any]] = []
    dead_stock: list[dict[str, Any]] = []
    damaged_risks: list[dict[str, Any]] = []

    for p in products:
        pid = p["id"]
        unit_label = p.get("unitLabel") or p.get("unitCode") or "pcs"
        m_sale = month_map.get(pid)
        l30 = last30_map.get(pid)
        created_at, updated_at = meta_map.get(pid, (now, now))

        monthly_sold = float(m_sale["total_qty"] or 0) if m_sale else 0.0
        pos_units = float(m_sale["pos_qty"] or 0) if m_sale else 0.0
        online_units = float(m_sale["online_qty"] or 0) if m_sale else 0.0
        monthly_rev = int(m_sale["revenue_paise"] or 0) if m_sale else 0

        qty_30 = float(l30["qty_30d"] or 0) if l30 else 0.0
        if qty_30 > 0:
            avg_daily = max(qty_30 / 30.0, monthly_sold / day_of_month)
        elif monthly_sold > 0:
            avg_daily = monthly_sold / day_of_month
        else:
            avg_daily = 0.0

        days_of_cover = round(p["availableQty"] / avg_daily, 1) if avg_daily > 0 else None

        is_out = p["availableQty"] <= 0
        is_below_reorder = p["availableQty"] <= p["reorderLevel"]
        is_projected_low = days_of_cover is not None and days_of_cover <= 7

        if is_out or is_below_reorder or is_projected_low:
            target_qty = max(p["reorderLevel"] * 2, math.ceil(avg_daily * 14))
            suggested = max(1, math.ceil(target_qty - p["availableQty"]))
            severity = "critical" if (is_out or (days_of_cover is not None and days_of_cover <= 2)) else "warning"
            if is_out:
                reason = f"Out of stock (reorder level {p['reorderLevel']} {unit_label})."
            elif is_below_reorder:
                reason = f"Low stock: {p['availableQty']} {unit_label} left (reorder level {p['reorderLevel']} {unit_label})."
            else:
                reason = f"Fast-moving stock covers only ~{days_of_cover} day(s) at current demand."

            low_stock.append(
                {
                    "productId": pid,
                    "name": p["name"],
                    "categoryName": p.get("categoryName"),
                    "brandName": p.get("brandName"),
                    "unitLabel": unit_label,
                    "stockQty": p["stockQty"],
                    "availableQty": p["availableQty"],
                    "reorderLevel": p["reorderLevel"],
                    "monthlyUnitsSold": monthly_sold,
                    "daysOfCover": days_of_cover,
                    "suggestedRestockQty": suggested,
                    "severity": severity,
                    "reason": reason,
                }
            )

        if monthly_sold > 0:
            high_demand.append(
                {
                    "productId": pid,
                    "name": p["name"],
                    "categoryName": p.get("categoryName"),
                    "brandName": p.get("brandName"),
                    "unitLabel": unit_label,
                    "monthlyUnitsSold": monthly_sold,
                    "posUnits": pos_units,
                    "onlineUnits": online_units,
                    "monthlyRevenuePaise": monthly_rev,
                    "availableQty": p["availableQty"],
                    "daysOfCover": days_of_cover,
                    "reason": f"{monthly_sold} {unit_label} sold this month ({pos_units} POS · {online_units} Online).",
                }
            )

        if p["stockQty"] > 0 and qty_30 == 0 and monthly_sold == 0:
            last_sold_dt = l30["last_sold_at"] if (l30 and l30.get("last_sold_at")) else None
            ref_dt = last_sold_dt or created_at or now
            days_idle = max(0, int((now - ref_dt).total_seconds() // 86400))
            dead_stock.append(
                {
                    "productId": pid,
                    "name": p["name"],
                    "categoryName": p.get("categoryName"),
                    "brandName": p.get("brandName"),
                    "unitLabel": unit_label,
                    "stockQty": p["stockQty"],
                    "idleValuePaise": round(p["stockQty"] * p["costPricePaise"]),
                    "daysIdle": days_idle,
                    "reason": (
                        f"No sales in last 30+ days ({p['stockQty']} {unit_label} sitting unsold)."
                        if last_sold_dt
                        else f"No sales recorded yet ({p['stockQty']} {unit_label} sitting in stock)."
                    ),
                }
            )

        dmg_qty = float(p.get("damagedQty") or 0)
        dmg_note = (p.get("damageNote") or "").strip()
        if dmg_qty > 0 or len(dmg_note) > 0:
            damaged_risks.append(
                {
                    "productId": pid,
                    "name": p["name"],
                    "categoryName": p.get("categoryName"),
                    "brandName": p.get("brandName"),
                    "unitLabel": unit_label,
                    "damagedQty": dmg_qty,
                    "damageNote": dmg_note or "Damaged stock flagged by store owner",
                    "estimatedLossPaise": round(dmg_qty * p["costPricePaise"]),
                    "availableQty": p["availableQty"],
                    "updatedAt": fmt_dt(updated_at or now),
                }
            )

    low_stock.sort(key=lambda x: (0 if x["severity"] == "critical" else 1, x["availableQty"]))
    high_demand.sort(key=lambda x: -x["monthlyUnitsSold"])
    dead_stock.sort(key=lambda x: -x["idleValuePaise"])
    damaged_risks.sort(key=lambda x: (-x["estimatedLossPaise"], -x["damagedQty"]))

    return {
        "monthLabel": month_label,
        "generatedAt": fmt_dt(now),
        "summary": {
            "lowStockCount": len(low_stock),
            "highDemandCount": len(high_demand),
            "deadStockCount": len(dead_stock),
            "damagedRiskCount": len(damaged_risks),
        },
        "lowStock": low_stock,
        "highDemandThisMonth": high_demand,
        "deadStock": dead_stock,
        "damagedRisks": damaged_risks,
    }


def list_stock_movements(store_id: str) -> list[dict[str, Any]]:
    rows = list(StockMovement.objects.select_related("product").filter(store_id=store_id).order_by("-created_at")[:150])
    actor_ids = {r.actor_id for r in rows if r.actor_id}
    actor_map = {u.id: u.name for u in User.objects.filter(id__in=actor_ids).only("id", "name")}
    return [
        {
            "id": r.id,
            "productId": r.product_id,
            "productName": r.product.name,
            "movementType": r.movement_type,
            "qtyDelta": r.qty_delta,
            "qtyAfter": r.qty_after,
            "reason": r.reason,
            "referenceId": r.reference_id,
            "actorName": actor_map.get(r.actor_id, "System"),
            "createdAt": fmt_dt(r.created_at),
        }
        for r in rows
    ]


def create_offer(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> dict[str, Any]:
    oid = create_id()
    now = now_utc()
    with transaction.atomic():
        Offer.objects.create(
            id=oid,
            store_id=store_id,
            title=payload["title"].strip(),
            offer_type=payload["offerType"],
            discount_value=int(payload["discountValue"]),
            min_qty=int(payload.get("minQty") or 1),
            is_active=True,
            created_at=now,
        )
        for pid in set(payload["productIds"]):
            OfferProduct.objects.get_or_create(offer_id=oid, product_id=pid)

    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="offer.created",
        entity_type="offer",
        entity_id=oid,
        details={"title": payload["title"]},
    )
    _emit_catalog_update(store_id)
    return next(o for o in list_offers(store_id) if o["id"] == oid)


def toggle_offer(store_id: str, offer_id: str, is_active: bool, actor: dict[str, str]) -> list[dict[str, Any]]:
    Offer.objects.filter(id=offer_id, store_id=store_id).update(is_active=is_active)
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="offer.activated" if is_active else "offer.ended",
        entity_type="offer",
        entity_id=offer_id,
    )
    _emit_catalog_update(store_id)
    return list_offers(store_id)


def list_suppliers(store_id: str) -> list[dict[str, Any]]:
    rows = Supplier.objects.filter(store_id=store_id).order_by("name")
    return [
        {
            "id": r.id,
            "storeId": r.store_id,
            "name": r.name,
            "phone": r.phone,
            "gstNo": r.gst_no,
            "payablePaise": r.payable_paise,
            "createdAt": fmt_dt(r.created_at),
        }
        for r in rows
    ]


def create_supplier(store_id: str, payload: dict[str, Any], actor: dict[str, str]) -> list[dict[str, Any]]:
    sid = create_id()
    Supplier.objects.create(
        id=sid,
        store_id=store_id,
        name=payload["name"].strip(),
        phone=(payload.get("phone") or "").strip(),
        gst_no=(payload.get("gstNo") or "").strip() or None,
        payable_paise=0,
        created_at=now_utc(),
    )
    write_audit_log(
        store_id=store_id,
        actor_id=actor["id"],
        actor_role=actor["role"],
        actor_name=actor["name"],
        action="supplier.created",
        entity_type="supplier",
        entity_id=sid,
    )
    return list_suppliers(store_id)


def list_master_products() -> list[dict[str, Any]]:
    rows = MasterProduct.objects.order_by("name")
    return [
        {
            "id": r.id,
            "name": r.name,
            "categoryName": r.category_name,
            "brandName": r.brand_name,
            "unitCode": r.unit_code,
            "taxRatePercent": r.tax_rate_percent,
            "barcode": r.barcode,
            "mrpPaise": r.mrp_paise,
        }
        for r in rows
    ]
