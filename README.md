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

<!-- ## Seeded Logins (See `.env.example`)

All seeded defaults can be overridden via environment variables before running `python manage.py seed_db`:

- **Super Admin**: `admin@gallismartkottu.local` / `Admin@2026!`
- **Super Market Owner**: `9876543210` (or `owner@gallifresh.local`) / `Owner@2026!` (Store slug: `galli-fresh-mart`)
- **Customer**: `9123456789` / PIN `1234` -->
