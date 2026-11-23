# Galli Smartkottu

QR-code based multi-store digital supermarket management platform with three separate portals:

- **Customer Storefront (`/store/:slug`)**: Guest browsing without login, offers carousel, categories, search, per-store cart, 3-step checkout (Fulfilment -> Phone & 4–6 digit PIN -> UPI QR/`upi://` / Pay at Pickup / COD / Khata), live order tracking, delivery handover PIN, item-unavailable approval, chat, and Khata statement.
- **Super Market Owner & Staff Portal (`/owner`)**: Fast offline-capable Counter POS (with idempotency-protected local queue sync, held bills, loose weights, Cash change calculator, UPI QR, Card, Khata limit override), Live Online Orders Inbox with UPI payment verification & packing checklist, Inventory & Master Catalogue quick-add & Excel/CSV import/export, Financial Reconciliation & Profit Advisor (blocked for `staff`), Khata Book ledger, and Store Settings / QR Poster / Staff / Support & FAQs.
- **Super Admin Portal (`/admin`)**: Platform control tower, store onboarding wizard, suspend/reactivate, plans, master catalogue, dynamic platform configuration (app name, currency, order statuses, FAQs, feature flags), support desk, audit logs, 30-day deletion queue, and n8n automation console.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite, `lucide-react`
- **Backend**: Python, Django, Django REST Framework (DRF), Django Channels + Uvicorn (WebSocket `/ws`)
- **Database**: Supabase (Managed PostgreSQL via `psycopg` & `dj-database-url`)

## Setup & Running Locally

### 1. Configure Supabase Environment
Copy `.env.example` to `.env` and set your Supabase PostgreSQL connection URI:
```env
DATABASE_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-DB-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"
```
*(Get this from your Supabase Dashboard -> **Project Settings -> Database -> Connection string -> URI**.)*

### 2. Backend Setup (Django + DRF + Supabase)
```powershell
cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt

# Apply migrations to Supabase PostgreSQL
python manage.py migrate

# Seed initial platform config, 1 Super Admin, 1 SMO + Store, 1 Customer
python manage.py seed_db

# Start Django ASGI server (REST API + WebSockets on port 8000)
python -m uvicorn galli_backend.asgi:application --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup (React + Vite)
In a second terminal at the project root:
```powershell
npm install
npm run dev
```
Open `http://localhost:3000`. Vite proxies `/api/*` and `/ws` directly to Django on port `8000`.

### Production Build
```powershell
npm run build
```
Then run Django with `DJANGO_DEBUG=false`:
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn galli_backend.asgi:application --host 0.0.0.0 --port 8000
```

## Architecture

- `backend/` — Django + DRF REST API (`/api/v1/*`), Supabase PostgreSQL ORM models & migrations (`api/models.py`, `api/migrations/`), Django Channels WebSocket (`/ws`) realtime broadcast hub (`api/realtime.py`), and modular domain services (`api/services/`).
- `src/shared/` — Design tokens, i18n context, auth/realtime/bootstrap hooks, REST client with offline & 401 handling, and reusable UI/form/feedback/layout components.
- `src/portals/super-admin/`, `src/portals/smo/`, `src/portals/customer/` — Isolated portals with no cross-portal imports.

## End-to-End Application Flow (UML Diagram)

The following UML flowchart illustrates the complete lifecycle from **Super Admin** to **Store Owner (SMO)** to **Customer**, highlighting all decision gates, pass/fail validations, notifications, and real-time state transitions:

```mermaid
flowchart TD
    %% ---------------------------------------------------------
    %% SUBGRAPH 1: SUPER ADMIN PORTAL
    %% ---------------------------------------------------------
    subgraph ADMIN["1. Super Admin Tier (Platform Governance)"]
        A1["Admin Access /admin/login"] --> A2{"Valid Admin Credentials?"}
        A2 -- "False" --> A3["Show Login Error / Access Denied"]
        A2 -- "Pass" --> A4["Open Super Admin Dashboard"]
        
        A4 --> A5["Store Onboarding Wizard"]
        A5 --> A6{"Validate Store & Slug Uniqueness?"}
        A6 -- "False" --> A7["Display Validation Error (Duplicate Slug / Missing Fields)"]
        A7 --> A5
        A6 -- "Pass" --> A8["Provision Store & Generate Unique QR Code"]
        
        A8 --> A9{"Store Compliance & Plan Active?"}
        A9 -- "False" --> A10["Suspend Store (Storefront Blocked)"]
        A9 -- "Pass" --> A11["Activate Storefront & Owner Account"]
    end

    %% ---------------------------------------------------------
    %% SUBGRAPH 2: STORE OWNER & STAFF PORTAL (SMO)
    %% ---------------------------------------------------------
    subgraph SMO["2. Store Owner / Staff Tier (Operations & Fulfillment)"]
        S1["Owner Access /owner/login"] --> S2{"Valid Store Credentials & Store Active?"}
        S2 -- "False" --> S3["Reject Login / Display Suspension Notice"]
        S2 -- "Pass" --> S4["Open SMO Portal"]

        S4 --> S5["Catalogue & Stock Management"]
        S5 --> S6{"Check Batch Expiry & Reorder Level?"}
        S6 -- "False (Low Stock)" --> S7["Trigger Low-Stock / Near-Expiry Alert"]
        S6 -- "Pass (Healthy)" --> S8["Catalogue Ready & Synced Online"]
        
        S4 --> S9["Set Store Status: Open / Closed"]
        
        %% In-Store POS Channel
        S4 --> S10["In-Store Counter POS Billing"]
        S10 --> S11{"Internet Connection Available?"}
        S11 -- "False" --> S12["Store in Offline Queue (LocalStorage)"]
        S12 --> S13["Auto-Sync with Idempotency Key when Reconnected"]
        S11 -- "Pass" --> S14["Process Instant Counter Bill & Deduct Stock"]
        S13 --> S14
        
        %% Online Order Processing
        S15["Receive Incoming Online Order"] --> S16{"Accept Customer Order?"}
        S16 -- "False (Rejected)" --> S17["Cancel Order (Stock Released)"]
        S16 -- "Pass (Accepted)" --> S18["Status -> Accepted\n(Notification 1 sent to Customer)"]
        
        S18 --> S19["Order Packing & Item Checklist"]
        S19 --> S20{"All Order Items In Stock?"}
        S20 -- "False" --> S21["Mark Item Unavailable / Substitute\n(Customer Decides in Tracker)"]
        S20 -- "Pass" --> S22["Mark Order Items Packed"]
        
        S22 --> S23{"Payment Method is UPI?"}
        S23 -- "Pass" --> S24{"Verify UPI Reference / Payment Proof?"}
        S24 -- "False" --> S25["Reject Payment -> Prompt Customer Resubmit or Cash"]
        S24 -- "Pass" --> S26["Confirm Payment -> Set Status: Paid"]
        S23 -- "False (Cash / Khata)" --> S27["Pay on Handover / Khata Balance Added"]
        
        S26 --> S28["Order Handover / Dispatch"]
        S27 --> S28
        
        S28 --> S29{"Fulfilment Type?"}
        S29 -- "Pickup" --> S30["Customer Enters Pickup Code at Counter"]
        S29 -- "Delivery" --> S31["Driver Delivers within Delivery Radius"]
        
        S30 --> S32["Status -> Completed\n(Notification 2 sent to Customer)"]
        S31 --> S32
        S32 --> S33["Close Order -> Chat Option Disabled"]
    end

    %% ---------------------------------------------------------
    %% SUBGRAPH 3: CUSTOMER STOREFRONT
    %% ---------------------------------------------------------
    subgraph CUSTOMER["3. Customer Storefront Tier (Browsing, Checkout & Tracking)"]
        C1["Scan QR / Visit /store/:slug"] --> C2{"Store Exists & Open?"}
        C2 -- "False" --> C3["Show 'Store Closed' or 404 Notice"]
        C2 -- "Pass" --> C4["Browse Home & Catalog (Products/Offers)"]
        
        C4 --> C5["Add Products to Cart"]
        C5 --> C6{"Items Available in Stock?"}
        C6 -- "False" --> C7["Show 'Out of Stock' Badge"]
        C6 -- "Pass" --> C8["Update Cart -> Floating Cart Bar Visible"]
        
        C8 --> C9["Proceed to Checkout"]
        C9 --> C10{"Cart Meets Minimum Order?"}
        C10 -- "False" --> C11["Prompt Minimum Order Threshold"]
        C10 -- "Pass" --> C12["Select Fulfilment (Pickup / Delivery)"]
        
        C12 --> C13{"Delivery Selected?"}
        C13 -- "Pass" --> C14{"Customer Address Within Store Radius?"}
        C14 -- "False" --> C15["Block Delivery -> Prompt Store Pickup"]
        C14 -- "Pass" --> C16["Proceed to Customer Auth"]
        C13 -- "False (Pickup)" --> C16
        
        C16 --> C17["Enter Phone & PIN"]
        C17 --> C18{"PIN Authenticated?"}
        C18 -- "False" --> C19["Display PIN Error (Retry Allowed)"]
        C19 --> C17
        C18 -- "Pass" --> C20["Select Payment Method (UPI / Cash / Khata)"]
        
        C20 --> C21{"Select Khata Credit?"}
        C21 -- "Pass" --> C22{"Khata Account Approved & Within Limit?"}
        C22 -- "False" --> C23["Block Khata -> Select UPI or Cash"]
        C23 --> C20
        C22 -- "Pass" --> C24["Place Order with Khata Credit"]
        C21 -- "False" --> C24
        
        C24 --> C25["Order Placed -> Reserved Stock Deducted"]
        C25 --> S15

        %% Real-time Tracking
        C25 --> C26["Open /orders/:orderId (Track Order Module)"]
        C26 --> C27{"Handle In-Order Chat with Store?"}
        C27 -- "Order In-Progress" --> C28["In-Order Chat Enabled\n(Messages Kept under Order Only)"]
        C27 -- "Order Completed" --> C29["Chat Input Disabled (Closed Banner)"]
        
        C26 --> C30["Live Status Timeline Updates via WebSockets"]
        S18 -. "Push Notification 1" .-> C30
        S32 -. "Push Notification 2" .-> C30
    end

    %% Cross-Tier Connections
    A11 ==> S1
    S8 ==> C4
    C21 -. "Submits Reference" .-> S24
    S21 -. "Approve / Cancel in Tracker" .-> C26
```

### UML Decision Gate Key

| Decision Node | Condition Evaluated | Pass Path | False Path |
| :--- | :--- | :--- | :--- |
| **Valid Admin Credentials?** | Check email/password & role in JWT auth service | Access Super Admin dashboard | Reject with 401 Unauthorized |
| **Validate Store & Slug?** | Check unique store slug & required onboarding fields | Store & QR code provisioned | Return validation errors |
| **Store Compliance & Plan?** | Verify active plan subscription & platform policies | Activate public storefront | Suspend store (banner shown) |
| **Batch Expiry & Reorder?** | Inspect inventory stock levels & expiry dates | Keep active in catalogue | Trigger low-stock / expiry alert |
| **Internet Available (POS)?** | Check browser online/offline status | Process instant POS bill | Queue in LocalStorage for sync |
| **Accept Customer Order?** | Store owner accepts or rejects order | Send *Order Accepted* notification | Cancel order & release stock |
| **Items in Stock (Pack)?** | Packing checklist item availability | Mark all items packed | Prompt customer substitution |
| **Verify UPI Payment?** | Verify customer reference & receipt image | Confirm payment (`paid`) | Reject UPI proof, prompt retry |
| **Store Exists & Open?** | Check store slug validity & `isOpen` status | Render Storefront | Show closed banner / 404 |
| **Meets Minimum Order?** | Cart subtotal vs store `minOrderPaise` | Proceed to checkout | Block checkout until threshold met |
| **Within Delivery Radius?** | Customer GPS distance vs store `deliveryRadiusKm` | Allow delivery | Restrict to store pickup |
| **PIN Authenticated?** | Phone & 4-6 digit customer PIN verification | Authorize order placement | Display invalid PIN message |
| **Khata Within Limit?** | Customer Khata status & balance vs credit limit | Charge to Khata ledger | Block credit, prompt UPI/Cash |
| **Order Status Terminal?** | Check if order status is `completed` or `cancelled` | Disable in-order chat | Keep chat enabled |

<!-- ## Seeded Logins (See `.env.example`)

All seeded defaults can be overridden via environment variables before running `python manage.py seed_db`:

- **Super Admin**: `admin@gallismartkottu.local` / `Admin@2026!`
- **Super Market Owner**: `9876543210` (or `owner@gallifresh.local`) / `Owner@2026!` (Store slug: `galli-fresh-mart`)
- **Customer**: `9123456789` / PIN `1234` -->
