// Database setup using Node's built-in SQLite (node:sqlite) - no native build tools required.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'akbar_crm.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- admin, manager, staff
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  country TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT,
  currency TEXT DEFAULT 'USD',
  credit_limit REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  country TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  materials_supplied TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_cost REAL NOT NULL DEFAULT 0,
  stock_qty REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  hsn_code TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_price REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  stock_qty REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  qty_required REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS production_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  sales_order_id INTEGER REFERENCES sales_orders(id) ON DELETE SET NULL,
  qty REAL NOT NULL,
  stage TEXT NOT NULL DEFAULT 'cutting', -- cutting, assembly, finishing, quality_check, packing, completed
  status TEXT NOT NULL DEFAULT 'planned', -- planned, in_progress, quality_check, completed, cancelled
  start_date TEXT,
  due_date TEXT,
  completed_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft, ordered, received, cancelled
  order_date TEXT,
  expected_date TEXT,
  received_date TEXT,
  currency TEXT DEFAULT 'INR',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id),
  qty REAL NOT NULL,
  rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft, confirmed, in_production, ready_to_ship, shipped, delivered, cancelled
  order_date TEXT,
  delivery_date TEXT,
  incoterm TEXT,
  currency TEXT DEFAULT 'USD',
  port_of_loading TEXT,
  port_of_discharge TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_no TEXT UNIQUE NOT NULL,
  sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
  shipping_line TEXT,
  container_no TEXT,
  bl_number TEXT,
  port_of_loading TEXT,
  port_of_discharge TEXT,
  etd TEXT,
  eta TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, booked, shipped, in_transit, delivered
  gross_weight REAL,
  net_weight REAL,
  cbm REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  sales_order_id INTEGER REFERENCES sales_orders(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_date TEXT,
  due_date TEXT,
  currency TEXT DEFAULT 'USD',
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid, partial, paid, overdue
  invoice_type TEXT NOT NULL DEFAULT 'commercial',
  customer_po_id INTEGER REFERENCES customer_purchase_orders(id) ON DELETE SET NULL,
  proforma_invoice_id INTEGER REFERENCES proforma_invoices(id) ON DELETE SET NULL,
  payment_transaction_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL DEFAULT (date('now')),
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL, -- material, product
  item_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL, -- in, out
  qty REAL NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row table holding the exporter's own company/bank details for use on PI/invoice documents.
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'Akbar Handicrafts',
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'India',
  email TEXT,
  phone TEXT,
  gstin TEXT,
  iec_code TEXT,
  pan TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_no TEXT,
  bank_ifsc TEXT,
  bank_swift TEXT,
  bank_address TEXT,
  authorized_signatory TEXT
);

-- The buyer's own commercial Purchase Order. Parent of one or more Proforma Invoices - a single
-- customer PO is typically fulfilled across several partial PIs/containers.
CREATE TABLE IF NOT EXISTS customer_purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft, received, under_review, approved, in_progress, completed, cancelled
  po_date TEXT,
  delivery_date TEXT,
  currency TEXT DEFAULT 'USD',
  payment_terms TEXT,
  incoterm TEXT,
  destination TEXT,
  port_of_loading TEXT,
  buyer_reference TEXT,
  salesperson TEXT,
  advance_payment_amount REAL NOT NULL DEFAULT 0,
  advance_payment_paid INTEGER NOT NULL DEFAULT 0,
  advance_payment_transaction_number TEXT,
  remaining_payment_paid INTEGER NOT NULL DEFAULT 0,
  remaining_payment_transaction_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_po_id INTEGER NOT NULL REFERENCES customer_purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  description TEXT,
  hsn_code TEXT,
  unit TEXT,
  qty REAL NOT NULL,
  rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS proforma_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pi_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sales_order_id INTEGER REFERENCES sales_orders(id) ON DELETE SET NULL,
  customer_po_id INTEGER REFERENCES customer_purchase_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sent, accepted, cancelled
  pi_date TEXT,
  validity_date TEXT,
  currency TEXT DEFAULT 'USD',
  incoterm TEXT,
  port_of_loading TEXT,
  port_of_discharge TEXT,
  country_of_origin TEXT DEFAULT 'India',
  final_destination TEXT,
  shipment_mode TEXT DEFAULT 'Sea Freight', -- Sea Freight, Air Freight, Sea/Air, Courier, Road
  partial_shipment TEXT DEFAULT 'Not Allowed', -- Allowed, Not Allowed
  transshipment TEXT DEFAULT 'Not Allowed', -- Allowed, Not Allowed
  payment_terms TEXT,
  bank_details TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proforma_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proforma_invoice_id INTEGER NOT NULL REFERENCES proforma_invoices(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_po_item_id INTEGER REFERENCES customer_purchase_order_items(id) ON DELETE SET NULL,
  description TEXT,
  hsn_code TEXT,
  qty REAL NOT NULL,
  unit TEXT,
  rate REAL NOT NULL DEFAULT 0
);

-- Export container consolidating one or more accepted Proforma Invoices for shipping.
CREATE TABLE IF NOT EXISTS containers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  container_no TEXT UNIQUE NOT NULL,
  container_type TEXT DEFAULT '40HC', -- 20ft, 40ft, 40HC, LCL
  status TEXT NOT NULL DEFAULT 'planning', -- planning, booked, loading, shipped, in_transit, delivered
  shipping_line TEXT,
  booking_no TEXT,
  bl_number TEXT,
  port_of_loading TEXT,
  port_of_discharge TEXT,
  etd TEXT,
  eta TEXT,
  max_cbm REAL DEFAULT 58,
  max_weight_kg REAL DEFAULT 26000,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Links a container to the Proforma Invoices (and/or export orders) being consolidated into it.
CREATE TABLE IF NOT EXISTS container_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  proforma_invoice_id INTEGER REFERENCES proforma_invoices(id) ON DELETE CASCADE,
  sales_order_id INTEGER REFERENCES sales_orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipping_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL, -- Ocean Freight, Insurance, Customs Clearance, Agent Commission, Inland Transport, Documentation, Other
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A commercial invoice can consolidate several PIs; retain every source PI for P&L and payment allocation.
CREATE TABLE IF NOT EXISTS invoice_proforma_invoices (
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  proforma_invoice_id INTEGER NOT NULL REFERENCES proforma_invoices(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, proforma_invoice_id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT,
  hsn_code TEXT,
  qty REAL NOT NULL,
  unit TEXT,
  rate REAL NOT NULL DEFAULT 0
);

-- Audit trail: who did what to which entity, with a before/after snapshot for financial/status changes.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- QC: only inspected/passed quantities may proceed to packing/shipping.
CREATE TABLE IF NOT EXISTS qc_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  qty_inspected REAL NOT NULL DEFAULT 0,
  qty_passed REAL NOT NULL DEFAULT 0,
  qty_failed REAL NOT NULL DEFAULT 0,
  qty_rework REAL NOT NULL DEFAULT 0,
  defect_notes TEXT,
  inspector TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, passed, failed, rework_required, recheck, closed
  inspected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- General expenses (labour/transport/customs/bank charges/etc.) allocable to a PI/Customer PO/Production Order.
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_no TEXT UNIQUE NOT NULL,
  expense_date TEXT,
  category TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  tax REAL NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- proforma_invoice, customer_po, production_order
  target_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Lightweight migrations: add columns that may be missing on a database created by an
// earlier version of the schema (CREATE TABLE IF NOT EXISTS above only helps brand-new DBs).
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('products', 'labour_cost', 'REAL NOT NULL DEFAULT 0');
ensureColumn('products', 'labour_cost_category', 'TEXT');
ensureColumn('products', 'labour_cost_mode', "TEXT NOT NULL DEFAULT 'fixed'");
ensureColumn('products', 'labour_cost_per_kg', 'REAL NOT NULL DEFAULT 0');
ensureColumn('products', 'finishing_cost', 'REAL NOT NULL DEFAULT 0');
ensureColumn('products', 'packaging_cost', 'REAL NOT NULL DEFAULT 0');
ensureColumn('production_orders', 'qc_status', "TEXT NOT NULL DEFAULT 'pending'"); // pending, passed, failed
ensureColumn('production_orders', 'qc_notes', 'TEXT');
ensureColumn('production_orders', 'packaging_notes', 'TEXT');
ensureColumn('production_orders', 'cartons_count', 'REAL');
ensureColumn('invoices', 'container_id', 'INTEGER REFERENCES containers(id)');
ensureColumn('invoices', 'invoice_type', "TEXT NOT NULL DEFAULT 'commercial'");
ensureColumn('invoices', 'customer_po_id', 'INTEGER REFERENCES customer_purchase_orders(id) ON DELETE SET NULL');
ensureColumn('invoices', 'proforma_invoice_id', 'INTEGER REFERENCES proforma_invoices(id) ON DELETE SET NULL');
// weight_kg (per unit) + material_type (e.g. Aluminum/Iron/Resin, matched against materials.category)
// drive the quick weight-based manufacturing cost estimate used on the Proforma Invoice list.
ensureColumn('products', 'weight_kg', 'REAL NOT NULL DEFAULT 0');
ensureColumn('products', 'material_type', 'TEXT');
ensureColumn('products', 'finish_type', 'TEXT');
ensureColumn('products', 'packaging_type', 'TEXT');
ensureColumn('products', 'box_dimension', 'TEXT');
ensureColumn('products', 'box_weight', 'REAL NOT NULL DEFAULT 0');
// NULL = shared/generic catalog item; set = private to that buyer's own product catalog.
ensureColumn('products', 'customer_id', 'INTEGER REFERENCES customers(id) ON DELETE SET NULL');
// Links a PI (and its items) back to the buyer's own commercial PO, so a PO can be fulfilled by
// several partial PIs while remaining quantity/value is always computable.
ensureColumn('proforma_invoices', 'customer_po_id', 'INTEGER REFERENCES customer_purchase_orders(id) ON DELETE SET NULL');
ensureColumn('proforma_invoice_items', 'customer_po_item_id', 'INTEGER REFERENCES customer_purchase_order_items(id) ON DELETE SET NULL');
// The rate/cost in effect at the moment of each stock movement, so the inventory ledger shows a
// true historical trail and weighted-average costing can be recomputed independent of the
// material's current (possibly later-changed) unit_cost.
ensureColumn('inventory_movements', 'unit_cost', 'REAL');
// Pieces packed per carton - drives Packing List carton counts and per-carton net/gross weight.
ensureColumn('products', 'units_per_carton', 'REAL NOT NULL DEFAULT 1');
// Shipping-specific fields shown on the Packing List document - persisted on the PI itself so the
// generated document is stable/reprintable rather than re-entered every time it's opened.
ensureColumn('proforma_invoices', 'pre_carriage_by', 'TEXT');
ensureColumn('proforma_invoices', 'place_of_receipt', 'TEXT');
ensureColumn('proforma_invoices', 'vessel_flight_no', 'TEXT');
ensureColumn('proforma_invoices', 'notify_party', 'TEXT');
ensureColumn('proforma_invoices', 'packing_list_other_reference', 'TEXT');
ensureColumn('customer_purchase_orders', 'advance_payment_amount', 'REAL NOT NULL DEFAULT 0');
ensureColumn('customer_purchase_orders', 'advance_payment_paid', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('customer_purchase_orders', 'advance_payment_transaction_number', 'TEXT');
ensureColumn('customer_purchase_orders', 'remaining_payment_paid', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('customer_purchase_orders', 'remaining_payment_transaction_number', 'TEXT');
ensureColumn('invoices', 'payment_transaction_number', 'TEXT');
// Some buyers require a simplified PI item table (SKU / Item Title / Ordered / Unit Cost / Cost)
// instead of the standard Description/HSN/Qty/Unit/Rate/Amount format. 'standard' is the default.
ensureColumn('customers', 'pi_item_format', "TEXT NOT NULL DEFAULT 'standard'");

// Commercial invoices created before PI links existed can be restored only when the container,
// buyer, and currency match, and the PI was linked before the invoice was issued.
db.exec(`
  INSERT OR IGNORE INTO invoice_proforma_invoices (invoice_id, proforma_invoice_id)
  SELECT i.id, co.proforma_invoice_id
  FROM invoices i
  JOIN container_orders co ON co.container_id = i.container_id
  JOIN proforma_invoices pi ON pi.id = co.proforma_invoice_id
  WHERE i.invoice_type = 'commercial'
    AND pi.customer_id = i.customer_id
    AND pi.currency = i.currency
    AND date(co.created_at) <= date(i.invoice_date)
`);

db.prepare(`
  UPDATE products
  SET labour_cost_category = CASE UPPER(TRIM(category))
    WHEN 'INHOUSE' THEN 'INHOUSE'
    WHEN 'POLISH ITEM' THEN 'POLISH ITEM'
    WHEN 'OUTSOURCE' THEN 'OUTSOURCED'
    WHEN 'OUTSOURCED' THEN 'OUTSOURCED'
  END
  WHERE labour_cost_category IS NULL
    AND UPPER(TRIM(category)) IN ('INHOUSE', 'POLISH ITEM', 'OUTSOURCE', 'OUTSOURCED')
`).run();

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run('Akbar Admin', 'admin@akbarhandicrafts.com', hash, 'admin');
  }

  const customerCount = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  if (customerCount === 0) {
    const insertCustomer = db.prepare(
      `INSERT INTO customers (name, company, country, email, phone, address, tax_id, currency, credit_limit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertCustomer.run('John Miller', 'Miller Home Decor LLC', 'USA', 'john@millerdecor.com', '+1-212-555-0110', '221 Baker Street, NY', 'US-TAX-8821', 'USD', 50000, 'Prefers sea freight, FOB terms');
    insertCustomer.run('Sophie Laurent', 'Maison Laurent', 'France', 'sophie@maisonlaurent.fr', '+33-1-4455-6677', '12 Rue de Paris, Paris', 'FR-TAX-2291', 'EUR', 30000, 'Regular buyer of brass items');
    insertCustomer.run('Hiroshi Tanaka', 'Tanaka Trading Co.', 'Japan', 'hiroshi@tanakatrading.jp', '+81-3-1234-5678', 'Shibuya, Tokyo', 'JP-TAX-5541', 'JPY', 2000000, 'Quality conscious, needs strict QC reports');

    const insertSupplier = db.prepare(
      `INSERT INTO suppliers (name, company, country, email, phone, address, materials_supplied, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertSupplier.run('Ramesh Kumar', 'Kumar Brass Works', 'India', 'ramesh@kumarbrass.in', '+91-98765-43210', 'Moradabad, UP, India', 'Brass sheets, brass rods', 'Reliable, 15 day lead time');
    insertSupplier.run('Anita Textiles', 'Anita Textile Suppliers', 'India', 'anita@anitatextiles.in', '+91-91234-56789', 'Jodhpur, Rajasthan, India', 'Cotton fabric, jute fabric', 'Bulk discounts available');
    insertSupplier.run('Suresh Wood Traders', 'Suresh Wood Traders', 'India', 'suresh@woodtraders.in', '+91-99887-66554', 'Saharanpur, UP, India', 'Mango wood, sheesham wood', 'Seasonal availability');

    const insertMaterial = db.prepare(
      `INSERT INTO materials (name, category, unit, unit_cost, stock_qty, reorder_level, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertMaterial.run('Brass Sheet 2mm', 'Metal', 'kg', 650, 500, 100, 1);
    insertMaterial.run('Mango Wood Block', 'Wood', 'pcs', 180, 300, 60, 3);
    insertMaterial.run('Cotton Fabric', 'Textile', 'meter', 90, 800, 150, 2);
    insertMaterial.run('Jute Fabric', 'Textile', 'meter', 60, 400, 100, 2);
    insertMaterial.run('Iron Rod 6mm', 'Metal', 'kg', 85, 600, 120, 1);

    const insertProduct = db.prepare(
      `INSERT INTO products (sku, name, category, description, hsn_code, unit, unit_price, currency, stock_qty, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertProduct.run('AH-BR-001', 'Brass Handicraft Vase', 'Brass Decor', 'Hand-engraved brass vase, 12 inch height', '7419', 'pcs', 24.5, 'USD', 120, '');
    insertProduct.run('AH-WD-002', 'Mango Wood Carved Box', 'Wood Decor', 'Carved wooden jewelry box with brass inlay', '4420', 'pcs', 18, 'USD', 200, '');
    insertProduct.run('AH-TX-003', 'Jute Table Runner', 'Textile', 'Handwoven jute table runner, 72x14 inch', '5310', 'pcs', 6.5, 'USD', 400, '');
    insertProduct.run('AH-IR-004', 'Wrought Iron Candle Stand', 'Iron Decor', 'Decorative wrought iron candle stand, set of 3', '7326', 'pcs', 15.75, 'USD', 150, '');

    const insertBom = db.prepare(
      'INSERT INTO product_materials (product_id, material_id, qty_required) VALUES (?, ?, ?)'
    );
    insertBom.run(1, 1, 0.8); // brass vase needs brass sheet
    insertBom.run(2, 2, 1); // wood box needs mango wood block
    insertBom.run(2, 1, 0.1); // + brass inlay
    insertBom.run(3, 4, 1.2); // jute runner needs jute fabric
    insertBom.run(4, 5, 0.6); // iron candle stand needs iron rod

    const insertSO = db.prepare(
      `INSERT INTO sales_orders (order_no, customer_id, status, order_date, delivery_date, incoterm, currency, port_of_loading, port_of_discharge, notes)
       VALUES (?, ?, ?, date('now'), date('now', '+30 days'), ?, ?, ?, ?, ?)`
    );
    insertSO.run('SO-2026-0001', 1, 'in_production', 'FOB', 'USD', 'Nhava Sheva, India', 'New York, USA', 'First order for the season');
    insertSO.run('SO-2026-0002', 2, 'confirmed', 'CIF', 'EUR', 'Mundra, India', 'Le Havre, France', 'Client wants eco-friendly packaging');

    const insertSOItem = db.prepare(
      'INSERT INTO sales_order_items (sales_order_id, product_id, qty, rate) VALUES (?, ?, ?, ?)'
    );
    insertSOItem.run(1, 1, 200, 24.5);
    insertSOItem.run(1, 4, 100, 15.75);
    insertSOItem.run(2, 3, 300, 6.5);

    const insertPO = db.prepare(
      `INSERT INTO purchase_orders (po_no, supplier_id, status, order_date, expected_date, currency, notes)
       VALUES (?, ?, ?, date('now'), date('now', '+15 days'), ?, ?)`
    );
    insertPO.run('PO-2026-0001', 1, 'ordered', 'INR', 'Urgent - needed for SO-2026-0001');

    const insertPOItem = db.prepare(
      'INSERT INTO purchase_order_items (purchase_order_id, material_id, qty, rate) VALUES (?, ?, ?, ?)'
    );
    insertPOItem.run(1, 1, 200, 650);

    const insertProd = db.prepare(
      `INSERT INTO production_orders (order_no, product_id, sales_order_id, qty, stage, status, start_date, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, date('now'), date('now', '+20 days'), ?)`
    );
    insertProd.run('PRO-2026-0001', 1, 1, 200, 'assembly', 'in_progress', 'On track');
    insertProd.run('PRO-2026-0002', 4, 1, 100, 'cutting', 'planned', 'Waiting for iron rod stock');

    const insertInvoice = db.prepare(
      `INSERT INTO invoices (invoice_no, sales_order_id, customer_id, invoice_date, due_date, currency, total_amount, paid_amount, status)
       VALUES (?, ?, ?, date('now'), date('now', '+45 days'), ?, ?, ?, ?)`
    );
    insertInvoice.run('INV-2026-0001', 2, 2, 'EUR', 1950, 500, 'partial');

    const insertPayment = db.prepare(
      `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes)
       VALUES (?, ?, date('now'), ?, ?, ?)`
    );
    insertPayment.run(1, 500, 'Bank Transfer', 'TXN-88213', 'Advance payment received');

    const insertPi = db.prepare(
      `INSERT INTO proforma_invoices (pi_no, customer_id, sales_order_id, status, pi_date, validity_date, currency, incoterm, port_of_loading, port_of_discharge, final_destination, shipment_mode, partial_shipment, transshipment, payment_terms, bank_details, notes)
       VALUES (?, ?, ?, ?, date('now'), date('now', '+30 days'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const piId = insertPi.run(
      'PI-2026-0001', 1, 1, 'sent', 'USD', 'FOB', 'Nhava Sheva, India', 'New York, USA', 'New York, USA', 'Sea Freight', 'Allowed', 'Not Allowed',
      '30% advance by T/T, balance 70% against copy of Bill of Lading',
      'Beneficiary: Akbar Handicrafts, Bank: State Bank of India, A/C No: 30012345678, IFSC: SBIN0001234, SWIFT: SBININBB123',
      'Rates valid for 30 days from PI date. Subject to Moradabad jurisdiction.'
    ).lastInsertRowid;
    const insertPiItem = db.prepare(
      'INSERT INTO proforma_invoice_items (proforma_invoice_id, product_id, description, hsn_code, qty, unit, rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertPiItem.run(piId, 1, 'Brass Handicraft Vase', '7419', 200, 'pcs', 24.5);
    insertPiItem.run(piId, 4, 'Wrought Iron Candle Stand', '7326', 100, 'pcs', 15.75);
  }

  const companySettingsCount = db.prepare('SELECT COUNT(*) as c FROM company_settings').get().c;
  if (companySettingsCount === 0) {
    db.prepare(
      `INSERT INTO company_settings (id, company_name, address, city, country, email, phone, gstin, iec_code, pan, bank_name, bank_account_name, bank_account_no, bank_ifsc, bank_swift, bank_address, authorized_signatory)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'Akbar Handicrafts',
      'Plot 45, Handicrafts Export Zone, Kanth Road',
      'Moradabad, Uttar Pradesh - 244001',
      'India',
      'export@akbarhandicrafts.com',
      '+91-591-234-5678',
      '09ABCDE1234F1Z5',
      '0987654321',
      'ABCDE1234F',
      'State Bank of India',
      'Akbar Handicrafts',
      '30012345678',
      'SBIN0001234',
      'SBININBB123',
      'SBI Moradabad Main Branch, Uttar Pradesh, India',
      'Mohd. Akbar (Proprietor)'
    );
  }
}

seed();

export default db;
