import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber, runInTransaction } from '../utils/orderNumber.js';

const router = Router();

function getOrderTotal(orderId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM sales_order_items WHERE sales_order_id = ?')
    .get(orderId);
  return row.total;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status, customer_id } = req.query;
    let sql = `SELECT so.*, c.name as customer_name, c.company as customer_company
               FROM sales_orders so JOIN customers c ON c.id = so.customer_id WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ' AND so.status = ?';
      params.push(status);
    }
    if (customer_id) {
      sql += ' AND so.customer_id = ?';
      params.push(customer_id);
    }
    sql += ' ORDER BY so.id DESC';
    const orders = db.prepare(sql).all(...params);
    const withTotals = orders.map((o) => ({ ...o, total_amount: getOrderTotal(o.id) }));
    res.json(withTotals);
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const order = db
      .prepare(
        `SELECT so.*, c.name as customer_name, c.company as customer_company, c.email as customer_email
         FROM sales_orders so JOIN customers c ON c.id = so.customer_id WHERE so.id = ?`
      )
      .get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Sales order not found' });
    const items = db
      .prepare(
        `SELECT soi.*, p.name as product_name, p.sku, p.unit
         FROM sales_order_items soi JOIN products p ON p.id = soi.product_id WHERE soi.sales_order_id = ?`
      )
      .all(req.params.id);
    res.json({ ...order, items, total_amount: items.reduce((s, i) => s + i.qty * i.rate, 0) });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { customer_id, order_date, delivery_date, incoterm, currency, port_of_loading, port_of_discharge, notes, items } = req.body;
    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer_id and at least one item are required' });
    }
    const orderNo = nextDocNumber(db, 'sales_orders', 'order_no', 'SO');
    try {
      const result = runInTransaction(db, () => {
        const info = db
          .prepare(
            `INSERT INTO sales_orders (order_no, customer_id, status, order_date, delivery_date, incoterm, currency, port_of_loading, port_of_discharge, notes)
             VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(orderNo, customer_id, order_date || null, delivery_date || null, incoterm || null, currency || 'USD', port_of_loading || null, port_of_discharge || null, notes || null);
        const orderId = info.lastInsertRowid;
        const insertItem = db.prepare('INSERT INTO sales_order_items (sales_order_id, product_id, qty, rate) VALUES (?, ?, ?, ?)');
        for (const item of items) {
          insertItem.run(orderId, item.product_id, item.qty, item.rate);
        }
        return orderId;
      });
      const order = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(result);
      res.status(201).json(order);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Sales order not found' });
    const { customer_id, order_date, delivery_date, incoterm, currency, port_of_loading, port_of_discharge, notes, items } = req.body;
    try {
      runInTransaction(db, () => {
        db.prepare(
          `UPDATE sales_orders SET customer_id = ?, order_date = ?, delivery_date = ?, incoterm = ?, currency = ?, port_of_loading = ?, port_of_discharge = ?, notes = ? WHERE id = ?`
        ).run(
          customer_id ?? existing.customer_id,
          order_date ?? existing.order_date,
          delivery_date ?? existing.delivery_date,
          incoterm ?? existing.incoterm,
          currency ?? existing.currency,
          port_of_loading ?? existing.port_of_loading,
          port_of_discharge ?? existing.port_of_discharge,
          notes ?? existing.notes,
          req.params.id
        );
        if (Array.isArray(items)) {
          db.prepare('DELETE FROM sales_order_items WHERE sales_order_id = ?').run(req.params.id);
          const insertItem = db.prepare('INSERT INTO sales_order_items (sales_order_id, product_id, qty, rate) VALUES (?, ?, ?, ?)');
          for (const item of items) {
            insertItem.run(req.params.id, item.product_id, item.qty, item.rate);
          }
        }
      });
      res.json(db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

router.patch(
  '/:id/status',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['draft', 'confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }
    const existing = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Sales order not found' });

    runInTransaction(db, () => {
      db.prepare('UPDATE sales_orders SET status = ? WHERE id = ?').run(status, req.params.id);
      // When order is shipped, deduct finished goods stock and log inventory movement.
      if (status === 'shipped' && existing.status !== 'shipped') {
        const items = db.prepare('SELECT * FROM sales_order_items WHERE sales_order_id = ?').all(req.params.id);
        const updateStock = db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?');
        const insertMovement = db.prepare(
          `INSERT INTO inventory_movements (item_type, item_id, movement_type, qty, ref_type, ref_id, notes)
           VALUES ('product', ?, 'out', ?, 'sales_order_shipped', ?, ?)`
        );
        for (const item of items) {
          updateStock.run(item.qty, item.product_id);
          insertMovement.run(item.product_id, item.qty, req.params.id, `Shipped against order ${existing.order_no}`);
        }
      }
    });

    res.json(db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Sales order not found' });
    db.prepare('DELETE FROM sales_orders WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

export default router;
