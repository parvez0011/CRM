# Akbar Handicrafts CRM

A complete, self-hosted CRM system for **Akbar Handicrafts** covering the full manufacturing and export
workflow: buyers, suppliers, raw materials, bill of materials, production tracking, purchase orders,
export/sales orders, shipments (export documentation), invoices and payments, with a real-time dashboard.

## Tech Stack

- **Backend**: Node.js + Express (plain JavaScript, ES modules)
  - Database: built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) (`DatabaseSync`) — a real SQL
    database with **zero native build dependencies** (no `node-gyp`/Visual Studio build tools required).
    Data is stored in `backend/data/akbar_crm.sqlite`.
  - Auth: JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router + Recharts + Axios

Requires **Node.js v22.5+** (tested on v24). No external database server, Docker, or native compilers needed.

## Features

- **Auth & Roles**: JWT login, role-based access (admin / manager / staff). Only admins manage Users.
- **Buyers (Customers)**: international buyer directory with currency, credit limit, tax ID.
- **Suppliers**: raw material vendor directory.
- **Raw Materials**: stock levels, reorder levels, unit cost, manual stock adjustments, low-stock alerts.
- **Products**: finished handicraft catalog with SKU, HSN code, pricing, and a **Bill of Materials (BOM)**
  editor linking each product to the raw materials (and quantities) required to make it.
- **Production Orders**: track manufacturing jobs through stages (cutting → assembly → finishing →
  quality check → packing → completed). Completing a production order automatically **deducts raw
  material stock** (per BOM) and **adds finished goods stock**.
- **Purchase Orders**: order raw materials from suppliers; marking a PO "received" automatically
  **increases raw material stock**.
- **Export / Sales Orders**: multi-line orders with Incoterms, ports of loading/discharge, currency, and
  a status workflow (draft → confirmed → in production → ready to ship → shipped → delivered). Shipping
  an order automatically **deducts finished goods stock**. Quick actions to start production, create a
  shipment, or generate an invoice directly from the order.
- **Proforma Invoices**: standard pre-shipment export quotations with buyer/consignee details, Incoterm,
  ports of loading/discharge, country of origin, final destination, mode of shipment, partial
  shipment/transshipment flags, a payment-terms dropdown (advance %, L/C at sight, D/P, D/A, Net terms,
  etc.) with free-text override, exporter bank details, and an auto-generated printable document
  (amount spelled out in words, signatory block, print/PDF button). PIs can be progressed
  draft → sent → accepted, or **converted directly into a confirmed Export/Sales Order**.
  - **Import Client PO**: upload a buyer-supplied purchase order (.xlsx, .xls, or **.pdf**) and it is
    automatically matched line-by-line against your product catalog (by SKU, then product name) to
    pre-fill a new Proforma Invoice with the same products, quantities and prices. Matched lines are
    editable before creating the PI; unmatched lines are listed so they can be added manually. PDF
    parsing is text/heuristic-based (layouts vary widely) - Excel is recommended when precision matters.
- **Products - Bulk Upload**: upload your own product catalog via an .xlsx/.xls file (with a downloadable
  template); rows are matched/updated by SKU or inserted as new products.
- **Company Settings** (admin): exporter company profile, GSTIN/IEC/PAN, and bank details that are
  pulled automatically onto every new Proforma Invoice.
- **Shipments**: export logistics tracking (shipping line, container/BL number, ports, ETD/ETA, weights,
  CBM) with a booking → shipped → in transit → delivered workflow that syncs back to the sales order.
  status.
- **Invoices & Payments**: generate invoices linked to export orders, record partial/multiple payments,
  automatic status calculation (unpaid / partial / paid / overdue).
- **Dashboard**: live KPIs, order-status breakdown, production-by-stage chart, revenue trend, top
  products, low-stock alerts, recent orders.

## Getting Started (Windows / PowerShell)

> If PowerShell blocks `npm`/`node` scripts, run this once per terminal:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force`

### 1. Backend

```powershell
cd backend
npm install
npm start
```

The API runs on **http://localhost:4000**. On first run it auto-creates the SQLite database and seeds:
- Default login: **admin@akbarhandicrafts.com** / **admin123**
- Sample buyers, suppliers, materials, products, a BOM, an export order, a purchase order, a production
  order, and an invoice — so the app is immediately explorable.

### 2. Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser and sign in with the default admin credentials above.

The frontend expects the API at `http://localhost:4000/api` by default. To point it elsewhere, create
`frontend/.env` with `VITE_API_URL=http://your-host:4000/api`.

## Project Structure

```
backend/
  src/
    server.js            Express app entry point
    db.js                 SQLite schema + seed data
    middleware/auth.js     JWT auth + role guard
    routes/                One file per resource (customers, products, sales-orders, ...)
    utils/                 CRUD factory, order-number generator, transaction helper
frontend/
  src/
    api/client.ts          Axios instance with JWT interceptor
    context/AuthContext.tsx
    components/            Layout, generic CrudPage, Modal, StatusBadge, ProtectedRoute
    pages/                  One page per module
```

## Notes for Production Use

- Change `JWT_SECRET` in `backend/.env` before deploying.
- The SQLite file in `backend/data/` is the single source of truth — back it up regularly.
- Add HTTPS/reverse proxy (e.g. Nginx) in front of both services for production deployment.

## GoDaddy Node.js Deployment

Deploy the repository root as one Node.js application. The root install automatically installs both
workspaces, builds the frontend, and Express serves the React application and `/api` from one domain.

- Application root: repository root (the directory containing this `README.md` and `package.json`)
- Node.js version: 22.5 or newer
- Startup file: `backend/src/server.js`
- Start command: `npm start`
- Required environment variable: `JWT_SECRET` (use a long random production value)
- Optional environment variable: `PORT` (normally supplied by GoDaddy)

After code changes, redeploy or run `npm install` at the application root so the frontend is rebuilt.
The SQLite database is created at `backend/data/akbar_crm.sqlite`; that directory must be writable and
persistent across application restarts.
