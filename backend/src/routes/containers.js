import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber, runInTransaction } from '../utils/orderNumber.js';
import { recordAudit } from '../services/auditLog.js';

const router = Router();
const STATUSES = ['planning', 'booked', 'loading', 'shipped', 'in_transit', 'delivered'];
const headerFields = [
  'container_type', 'status', 'shipping_line', 'booking_no', 'bl_number', 'port_of_loading',
  'port_of_discharge', 'etd', 'eta', 'max_cbm', 'max_weight_kg', 'notes',
];

function getContainerTotals(containerId) {
  const links = db.prepare('SELECT * FROM container_orders WHERE container_id = ?').all(containerId);
  let totalValue = 0;
  let totalCbm = 0;
  let totalWeight = 0;
  const currencies = new Set();
  for (const link of links) {
    if (link.proforma_invoice_id) {
      const pi = db.prepare('SELECT currency FROM proforma_invoices WHERE id = ?').get(link.proforma_invoice_id);
      const total = db
        .prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM proforma_invoice_items WHERE proforma_invoice_id = ?')
        .get(link.proforma_invoice_id).total;
      totalValue += total;
      if (pi) currencies.add(pi.currency);
    }
    if (link.sales_order_id) {
      const so = db.prepare('SELECT currency FROM sales_orders WHERE id = ?').get(link.sales_order_id);
      const total = db
        .prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM sales_order_items WHERE sales_order_id = ?')
        .get(link.sales_order_id).total;
      totalValue += total;
      if (so) currencies.add(so.currency);
    }
  }
  const expenses = db
    .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM shipping_expenses WHERE container_id = ?')
    .get(containerId).total;
  return {
    totalValue,
    totalExpenses: expenses,
    currency: currencies.size === 1 ? [...currencies][0] : currencies.size > 1 ? 'Mixed' : null,
    orderCount: links.length,
  };
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const containers = db.prepare('SELECT * FROM containers ORDER BY id DESC').all();
    res.json(containers.map((c) => ({ ...c, ...getContainerTotals(c.id) })));
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const container = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });

    const links = db
      .prepare(
        `SELECT co.*,
                pi.pi_no, pi.customer_id as pi_customer_id, pic.name as pi_customer_name,
                so.order_no as sales_order_no, so.customer_id as so_customer_id, soc.name as so_customer_name
         FROM container_orders co
         LEFT JOIN proforma_invoices pi ON pi.id = co.proforma_invoice_id
         LEFT JOIN customers pic ON pic.id = pi.customer_id
         LEFT JOIN sales_orders so ON so.id = co.sales_order_id
         LEFT JOIN customers soc ON soc.id = so.customer_id
         WHERE co.container_id = ?`
      )
      .all(req.params.id)
      .map((link) => {
        const total = link.proforma_invoice_id
          ? db.prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM proforma_invoice_items WHERE proforma_invoice_id = ?').get(link.proforma_invoice_id).total
          : db.prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM sales_order_items WHERE sales_order_id = ?').get(link.sales_order_id).total;
        return {
          id: link.id,
          proforma_invoice_id: link.proforma_invoice_id,
          pi_no: link.pi_no,
          sales_order_id: link.sales_order_id,
          sales_order_no: link.sales_order_no,
          customer_name: link.pi_customer_name || link.so_customer_name,
          total_amount: total,
        };
      });

    const expenses = db.prepare('SELECT * FROM shipping_expenses WHERE container_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ ...container, ...getContainerTotals(req.params.id), orders: links, expenses });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const containerNo = req.body.container_no || nextDocNumber(db, 'containers', 'container_no', 'CNT');
    const values = headerFields.map((f) => {
      if (f === 'status') return req.body.status || 'planning';
      return req.body[f] === undefined ? null : req.body[f];
    });
    try {
      const info = db
        .prepare(`INSERT INTO containers (container_no, ${headerFields.join(', ')}) VALUES (?, ${headerFields.map(() => '?').join(', ')})`)
        .run(containerNo, ...values);
      res.status(201).json(db.prepare('SELECT * FROM containers WHERE id = ?').get(info.lastInsertRowid));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Container not found' });
    const values = headerFields.map((f) => (req.body[f] === undefined ? existing[f] : req.body[f]));
    db.prepare(`UPDATE containers SET ${headerFields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...values, req.params.id);
    res.json(db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/status',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    const existing = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Container not found' });
    db.prepare('UPDATE containers SET status = ? WHERE id = ?').run(status, req.params.id);
    recordAudit(req, {
      entity_type: 'container',
      entity_id: Number(req.params.id),
      action: 'status_change',
      before: { status: existing.status },
      after: { status },
    });
    res.json(db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Container not found' });
    db.prepare('DELETE FROM containers WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

// Link/unlink Proforma Invoices (or export orders) being consolidated into this container.
router.post(
  '/:id/orders',
  authRequired,
  asyncHandler(async (req, res) => {
    const container = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });
    const { proforma_invoice_id, sales_order_id } = req.body;
    if (!proforma_invoice_id && !sales_order_id) {
      return res.status(400).json({ error: 'proforma_invoice_id or sales_order_id is required' });
    }
    const info = db
      .prepare('INSERT INTO container_orders (container_id, proforma_invoice_id, sales_order_id) VALUES (?, ?, ?)')
      .run(req.params.id, proforma_invoice_id || null, sales_order_id || null);
    res.status(201).json(db.prepare('SELECT * FROM container_orders WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.delete(
  '/:id/orders/:linkId',
  authRequired,
  asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM container_orders WHERE id = ? AND container_id = ?').run(req.params.linkId, req.params.id);
    res.status(204).end();
  })
);

// Shipping expenses
router.post(
  '/:id/expenses',
  authRequired,
  asyncHandler(async (req, res) => {
    const container = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });
    const { expense_type, amount, currency, notes } = req.body;
    if (!expense_type || amount === undefined) {
      return res.status(400).json({ error: 'expense_type and amount are required' });
    }
    const info = db
      .prepare('INSERT INTO shipping_expenses (container_id, expense_type, amount, currency, notes) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, expense_type, amount, currency || 'USD', notes || null);
    res.status(201).json(db.prepare('SELECT * FROM shipping_expenses WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.delete(
  '/expenses/:expenseId',
  authRequired,
  asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM shipping_expenses WHERE id = ?').run(req.params.expenseId);
    res.status(204).end();
  })
);

// Generate one Commercial Invoice per buyer, combining all linked Proforma Invoice items for
// that buyer in this container.
router.post(
  '/:id/generate-commercial-invoice',
  authRequired,
  asyncHandler(async (req, res) => {
    const container = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });

    const links = db.prepare('SELECT * FROM container_orders WHERE container_id = ? AND proforma_invoice_id IS NOT NULL').all(req.params.id);
    if (links.length === 0) {
      return res.status(400).json({ error: 'No Proforma Invoices are linked to this container yet' });
    }

    const existingPiIds = new Set(
      db
        .prepare(
          `SELECT ipi.proforma_invoice_id
           FROM invoice_proforma_invoices ipi
           JOIN invoices i ON i.id = ipi.invoice_id
           WHERE i.container_id = ?`
        )
        .all(req.params.id)
        .map((row) => row.proforma_invoice_id)
    );
    const byCustomerAndCurrency = new Map();
    for (const link of links) {
      if (existingPiIds.has(link.proforma_invoice_id)) continue;
      const pi = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(link.proforma_invoice_id);
      if (!pi) continue;
      const items = db.prepare('SELECT * FROM proforma_invoice_items WHERE proforma_invoice_id = ?').all(pi.id);
      const key = `${pi.customer_id}:${pi.currency}`;
      if (!byCustomerAndCurrency.has(key)) {
        byCustomerAndCurrency.set(key, {
          customer_id: pi.customer_id,
          currency: pi.currency,
          items: [],
          pi_ids: [],
          sales_order_id: pi.sales_order_id,
        });
      }
      const bucket = byCustomerAndCurrency.get(key);
      bucket.pi_ids.push(pi.id);
      for (const item of items) {
        bucket.items.push(item);
      }
    }

    if (byCustomerAndCurrency.size === 0) {
      return res.status(400).json({ error: 'Commercial invoices have already been generated for all linked Proforma Invoices' });
    }

    const createdInvoices = [];
    for (const bucket of byCustomerAndCurrency.values()) {
      const totalAmount = bucket.items.reduce((sum, i) => sum + i.qty * i.rate, 0);
      const invoiceNo = nextDocNumber(db, 'invoices', 'invoice_no', 'CINV');
      const invoiceId = runInTransaction(db, () => {
        const info = db
          .prepare(
            `INSERT INTO invoices (invoice_no, sales_order_id, customer_id, container_id, invoice_date, due_date, currency, total_amount, invoice_type)
             VALUES (?, ?, ?, ?, date('now'), date('now', '+45 days'), ?, ?, 'commercial')`
          )
          .run(invoiceNo, bucket.sales_order_id || null, bucket.customer_id, req.params.id, bucket.currency, totalAmount);
        const id = info.lastInsertRowid;
        const insertItem = db.prepare(
          'INSERT INTO invoice_items (invoice_id, product_id, description, hsn_code, qty, unit, rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        for (const item of bucket.items) {
          insertItem.run(id, item.product_id, item.description, item.hsn_code, item.qty, item.unit, item.rate);
        }
        const linkPi = db.prepare('INSERT INTO invoice_proforma_invoices (invoice_id, proforma_invoice_id) VALUES (?, ?)');
        for (const piId of bucket.pi_ids) linkPi.run(id, piId);
        return id;
      });
      createdInvoices.push(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId));
    }

    res.status(201).json({ invoices: createdInvoices });
  })
);

export default router;
