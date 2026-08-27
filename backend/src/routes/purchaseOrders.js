import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber, runInTransaction } from '../utils/orderNumber.js';
import { receiveMaterialStock } from '../services/inventory.js';

const router = Router();

function getOrderTotal(orderId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM purchase_order_items WHERE purchase_order_id = ?')
    .get(orderId);
  return row.total;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status, supplier_id } = req.query;
    let sql = `SELECT po.*, s.name as supplier_name, s.company as supplier_company
               FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ' AND po.status = ?';
      params.push(status);
    }
    if (supplier_id) {
      sql += ' AND po.supplier_id = ?';
      params.push(supplier_id);
    }
    sql += ' ORDER BY po.id DESC';
    const orders = db.prepare(sql).all(...params);
    res.json(orders.map((o) => ({ ...o, total_amount: getOrderTotal(o.id) })));
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const order = db
      .prepare(
        `SELECT po.*, s.name as supplier_name, s.company as supplier_company, s.email as supplier_email
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`
      )
      .get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    const items = db
      .prepare(
        `SELECT poi.*, m.name as material_name, m.unit
         FROM purchase_order_items poi JOIN materials m ON m.id = poi.material_id WHERE poi.purchase_order_id = ?`
      )
      .all(req.params.id);
    res.json({ ...order, items, total_amount: items.reduce((s, i) => s + i.qty * i.rate, 0) });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { supplier_id, order_date, expected_date, currency, notes, items } = req.body;
    if (!supplier_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'supplier_id and at least one item are required' });
    }
    const poNo = nextDocNumber(db, 'purchase_orders', 'po_no', 'PO');
    try {
      const orderId = runInTransaction(db, () => {
        const info = db
          .prepare(
            `INSERT INTO purchase_orders (po_no, supplier_id, status, order_date, expected_date, currency, notes)
             VALUES (?, ?, 'draft', ?, ?, ?, ?)`
          )
          .run(poNo, supplier_id, order_date || null, expected_date || null, currency || 'INR', notes || null);
        const id = info.lastInsertRowid;
        const insertItem = db.prepare('INSERT INTO purchase_order_items (purchase_order_id, material_id, qty, rate) VALUES (?, ?, ?, ?)');
        for (const item of items) {
          insertItem.run(id, item.material_id, item.qty, item.rate);
        }
        return id;
      });
      res.status(201).json(db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(orderId));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    const { supplier_id, order_date, expected_date, currency, notes, items } = req.body;
    runInTransaction(db, () => {
      db.prepare(
        `UPDATE purchase_orders SET supplier_id = ?, order_date = ?, expected_date = ?, currency = ?, notes = ? WHERE id = ?`
      ).run(
        supplier_id ?? existing.supplier_id,
        order_date ?? existing.order_date,
        expected_date ?? existing.expected_date,
        currency ?? existing.currency,
        notes ?? existing.notes,
        req.params.id
      );
      if (Array.isArray(items)) {
        db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(req.params.id);
        const insertItem = db.prepare('INSERT INTO purchase_order_items (purchase_order_id, material_id, qty, rate) VALUES (?, ?, ?, ?)');
        for (const item of items) {
          insertItem.run(req.params.id, item.material_id, item.qty, item.rate);
        }
      }
    });
    res.json(db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/status',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['draft', 'ordered', 'received', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }
    const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });

    runInTransaction(db, () => {
      const receivedDate = status === 'received' ? new Date().toISOString().slice(0, 10) : existing.received_date;
      db.prepare('UPDATE purchase_orders SET status = ?, received_date = ? WHERE id = ?').run(status, receivedDate, req.params.id);
      // When materials are received, add to raw material stock at a recalculated weighted-average cost.
      if (status === 'received' && existing.status !== 'received') {
        const items = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(req.params.id);
        for (const item of items) {
          receiveMaterialStock(item.material_id, item.qty, item.rate, {
            refType: 'purchase_order_received',
            refId: req.params.id,
            notes: `Received against ${existing.po_no}`,
          });
        }
      }
    });

    res.json(db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

export default router;
