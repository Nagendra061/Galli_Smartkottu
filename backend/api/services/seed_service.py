import os
from datetime import timedelta
from django.db import transaction
from api.auth_utils import create_id, hash_secret, now_utc
from api.models import (
    AppSetting,
    AutomationJob,
    Faq,
    FeatureFlag,
    MasterProduct,
    MessageTemplate,
    NotificationChannel,
    NotificationType,
    OrderStatus,
    PaymentMethodType,
    PaymentStatus,
    Plan,
    StatusTransition,
    Store,
    StorePaymentMethod,
    TaxRate,
    Unit,
    User,
)


def seed_database() -> bool:
    """Idempotent minimal seed matching original Galli Smartkottu specification."""
    if AppSetting.objects.filter(key="seeded_v1").exists():
        return False

    now = now_utc()

    admin_email = os.environ.get("SEED_ADMIN_EMAIL", "admin@gallismartkottu.local")
    admin_password = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@2026!")
    admin_name = os.environ.get("SEED_ADMIN_NAME", "Platform Admin")

    smo_email = os.environ.get("SEED_SMO_EMAIL", "owner@gallifresh.local")
    smo_phone = os.environ.get("SEED_SMO_PHONE", "9876543210")
    smo_password = os.environ.get("SEED_SMO_PASSWORD", "Owner@2026!")
    smo_name = os.environ.get("SEED_SMO_NAME", "Ramesh Rao")
    store_name = os.environ.get("SEED_STORE_NAME", "Galli Fresh Mart")
    store_slug = os.environ.get("SEED_STORE_SLUG", "galli-fresh-mart")

    customer_phone = os.environ.get("SEED_CUSTOMER_PHONE", "9123456789")
    customer_pin = os.environ.get("SEED_CUSTOMER_PIN", "1234")
    customer_name = os.environ.get("SEED_CUSTOMER_NAME", "Ananya Sharma")

    with transaction.atomic():
        # 1. App settings
        app_settings = [
            ("app_name", "Galli Smartkottu"),
            ("app_slogan", "Welcome to Galli Smartkottu - here you can manage, track, and improve with us."),
            ("currency_code", "INR"),
            ("currency_symbol", "₹"),
            ("default_language", "en"),
            ("app_version", "1.1.0"),
            ("changelog", "v1.1: Manual UPI QR verification, offline POS queue, Khata Book, and Advisor intelligence."),
            ("force_update", "false"),
            ("default_low_stock_threshold", "5"),
            ("default_expiry_window_days", "14"),
            ("default_payment_timeout_minutes", "15"),
            ("max_upi_resubmissions", "3"),
            ("notification_retention_days", "30"),
            ("seeded_v1", "true"),
        ]
        for k, v in app_settings:
            AppSetting.objects.get_or_create(key=k, defaults={"value": v, "updated_at": now})

        # 2. Plans
        starter_plan, _ = Plan.objects.get_or_create(
            name="Starter",
            defaults={
                "id": create_id(),
                "tagline": "For single neighbourhood stores starting digital",
                "max_products": 250,
                "max_staff": 2,
                "max_monthly_orders": 1000,
                "price_paise": 0,
                "billing_cycle": "monthly",
                "is_active": True,
                "created_at": now,
            },
        )
        Plan.objects.get_or_create(
            name="Growth",
            defaults={
                "id": create_id(),
                "tagline": "For busy stores with staff and high online volume",
                "max_products": 2000,
                "max_staff": 10,
                "max_monthly_orders": 10000,
                "price_paise": 49900,
                "billing_cycle": "monthly",
                "is_active": True,
                "created_at": now,
            },
        )

        # 3. Feature Flags
        for k, lbl in [
            ("offline_pos", "Offline POS Queue"),
            ("khata_book", "Customer Khata Ledger"),
            ("finance_advisor", "Profit Health & Advisor"),
            ("customer_ratings", "Customer Order Ratings"),
        ]:
            FeatureFlag.objects.get_or_create(key=k, defaults={"label": lbl, "enabled": True, "updated_at": now})

        # 4. Units
        for code, lbl, dec, order in [
            ("pcs", "pcs", False, 1),
            ("kg", "kg", True, 2),
            ("g", "g", False, 3),
            ("litre", "litre", True, 4),
            ("ml", "ml", False, 5),
            ("pack", "pack", False, 6),
        ]:
            Unit.objects.get_or_create(
                code=code,
                defaults={"id": create_id(), "label": lbl, "allow_decimal": dec, "sort_order": order},
            )

        # 5. Tax Rates
        for name, pct, hsn, order in [
            ("Exempt (0%)", 0.0, "0401", 1),
            ("GST 5%", 5.0, "1006", 2),
            ("GST 12%", 12.0, "2106", 3),
            ("GST 18%", 18.0, "3401", 4),
        ]:
            TaxRate.objects.get_or_create(
                name=name,
                defaults={"id": create_id(), "rate_percent": pct, "hsn_default": hsn, "sort_order": order},
            )

        # 6. Order Statuses & Transitions
        for code, lbl, applies, tone, order, req_reason in [
            ("placed", "Placed", "online", "info", 1, False),
            ("accepted", "Accepted", "online", "info", 2, False),
            ("packing", "Packing", "online", "warning", 3, False),
            ("ready", "Ready for Pickup", "online", "success", 4, False),
            ("out_for_delivery", "Out for Delivery", "online", "info", 5, False),
            ("completed", "Completed", "all", "success", 6, False),
            ("cancelled", "Cancelled", "online", "danger", 7, True),
            ("rejected", "Rejected", "online", "danger", 8, True),
            ("failed", "Delivery Failed", "online", "danger", 9, True),
            ("refunded", "Refunded", "all", "neutral", 10, True),
        ]:
            OrderStatus.objects.get_or_create(
                code=code,
                defaults={
                    "id": create_id(),
                    "label": lbl,
                    "applies_to": applies,
                    "tone": tone,
                    "sort_order": order,
                    "requires_reason": req_reason,
                },
            )

        for fc, tc in [
            ("placed", "accepted"),
            ("placed", "rejected"),
            ("placed", "cancelled"),
            ("accepted", "packing"),
            ("accepted", "cancelled"),
            ("packing", "ready"),
            ("packing", "out_for_delivery"),
            ("packing", "cancelled"),
            ("ready", "completed"),
            ("out_for_delivery", "completed"),
            ("out_for_delivery", "failed"),
            ("completed", "refunded"),
        ]:
            StatusTransition.objects.get_or_create(from_code=fc, to_code=tc, defaults={"id": create_id()})

        # 7. Payment Statuses & Method Types
        for code, lbl, tone, order in [
            ("unpaid", "Unpaid", "neutral", 1),
            ("verification_pending", "Awaiting verification", "warning", 2),
            ("paid", "Paid", "success", 3),
            ("rejected", "Payment rejected", "danger", 4),
            ("refunded", "Refunded", "neutral", 5),
            ("pay_on_delivery", "Pay on delivery", "info", 6),
            ("on_khata", "On Khata", "info", 7),
        ]:
            PaymentStatus.objects.get_or_create(code=code, defaults={"label": lbl, "tone": tone, "sort_order": order})

        for code, lbl, enabled_def, order in [
            ("upi", "UPI QR", True, 1),
            ("cash", "Cash", True, 2),
            ("pay_at_pickup", "Pay at Pickup / COD", True, 3),
            ("card", "Card Machine", True, 4),
            ("khata", "Khata (Pay Later)", True, 5),
        ]:
            PaymentMethodType.objects.get_or_create(
                code=code,
                defaults={"label": lbl, "enabled_by_default": enabled_def, "sort_order": order},
            )

        # 8. Notification Types, Channels, Templates
        for code, lbl, crit in [
            ("order.new", "New online order", True),
            ("payment.submitted", "UPI payment reference submitted", True),
            ("payment.confirmed", "Payment confirmed", True),
            ("payment.rejected", "Payment rejected", True),
            ("order.accepted", "Order accepted", True),
            ("order.completed", "Order completed", True),
            ("order.status_changed", "Order status update", False),
            ("order.item_unavailable", "Item unavailable approval needed", True),
            ("order.cancelled", "Order cancelled", True),
            ("stock.low", "Low stock alert", False),
            ("stock.expiring", "Near expiry alert", False),
            ("khata.due", "Khata payment due reminder", False),
            ("khata.payment", "Khata payment recorded", False),
            ("finance.advisor_digest", "Weekly advisor digest", False),
            ("prediction.alert", "Loss prediction alert", False),
            ("ticket.reply", "Support ticket reply", True),
            ("subscription.expiring", "Subscription expiring", True),
            ("system.announcement", "Platform announcement", True),
        ]:
            NotificationType.objects.get_or_create(code=code, defaults={"label": lbl, "is_critical": crit})

        for code, lbl, en, vis in [
            ("in_app", "In-App Notifications", True, True),
            ("whatsapp", "WhatsApp (Future)", False, False),
            ("sms", "SMS (Future)", False, False),
            ("email", "Email (Future)", False, False),
        ]:
            NotificationChannel.objects.get_or_create(
                code=code, defaults={"label": lbl, "enabled": en, "visible_in_ui": vis}
            )

        for tc, tt, bt in [
            ("order.new", "New order {{orderNumber}}", "{{customerName}} placed a {{fulfilment}} order for {{amount}}."),
            ("payment.submitted", "Verify UPI for {{orderNumber}}", "Reference {{referenceNo}} submitted for {{amount}}. Tap to verify."),
            ("payment.confirmed", "Payment confirmed for {{orderNumber}}", "Your UPI payment of {{amount}} was verified by the store."),
            ("payment.rejected", "Payment rejected for {{orderNumber}}", "Reason: {{reason}}. Please resubmit reference or switch payment method."),
            ("order.accepted", "Order {{orderNumber}} accepted", "Store owner accepted your order. Track progress in Track Order."),
            ("order.completed", "Order {{orderNumber}} completed", "Your order has been completed. Thank you for shopping with us!"),
            ("order.status_changed", "Order {{orderNumber}} is {{statusLabel}}", "Your order status moved to {{statusLabel}}."),
            ("order.item_unavailable", "Action needed for {{orderNumber}}", "{{productName}} is unavailable. Please approve the updated total or cancel."),
            ("order.cancelled", "Order {{orderNumber}} cancelled", "Order was cancelled. Reason: {{reason}}."),
            ("stock.low", "Low stock: {{productName}}", "Only {{qty}} {{unit}} left (reorder level {{reorder}})."),
            ("stock.expiring", "Expiring soon: {{productName}}", "Batch {{batch}} expires on {{expiryDate}}."),
            ("khata.due", "Khata balance reminder", "Your Khata balance of {{amount}} is due on cycle day {{cycleDay}}."),
            ("khata.payment", "Khata payment recorded", "Payment of {{amount}} recorded. Updated balance: {{balance}}."),
            ("finance.advisor_digest", "Weekly Profit Advisor", "Top actions ready to protect your store margin."),
            ("prediction.alert", "Risk alert: {{title}}", "{{summary}}"),
            ("ticket.reply", "Reply on ticket: {{subject}}", "{{senderName}} replied: {{snippet}}"),
            ("subscription.expiring", "Plan renewal reminder", "Your {{planName}} plan expires on {{expiryDate}}."),
            ("system.announcement", "{{title}}", "{{body}}"),
        ]:
            MessageTemplate.objects.get_or_create(
                type_code=tc,
                language="en",
                defaults={"id": create_id(), "title_template": tt, "body_template": bt},
            )

        # 9. FAQs
        if not Faq.objects.exists():
            for q, a, cat, order in [
                (
                    "How do customers pay using UPI QR?",
                    "Upload your store UPI QR image or enter your UPI ID in Account > Store Settings > Payments. Customers scan or tap Open UPI App, pay, and submit their transaction reference. You confirm or reject with one tap.",
                    "Payments",
                    1,
                ),
                (
                    "Does POS billing work when the internet disconnects?",
                    "Yes. Bills created while offline are saved locally with a unique idempotency key and sync automatically without duplicates once connectivity returns.",
                    "POS & Offline",
                    2,
                ),
                (
                    "How does Khata credit work?",
                    "Add trusted customers in Khata Book with a credit limit and billing cycle day. If their phone number matches a registered shopper, they can view their live balance and statement inside the Customer Portal.",
                    "Khata Book",
                    3,
                ),
            ]:
                Faq.objects.create(
                    id=create_id(), question=q, answer=a, category=cat, sort_order=order, created_at=now
                )

        # 10. n8n Automation Jobs
        for key, name, trig, act in [
            ("store_welcome", "Store welcome", "store.created", "Create onboarding checklist notification for the owner"),
            ("order_not_accepted", "Order not accepted", "order.created + 10m", "Reminder notification to SMO if order stays placed"),
            ("payment_verification_reminder", "Payment verification reminder", "payment.submitted + 5m", "Reminder to SMO and status prompt if UPI verification pending"),
            ("unpaid_auto_cancel", "Unpaid order auto-cancel", "Every 15m", "Cancel unconfirmed unpaid orders past timeout and release stock"),
            ("low_stock_digest", "Low stock digest", "Daily 08:00", "Summary notification of low and out-of-stock items"),
            ("expiry_damage_prediction", "Expiry & damage prediction", "Daily 07:00", "Run velocity vs expiry predictions and notify high-risk items"),
            ("khata_reminders", "Khata reminders", "Daily 09:00", "Notify linked customers near billing cycle day"),
            ("daily_closing_reminder", "Daily closing reminder", "Daily 21:30", "Prompt store owner to complete daily cash/UPI closing"),
            ("weekly_advisor_digest", "Weekly advisor digest", "Weekly Mon 09:00", "Send top three profit health action cards to SMO"),
            ("subscription_lifecycle", "Subscription lifecycle", "Daily 06:00", "Check plan expiry dates and notify owners"),
            ("support_ticket_sla", "Support ticket SLA", "Every 30m", "Flag open support tickets past SLA deadline"),
            ("account_deletion", "Account deletion grace processor", "Daily 02:00", "Process 30-day grace deletion requests"),
            ("notification_retention", "Notification retention", "Daily 03:00", "Archive notifications older than retention setting"),
            ("health_monitor", "Health monitor", "Every 5m", "Verify API and Supabase PostgreSQL database responsiveness"),
        ]:
            AutomationJob.objects.get_or_create(
                key=key,
                defaults={
                    "name": name,
                    "trigger_desc": trig,
                    "action_desc": act,
                    "enabled": True,
                    "last_status": "idle",
                    "last_message": "Ready",
                },
            )

        # 11. Minimal Seed Users
        User.objects.get_or_create(
            email=admin_email,
            defaults={
                "id": create_id(),
                "role": "super_admin",
                "name": admin_name,
                "phone": None,
                "password_hash": hash_secret(admin_password),
                "pin_hash": None,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        )
        smo_user, _ = User.objects.get_or_create(
            email=smo_email,
            defaults={
                "id": create_id(),
                "role": "smo",
                "name": smo_name,
                "phone": smo_phone,
                "password_hash": hash_secret(smo_password),
                "pin_hash": None,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        )
        User.objects.get_or_create(
            phone=customer_phone,
            defaults={
                "id": create_id(),
                "role": "customer",
                "name": customer_name,
                "email": None,
                "password_hash": None,
                "pin_hash": hash_secret(customer_pin),
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        )

        # 12. Exactly 1 Store for the seeded SMO
        store, store_created = Store.objects.get_or_create(
            slug=store_slug,
            defaults={
                "id": create_id(),
                "owner": smo_user,
                "name": store_name,
                "status": "active",
                "is_open": True,
                "address": "14 Main Market Road, Indiranagar",
                "phone": smo_phone,
                "timings": "07:00 AM - 10:00 PM",
                "brand_color": "#0F766E",
                "delivery_enabled": True,
                "pickup_enabled": True,
                "delivery_fee_paise": 2000,
                "min_order_paise": 10000,
                "delivery_eta_text": "30-45 mins",
                "delivery_radius_km": 5.0,
                "store_lat": 12.9784,
                "store_lng": 77.6408,
                "plan": starter_plan,
                "plan_expires_at": now + timedelta(days=90),
                "docs_verified": True,
                "created_at": now,
                "updated_at": now,
            },
        )

        if store_created:
            for code in ("upi", "cash", "pay_at_pickup", "card", "khata"):
                StorePaymentMethod.objects.get_or_create(
                    store=store,
                    method_code_id=code,
                    defaults={
                        "id": create_id(),
                        "enabled": (code != "upi"),
                        "upi_id": None,
                        "payee_name": store_name,
                        "upi_qr_url": None,
                        "require_reference": True,
                        "updated_at": now,
                    },
                )

        # Master Catalogue templates
        for name, cat, brand, unit, tax, barcode, mrp in [
            ("Sona Masoori Rice 5kg", "Staples & Grains", "Royal Harvest", "pack", 5.0, "8901001000011", 34000),
            ("Toor Dal 1kg", "Staples & Grains", "FarmPure", "kg", 5.0, "8901001000028", 16500),
            ("Sunflower Cooking Oil 1L", "Oils & Ghee", "SunDrop", "litre", 5.0, "8901001000035", 14500),
        ]:
            MasterProduct.objects.get_or_create(
                barcode=barcode,
                defaults={
                    "id": create_id(),
                    "name": name,
                    "category_name": cat,
                    "brand_name": brand,
                    "unit_code": unit,
                    "tax_rate_percent": tax,
                    "mrp_paise": mrp,
                    "created_at": now,
                },
            )

    return True
