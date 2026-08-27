import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber } from '../utils/orderNumber.js';

const router = Router();
const STATUSES = ['pending', 'booked', 'shipped', 'in_transit', 'delivered'];
const fields = ['sales_order_id', 'shipping_line', 'container_no', 'bl_number', 'port_of_loading', 'port_of_discharge', 'etd', 'eta', 'gross_weight', 'net_weight', 'cbm', 'notes'];

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const sql = `SELECT sh.*, so.order_no as sales_order_no, c.name as customer_name
                 FROM shipments sh
                 JOIN sales_orders so ON so.id = sh.sales_order_id
                 JOIN customers c ON c.id = so.customer_id
                 ORDER BY sh.id DESC`;
    res.json(db.prepare(sql).all());
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const sql = `SELECT sh.*, so.order_no as sales_order_no, c.name as customer_name
                 FROM shipments sh
                 JOIN sales_orders so ON so.id = sh.sales_order_id
                 JOIN customers c ON c.id = so.customer_id
                 WHERE sh.id = ?`;
    const row = db.prepare(sql).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    res.json(row);
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    if (!req.body.sales_order_id) return res.status(400).json({ error: 'sales_order_id is required' });
    const shipmentNo = nextDocNumber(db, 'shipments', 'shipment_no', 'SHP');
    const values = fields.map((f) => (req.body[f] === undefined ? null : req.body[f]));
    const info = db
      .prepare(`INSERT INTO shipments (shipment_no, status, ${fields.join(', ')}) VALUES (?, 'pending', ${fields.map(() => '?').join(', ')})`)
      .run(shipmentNo, ...values);
    res.status(201).json(db.prepare('SELECT * FROM shipments WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });
    const values = fields.map((f) => (req.body[f] === undefined ? existing[f] : req.body[f]));
    db.prepare(`UPDATE shipments SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...values, req.params.id);
    res.json(db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/status',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });
    db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, req.params.id);
    // Keep parent sales order status roughly in sync with shipment progress.
    if (status === 'shipped') {
      db.prepare("UPDATE sales_orders SET status = 'shipped' WHERE id = ? AND status != 'delivered'").run(existing.sales_order_id);
    } else if (status === 'delivered') {
      db.prepare("UPDATE sales_orders SET status = 'delivered' WHERE id = ?").run(existing.sales_order_id);
    }
    res.json(db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });
    db.prepare('DELETE FROM shipments WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

export default router;
