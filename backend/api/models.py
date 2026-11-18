import uuid
from datetime import datetime, timezone
from django.db import models


def create_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Platform & Config Tables ----------


class AppSetting(models.Model):
    key = models.CharField(primary_key=True, max_length=120)
    value = models.TextField()
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "app_settings"


class Plan(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    name = models.CharField(max_length=120, unique=True)
    tagline = models.TextField()
    max_products = models.IntegerField()
    max_staff = models.IntegerField()
    max_monthly_orders = models.IntegerField()
    price_paise = models.IntegerField()
    billing_cycle = models.CharField(
        max_length=20,
        choices=[("monthly", "monthly"), ("yearly", "yearly")],
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "plans"


class FeatureFlag(models.Model):
    key = models.CharField(primary_key=True, max_length=120)
    label = models.CharField(max_length=200)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "feature_flags"


class Unit(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    code = models.CharField(max_length=40, unique=True)
    label = models.CharField(max_length=80)
    allow_decimal = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "units"
        ordering = ["sort_order"]


class TaxRate(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    name = models.CharField(max_length=100)
    rate_percent = models.FloatField()
    hsn_default = models.CharField(max_length=40, null=True, blank=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "tax_rates"
        ordering = ["sort_order"]


class OrderStatus(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    code = models.CharField(max_length=60, unique=True)
    label = models.CharField(max_length=120)
    applies_to = models.CharField(
        max_length=20,
        choices=[("online", "online"), ("pos", "pos"), ("all", "all")],
    )
    tone = models.CharField(
        max_length=20,
        choices=[
            ("neutral", "neutral"),
            ("info", "info"),
            ("warning", "warning"),
            ("success", "success"),
            ("danger", "danger"),
        ],
    )
    sort_order = models.IntegerField(default=0)
    requires_reason = models.BooleanField(default=False)

    class Meta:
        db_table = "order_statuses"
        ordering = ["sort_order"]


class StatusTransition(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    from_code = models.CharField(max_length=60)
    to_code = models.CharField(max_length=60)

    class Meta:
        db_table = "status_transitions"
        constraints = [
            models.UniqueConstraint(fields=["from_code", "to_code"], name="uq_status_transition"),
        ]


class PaymentStatus(models.Model):
    code = models.CharField(primary_key=True, max_length=60)
    label = models.CharField(max_length=120)
    tone = models.CharField(
        max_length=20,
        choices=[
            ("neutral", "neutral"),
            ("info", "info"),
            ("warning", "warning"),
            ("success", "success"),
            ("danger", "danger"),
        ],
    )
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "payment_statuses"
        ordering = ["sort_order"]


class PaymentMethodType(models.Model):
    code = models.CharField(primary_key=True, max_length=60)
    label = models.CharField(max_length=120)
    enabled_by_default = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "payment_method_types"
        ordering = ["sort_order"]


class NotificationType(models.Model):
    code = models.CharField(primary_key=True, max_length=80)
    label = models.CharField(max_length=200)
    is_critical = models.BooleanField(default=False)

    class Meta:
        db_table = "notification_types"


class NotificationChannel(models.Model):
    code = models.CharField(primary_key=True, max_length=60)
    label = models.CharField(max_length=120)
    enabled = models.BooleanField(default=False)
    visible_in_ui = models.BooleanField(default=False)

    class Meta:
        db_table = "notification_channels"


class MessageTemplate(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    type_code = models.CharField(max_length=80)
    language = models.CharField(max_length=16, default="en")
    title_template = models.TextField()
    body_template = models.TextField()

    class Meta:
        db_table = "message_templates"
        constraints = [
            models.UniqueConstraint(fields=["type_code", "language"], name="uq_msg_tmpl_type_lang"),
        ]


class I18nString(models.Model):
    key = models.CharField(primary_key=True, max_length=150)
    language = models.CharField(max_length=16, default="en")
    value = models.TextField()

    class Meta:
        db_table = "i18n_strings"


class Faq(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    question = models.TextField()
    answer = models.TextField()
    category = models.CharField(max_length=100)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "faqs"
        ordering = ["sort_order", "created_at"]


# ---------- Users & Identity ----------


class User(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    role = models.CharField(
        max_length=20,
        choices=[
            ("super_admin", "super_admin"),
            ("smo", "smo"),
            ("staff", "staff"),
            ("customer", "customer"),
        ],
    )
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=32, unique=True, null=True, blank=True)
    email = models.CharField(max_length=255, unique=True, null=True, blank=True)
    password_hash = models.TextField(null=True, blank=True)
    pin_hash = models.TextField(null=True, blank=True)
    failed_pin_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "users"


class Store(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    owner = models.ForeignKey(User, on_delete=models.PROTECT, db_column="owner_id", related_name="owned_stores")
    slug = models.CharField(max_length=120, unique=True)
    name = models.CharField(max_length=200)
    status = models.CharField(
        max_length=20,
        choices=[("pending", "pending"), ("active", "active"), ("suspended", "suspended")],
        default="active",
    )
    suspension_reason = models.TextField(null=True, blank=True)
    support_contact = models.CharField(max_length=200, null=True, blank=True)
    is_open = models.BooleanField(default=True)
    closed_reason = models.TextField(null=True, blank=True)
    address = models.TextField(default="")
    phone = models.CharField(max_length=40, default="")
    timings = models.CharField(max_length=200, default="")
    logo_url = models.TextField(null=True, blank=True)
    banner_url = models.TextField(null=True, blank=True)
    brand_color = models.CharField(max_length=32, default="#0F766E")
    delivery_enabled = models.BooleanField(default=True)
    pickup_enabled = models.BooleanField(default=True)
    delivery_fee_paise = models.IntegerField(default=2000)
    min_order_paise = models.IntegerField(default=10000)
    delivery_eta_text = models.CharField(max_length=100, default="30-45 mins")
    delivery_radius_km = models.FloatField(default=5.0)
    store_lat = models.FloatField(null=True, blank=True)
    store_lng = models.FloatField(null=True, blank=True)
    pickup_slots_json = models.TextField(default='["Within 30 mins","Today 5-7 PM","Tomorrow Morning"]')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, db_column="plan_id", related_name="stores")
    plan_expires_at = models.DateTimeField(null=True, blank=True)
    gst_number = models.CharField(max_length=64, null=True, blank=True)
    fssai_number = models.CharField(max_length=64, null=True, blank=True)
    docs_verified = models.BooleanField(default=False)
    require_payment_reference = models.BooleanField(default=True)
    allow_zero_stock_pos = models.BooleanField(default=True)
    khata_limit_behavior = models.CharField(
        max_length=10,
        choices=[("warn", "warn"), ("block", "block")],
        default="warn",
    )
    low_stock_threshold = models.IntegerField(default=5)
    invoice_prefix = models.CharField(max_length=24, default="INV")
    next_invoice_no = models.IntegerField(default=1001)
    sound_alerts_enabled = models.BooleanField(default=True)
    staff_can_verify_payment = models.BooleanField(default=False)
    qr_version = models.IntegerField(default=1)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "stores"


class StoreStaff(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id", related_name="staff_members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column="user_id", related_name="staff_assignments")
    staff_role = models.CharField(
        max_length=20,
        choices=[("cashier", "cashier"), ("packer", "packer"), ("manager", "manager")],
    )
    permissions_json = models.TextField(default='["pos","pack"]')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "store_staff"


class StorePaymentMethod(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id", related_name="payment_methods")
    method_code = models.ForeignKey(
        PaymentMethodType,
        on_delete=models.PROTECT,
        db_column="method_code",
        to_field="code",
    )
    enabled = models.BooleanField(default=False)
    upi_id = models.CharField(max_length=200, null=True, blank=True)
    payee_name = models.CharField(max_length=200, null=True, blank=True)
    upi_qr_url = models.TextField(null=True, blank=True)
    require_reference = models.BooleanField(default=True)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "store_payment_methods"
        constraints = [
            models.UniqueConstraint(fields=["store", "method_code"], name="uq_store_payment_method"),
        ]


# ---------- Catalogue & Inventory ----------


class Category(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id", null=True, blank=True)
    name = models.CharField(max_length=200)
    parent_id = models.CharField(max_length=64, null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "categories"


class Brand(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id", null=True, blank=True)
    name = models.CharField(max_length=200)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "brands"


class MasterProduct(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    name = models.CharField(max_length=255)
    category_name = models.CharField(max_length=200)
    brand_name = models.CharField(max_length=200)
    unit_code = models.CharField(max_length=40)
    tax_rate_percent = models.FloatField()
    barcode = models.CharField(max_length=100, unique=True, null=True, blank=True)
    mrp_paise = models.IntegerField()
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "master_products"


class Product(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id", related_name="products")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, db_column="category_id", null=True, blank=True)
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, db_column="brand_id", null=True, blank=True)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, db_column="unit_id")
    tax_rate = models.ForeignKey(TaxRate, on_delete=models.PROTECT, db_column="tax_rate_id")
    name = models.CharField(max_length=255)
    description = models.TextField(default="")
    barcode = models.CharField(max_length=100, null=True, blank=True)
    image_url = models.TextField(null=True, blank=True)
    mrp_paise = models.IntegerField()
    selling_price_paise = models.IntegerField()
    cost_price_paise = models.IntegerField()
    stock_qty = models.FloatField(default=0.0)
    reserved_qty = models.FloatField(default=0.0)
    reorder_level = models.FloatField(default=5.0)
    expiry_date = models.CharField(max_length=32, null=True, blank=True)
    batch_no = models.CharField(max_length=100, null=True, blank=True)
    damaged_qty = models.FloatField(default=0.0)
    damage_note = models.TextField(default="")
    online_visible = models.BooleanField(default=True)
    is_favourite = models.BooleanField(default=False)
    is_available = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "products"
        indexes = [
            models.Index(fields=["store", "archived_at"], name="idx_products_store"),
        ]


class PriceHistory(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id")
    old_selling_paise = models.IntegerField()
    new_selling_paise = models.IntegerField()
    old_cost_paise = models.IntegerField()
    new_cost_paise = models.IntegerField()
    changed_by = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "price_history"


class StockMovement(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id")
    movement_type = models.CharField(
        max_length=32,
        choices=[
            ("initial", "initial"),
            ("stock_in", "stock_in"),
            ("pos_sale", "pos_sale"),
            ("online_reserve", "online_reserve"),
            ("online_release", "online_release"),
            ("online_deduct", "online_deduct"),
            ("adjustment", "adjustment"),
            ("return_restore", "return_restore"),
            ("stock_take", "stock_take"),
            ("damaged", "damaged"),
        ],
    )
    qty_delta = models.FloatField()
    qty_after = models.FloatField()
    reason = models.TextField()
    reference_id = models.CharField(max_length=120, null=True, blank=True)
    actor_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "stock_movements"
        indexes = [
            models.Index(fields=["store", "created_at"], name="idx_stock_movements_store_date"),
        ]


class Offer(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    title = models.CharField(max_length=255)
    offer_type = models.CharField(
        max_length=20,
        choices=[("percent", "percent"), ("flat", "flat"), ("combo", "combo"), ("bogo", "bogo")],
    )
    discount_value = models.IntegerField()
    min_qty = models.IntegerField(default=1)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "offers"


class OfferProduct(models.Model):
    offer = models.ForeignKey(Offer, on_delete=models.CASCADE, db_column="offer_id", related_name="offer_products")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id")

    class Meta:
        db_table = "offer_products"
        constraints = [
            models.UniqueConstraint(fields=["offer", "product"], name="uq_offer_product"),
        ]


class Supplier(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, default="")
    gst_no = models.CharField(max_length=64, null=True, blank=True)
    payable_paise = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "suppliers"


class PurchaseOrder(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, db_column="supplier_id")
    invoice_no = models.CharField(max_length=120)
    total_paise = models.IntegerField()
    paid_paise = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=[("received", "received"), ("pending", "pending")],
        default="received",
    )
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "purchase_orders"


# ---------- Customer Profile Data ----------


class CustomerAddress(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    customer = models.ForeignKey(User, on_delete=models.CASCADE, db_column="customer_id")
    label = models.CharField(max_length=100)
    address_line = models.TextField()
    landmark = models.TextField(default="")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "customer_addresses"


class Favourite(models.Model):
    customer = models.ForeignKey(User, on_delete=models.CASCADE, db_column="customer_id")
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, db_column="product_id")

    class Meta:
        db_table = "favourites"
        constraints = [
            models.UniqueConstraint(fields=["customer", "store", "product"], name="uq_customer_store_product_fav"),
        ]


# ---------- Orders, POS, Held Bills, Payments ----------


class Order(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    order_number = models.CharField(max_length=64)
    channel = models.CharField(max_length=16, choices=[("pos", "pos"), ("online", "online")])
    fulfilment = models.CharField(
        max_length=20,
        choices=[("counter", "counter"), ("pickup", "pickup"), ("delivery", "delivery")],
    )
    pickup_slot = models.CharField(max_length=120, null=True, blank=True)
    delivery_address = models.TextField(null=True, blank=True)
    delivery_lat = models.FloatField(null=True, blank=True)
    delivery_lng = models.FloatField(null=True, blank=True)
    delivery_distance_km = models.FloatField(null=True, blank=True)
    status_code = models.CharField(max_length=40)
    payment_status = models.CharField(max_length=40)
    payment_method = models.CharField(max_length=40)
    customer = models.ForeignKey(User, on_delete=models.SET_NULL, db_column="customer_id", null=True, blank=True)
    customer_name = models.CharField(max_length=200, default="Walk-in Customer")
    customer_phone = models.CharField(max_length=40, null=True, blank=True)
    subtotal_paise = models.IntegerField()
    discount_paise = models.IntegerField(default=0)
    tax_paise = models.IntegerField(default=0)
    delivery_fee_paise = models.IntegerField(default=0)
    total_paise = models.IntegerField()
    cash_tendered_paise = models.IntegerField(null=True, blank=True)
    change_returned_paise = models.IntegerField(null=True, blank=True)
    handover_code = models.CharField(max_length=16, null=True, blank=True)
    assigned_staff_name = models.CharField(max_length=200, null=True, blank=True)
    rating = models.IntegerField(null=True, blank=True)
    feedback = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=120, null=True, blank=True)
    created_by = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "orders"
        constraints = [
            models.UniqueConstraint(fields=["store", "order_number"], name="uq_store_order_number"),
        ]
        indexes = [
            models.Index(fields=["store", "created_at"], name="idx_orders_store_date"),
            models.Index(fields=["customer", "created_at"], name="idx_orders_customer"),
        ]


class OrderItem(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, db_column="order_id", related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, db_column="product_id", null=True, blank=True)
    product_name = models.CharField(max_length=255)
    unit_label = models.CharField(max_length=40)
    qty = models.FloatField()
    unit_price_paise = models.IntegerField()
    cost_price_paise = models.IntegerField(default=0)
    tax_percent = models.FloatField(default=0.0)
    discount_paise = models.IntegerField(default=0)
    line_total_paise = models.IntegerField()
    availability_status = models.CharField(max_length=32, default="available")
    substitute_name = models.CharField(max_length=255, null=True, blank=True)
    substitution_pref = models.CharField(max_length=20, default="call_me")
    packed = models.BooleanField(default=False)

    class Meta:
        db_table = "order_items"


class OrderEvent(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, db_column="order_id", related_name="events")
    from_status = models.CharField(max_length=40, null=True, blank=True)
    to_status = models.CharField(max_length=40)
    actor_name = models.CharField(max_length=200)
    actor_role = models.CharField(max_length=40)
    reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "order_events"


class OrderMessage(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, db_column="order_id", related_name="messages")
    sender_role = models.CharField(max_length=40)
    sender_name = models.CharField(max_length=200)
    body = models.TextField()
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "order_messages"


class HeldBill(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    label = models.CharField(max_length=200)
    payload_json = models.TextField()
    created_by = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "held_bills"


class Payment(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, db_column="order_id", related_name="payments")
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    method_code = models.CharField(max_length=40)
    amount_paise = models.IntegerField()
    status = models.CharField(max_length=40)
    reference_no = models.CharField(max_length=200, null=True, blank=True)
    proof_url = models.TextField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.CharField(max_length=64, null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.TextField(null=True, blank=True)
    resubmission_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "payments"
        indexes = [
            models.Index(fields=["store", "status"], name="idx_payments_store_status"),
        ]


class Refund(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, db_column="order_id")
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    amount_paise = models.IntegerField()
    method_code = models.CharField(max_length=40)
    reference_no = models.CharField(max_length=200, null=True, blank=True)
    reason = models.TextField()
    actor_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "refunds"


# ---------- Finance & Intelligence ----------


class Expense(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    category = models.CharField(max_length=120)
    title = models.CharField(max_length=255)
    amount_paise = models.IntegerField()
    expense_date = models.CharField(max_length=32)
    is_recurring = models.BooleanField(default=False)
    notes = models.TextField(default="")
    created_by = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "expenses"
        indexes = [
            models.Index(fields=["store", "expense_date"], name="idx_expenses_store_date"),
        ]


class DailyClosing(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    closing_date = models.CharField(max_length=32)
    opening_cash_paise = models.IntegerField(default=0)
    cash_sales_paise = models.IntegerField(default=0)
    upi_verified_paise = models.IntegerField(default=0)
    card_sales_paise = models.IntegerField(default=0)
    khata_given_paise = models.IntegerField(default=0)
    expenses_paise = models.IntegerField(default=0)
    expected_cash_paise = models.IntegerField(default=0)
    actual_cash_paise = models.IntegerField(default=0)
    difference_paise = models.IntegerField(default=0)
    note = models.TextField(default="")
    closed_by = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "daily_closings"


class AdvisorAction(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    action_key = models.CharField(max_length=150)
    status = models.CharField(
        max_length=20,
        choices=[("open", "open"), ("done", "done"), ("dismissed", "dismissed")],
        default="open",
    )
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "advisor_actions"
        constraints = [
            models.UniqueConstraint(fields=["store", "action_key"], name="uq_store_advisor_action"),
        ]


# ---------- Khata Book ----------


class KhataAccount(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    customer = models.ForeignKey(User, on_delete=models.SET_NULL, db_column="customer_id", null=True, blank=True)
    customer_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=32)
    address = models.TextField(default="")
    credit_limit_paise = models.IntegerField()
    billing_cycle_day = models.IntegerField(default=1)
    balance_paise = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=[("active", "active"), ("frozen", "frozen"), ("closed", "closed")],
        default="active",
    )
    notes = models.TextField(default="")
    created_at = models.DateTimeField(default=now_utc)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "khata_accounts"
        constraints = [
            models.UniqueConstraint(fields=["store", "phone"], name="uq_khata_store_phone"),
        ]


class KhataEntry(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    account = models.ForeignKey(KhataAccount, on_delete=models.CASCADE, db_column="account_id", related_name="entries")
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, db_column="order_id", null=True, blank=True)
    entry_type = models.CharField(
        max_length=20,
        choices=[("debit", "debit"), ("credit", "credit"), ("write_off", "write_off")],
    )
    amount_paise = models.IntegerField()
    balance_after_paise = models.IntegerField()
    payment_method = models.CharField(max_length=40, null=True, blank=True)
    reference_no = models.CharField(max_length=200, null=True, blank=True)
    note = models.TextField(default="")
    created_by = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "khata_entries"
        indexes = [
            models.Index(fields=["account", "created_at"], name="idx_khata_entries_account"),
        ]


# ---------- Notifications & Support & Platform Governance ----------


class Notification(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, db_column="recipient_id")
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id", null=True, blank=True)
    type = models.CharField(max_length=80)
    title = models.CharField(max_length=255)
    body = models.TextField()
    entity_type = models.CharField(max_length=64, null=True, blank=True)
    entity_id = models.CharField(max_length=64, null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "notifications"
        indexes = [
            models.Index(fields=["recipient", "read_at", "created_at"], name="idx_notifications_recipient"),
        ]


class NotificationPreference(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column="user_id")
    type_code = models.CharField(max_length=80)
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preferences"
        constraints = [
            models.UniqueConstraint(fields=["user", "type_code"], name="uq_notif_pref_user_type"),
        ]


class SupportTicket(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, db_column="created_by")
    subject = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=[
            ("open", "open"),
            ("in_progress", "in_progress"),
            ("resolved", "resolved"),
            ("closed", "closed"),
        ],
        default="open",
    )
    priority = models.CharField(
        max_length=20,
        choices=[("low", "low"), ("normal", "normal"), ("high", "high")],
        default="normal",
    )
    assigned_to = models.CharField(max_length=64, null=True, blank=True)
    internal_notes = models.TextField(default="")
    sla_due_at = models.DateTimeField()
    created_at = models.DateTimeField(default=now_utc)
    updated_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "support_tickets"


class TicketMessage(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, db_column="ticket_id", related_name="messages")
    sender_id = models.CharField(max_length=64)
    sender_role = models.CharField(max_length=40)
    sender_name = models.CharField(max_length=200)
    body = models.TextField()
    attachment_url = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "ticket_messages"


class DeletionRequest(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, db_column="owner_id")
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=[
            ("pending_grace", "pending_grace"),
            ("restored", "restored"),
            ("finalised", "finalised"),
        ],
        default="pending_grace",
    )
    grace_ends_at = models.DateTimeField()
    processed_by = models.CharField(max_length=64, null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "deletion_requests"


class AuditLog(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store_id = models.CharField(max_length=64, null=True, blank=True)
    actor_id = models.CharField(max_length=64)
    actor_role = models.CharField(max_length=40)
    actor_name = models.CharField(max_length=200)
    action = models.CharField(max_length=120)
    entity_type = models.CharField(max_length=80)
    entity_id = models.CharField(max_length=120)
    details_json = models.TextField(default="{}")
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["created_at"], name="idx_audit_logs_date"),
        ]


class QrScan(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=create_id)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, db_column="store_id")
    utm_source = models.CharField(max_length=120, null=True, blank=True)
    utm_medium = models.CharField(max_length=120, null=True, blank=True)
    utm_campaign = models.CharField(max_length=120, null=True, blank=True)
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "qr_scans"


class AutomationJob(models.Model):
    key = models.CharField(primary_key=True, max_length=100)
    name = models.CharField(max_length=200)
    trigger_desc = models.CharField(max_length=200)
    action_desc = models.TextField()
    enabled = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=40, default="idle")
    last_message = models.TextField(default="")

    class Meta:
        db_table = "automation_jobs"


class IdempotencyKey(models.Model):
    key = models.CharField(primary_key=True, max_length=160)
    store_id = models.CharField(max_length=64)
    response_json = models.TextField()
    created_at = models.DateTimeField(default=now_utc)

    class Meta:
        db_table = "idempotency_keys"
