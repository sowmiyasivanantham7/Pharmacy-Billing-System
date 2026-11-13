# PharmaSense – Intelligent Pharmacy Billing System

Pharmacy billing + smart inventory in one web app. Built for **CSB1303 – Object Oriented Analysis & Design**.

**Stack:** HTML / CSS / JavaScript (no build step) · Python Flask REST API · MySQL
**Roles:** Admin and Employee (role-based access, hashed passwords, audit trail)

---

## What makes it different

| # | Feature | What it does |
|---|---------|--------------|
| 1 | **Smart FEFO billing** | Sells from the earliest-expiry valid batch, skips expired batches, and splits one sale across batches (e.g. 130 tablets = 80 + 50). Bills save completely or not at all. Row locks stop two cashiers overselling the same batch. |
| 2 | **Expiry-risk radar** | Predicts whether each batch will *actually sell before it expires* (using demand and FEFO order), not just how close the date is. Gives High / Medium / Low / Expired and the **estimated ₹ loss**. |
| 3 | **Demand forecast + reorder advisor** | Recent-weighted daily demand → 30-day forecast → suggested order quantity → printable draft **purchase order** with estimated cost. |
| 4 | **Smart clearance pricing** | For batches that will not sell in time, suggests a discount (10–40% by days left, never below cost). One click applies it, and billing uses it automatically. |
| 5 | **Drug-interaction check** | Warns at billing when medicines clash with each other **or with what the same customer bought in the last 30 days**. Major interactions block the bill until the pharmacist confirms (logged). |
| 6 | **Same-salt substitutes** | When a medicine is short or out of stock, suggests in-stock alternatives with the same active salt, cheapest first, one click to swap. |
| 7 | **Prescription verification + Rx register** | Doctor's name (and reg. no.) mandatory for Rx-only medicines; stored with the customer and sale; printable dispensing register. |
| 8 | **Returns & credit notes** | Partial returns, stock goes back to the *original batch* (or is written off if damaged). |
| 9 | **Refill reminders** | Finds regular patients whose monthly medicine is due and opens a ready-made WhatsApp message (nothing is sent automatically). |
| 10 | **GST-aware invoices** | MRP-inclusive pricing with GST breakup, batch and expiry on every line, printable. |
| 11 | **Audit log** | Logins, failed logins, sales, returns, price/stock changes, clearance, interaction confirmations. |

---

## Quick start (Windows 10/11, VS Code)

1. Install **Python 3.10+** and **MySQL 8**.
2. Open the project folder in VS Code and a terminal:
   ```bat
   py -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   copy .env.example .env
   ```
3. Edit `.env` and set your MySQL password in `DATABASE_URL`.
4. Create the database (either way works):
   ```bat
   mysql -u root -p < database\schema.sql
   ```
   or just `CREATE DATABASE pharmasense;` and the app creates the tables itself.
5. Load demo data and run:
   ```bat
   python backend\seed.py --reset
   python backend\app.py
   ```
6. Open **http://localhost:5000**

**No MySQL handy?** In `.env` use `DATABASE_URL=sqlite:///pharmasense.db` – everything works the same.

### Demo logins
| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `Admin@123` |
| Employee | `sowmiya` | `Staff@123` |
| Employee | `kumar` | `Staff@123` |

Change these before any real use (top-left → *Change password*).

---

## 6-minute demo script for the review

The seed data is built so every feature has something to show.

1. **Smart FEFO** – *New Bill* → add **Dolo 650**, quantity **130**. The batch plan shows **120 from the earlier-expiry batch + 10 from the next**. Generate the bill and open the invoice (batch and expiry on each line).
2. **Out of stock → substitute** – search **Pan 40** (out of stock) → *Substitutes* → **Pantocid 40** (same salt, cheaper).
3. **Interaction safety** – add **Warfarin 5mg** + **Ecosprin 75**. A red *Major interaction* banner appears; *Generate* asks the pharmacist to confirm.
4. **Prescription rule** – with Warfarin in the cart, the doctor's name and customer details become mandatory.
5. **Inventory Analysis** (admin) – **Cetzine** has an expired batch (never sold), **Benadryl** and **Limcee** are *High* risk with an estimated loss. Open **Limcee** → *Apply 10% clearance*.
6. **Reorder List** → printable purchase order. **Refills** → WhatsApp reminder. **Sales History** → open a bill → *Return items* → credit note, stock restored.
7. Sign in as an **Employee**: no admin menus, no cost prices, only their own bills.

---

## How the intelligence works

**Smart FEFO** (`backend/services/fefo.py`)
```
batches = in-stock, not expired, ordered by expiry date (ties: oldest first)
for each batch: take = min(batch.qty, remaining); remaining -= take
if remaining > 0 -> reject the whole bill (nothing is saved), suggest substitutes
```

**Demand** (`services/analytics.py`) – units/day over the last 60 days, with the most recent 14 days counted twice so rising or fading demand shows up quickly. Returns are netted out.

**Expiry risk per batch** – batches sell in FEFO order, so for batch *k*:
```
sellable_before_expiry = max(0, demand × days_left − units_in_earlier_batches)
unsold                 = max(0, batch_qty − sellable_before_expiry)
loss                   = unsold × cost_price
High    if days_left ≤ 30  or  unsold ≥ 50% of the batch
Medium  if days_left ≤ 90  or  unsold > 0
Low     otherwise          (Expired if the date has passed)
```

**Reorder** – `suggested = forecast_30d + reorder_level − (stock that will sell before expiry)`.

All thresholds live in `backend/config.py`.

---

## Project structure

```
pharmasense/
├── backend/
│   ├── app.py                  Flask app factory + static hosting
│   ├── config.py               DB URL and business-rule thresholds
│   ├── models.py               SQLAlchemy models (the class diagram)
│   ├── seed.py                 Demo data + 60 days of sales history
│   ├── routes/                 REST API (auth_admin, catalog, sales, insights)
│   ├── services/               fefo.py, billing.py, analytics.py, safety.py
│   └── tests/                  15 automated tests (pytest)
├── frontend/                   index.html, css/style.css, js/*.js (single-page app)
├── database/schema.sql         MySQL tables + 3 reporting views
├── requirements.txt
└── .env.example
```

## OOAD mapping (for your report)

| Class diagram | Implementation |
|---------------|----------------|
| Customer, Prescription, Sale, SaleItem, Medicine, Batch | tables of the same names in `models.py` |
| Pharmacist / Employee, Admin | `users.role` + decorators in `routes/common.py` |
| InventoryAnalyzer | `services/analytics.analyse()` |
| ExpiryRiskAnalyzer | per-batch risk in `analyse()` |
| DemandPredictor | `analytics.demand_rates()` |
| ReorderAdvisor | `reorder_qty` + `/api/insights/reorder` |
| LossEstimator | `unsold × cost_price` per batch |
| `Sale.calculateTotal()`, `Batch.calculateExpiryRisk()` | `services/billing.py`, `analytics.py` |

Design choice: SaleItem is stored **per batch slice**, so invoices and returns always know exactly which batch a unit came from.

## REST API (all JSON, session-cookie auth)

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/auth/login` · `logout` · `GET /api/auth/me` · `POST change-password` |
| Catalog | `GET/POST /api/medicines` · `PUT /api/medicines/<id>` · `GET .../batches` · `GET .../substitutes` · `POST /api/batches` · `POST /api/batches/<id>/discount` |
| Billing | `POST /api/billing/preview` · `POST /api/sales` · `GET /api/sales[/<id>]` · `POST /api/sales/<id>/return` |
| Insights | `GET /api/insights/dashboard` · `inventory` (admin) · `reorder` (admin) · `refills` |
| Admin | `/api/employees` · `/api/interactions` · `/api/rx-register` · `/api/audit` |

## Tests

```bash
cd backend
python -m pytest -q
```
Covers FEFO ordering, batch splitting, expired-stock exclusion, all-or-nothing billing, prescription rules, interaction blocking, returns, role access, disabled accounts and the analytics.

## Honest limitations

- The interaction rules are a small **educational** starter set, not a clinical database. Real use needs a licensed drug reference.
- The forecast is a weighted moving average: transparent and explainable, but it does not model seasonality.
- Add HTTPS, a strong `SECRET_KEY` and a login rate-limit before putting it on a network.

## Future work

SMS/WhatsApp API integration, supplier & purchase-order tracking, barcode scanning, seasonal forecasting, multi-store stock transfer.
