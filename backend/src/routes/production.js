import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber, runInTransaction } from '../utils/orderNumber.js';
import { recordAudit } from '../services/auditLog.js';
import { issueMaterialStock } from '../services/inventory.js';

const router = Router();
const STAGES = ['cutting', 'assembly', 'finishing', 'quality_check', 'packing', 'completed'];
const STATUSES = ['planned', 'in_progress', 'quality_check', 'completed', 'cancelled'];

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status, product_id } = req.query;
    let sql = `SELECT po.*, p.name as product_name, p.sku, so.order_no as sales_order_no
               FROM production_orders po
               JOIN products p ON p.id = po.product_id
               LEFT JOIN sales_orders so ON so.id = po.sales_order_id WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ' AND po.status = ?';
      params.push(status);
    }
    if (product_id) {
      sql += ' AND po.product_id = ?';
      params.push(product_id);
    }
    sql += ' ORDER BY po.id DESC';
    res.json(db.prepare(sql).all(...params));
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const order = db
      .prepare(
        `SELECT po.*, p.name as product_name, p.sku, so.order_no as sales_order_no
         FROM production_orders po
         JOIN products p ON p.id = po.product_id
         LEFT JOIN sales_orders so ON so.id = po.sales_order_id WHERE po.id = ?`
      )
      .get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Production order not found' });
    const materialsNeeded = db
      .prepare(
        `SELECT m.id as material_id, m.name, m.unit, m.stock_qty, pm.qty_required, (pm.qty_required * ?) as total_required
         FROM product_materials pm JOIN materials m ON m.id = pm.material_id WHERE pm.product_id = ?`
      )
      .all(order.qty, order.product_id);
    res.json({ ...order, materialsNeeded });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { product_id, sales_order_id, qty, start_date, due_date, notes } = req.body;
    if (!product_id || !qty) {
      return res.status(400).json({ error: 'product_id and qty are required' });
    }
    const orderNo = nextDocNumber(db, 'production_orders', 'order_no', 'PRO');
    const info = db
      .prepare(
        `INSERT INTO production_orders (order_no, product_id, sales_order_id, qty, stage, status, start_date, due_date, notes)
         VALUES (?, ?, ?, ?, 'cutting', 'planned', ?, ?, ?)`
      )
      .run(orderNo, product_id, sales_order_id || null, qty, start_date || null, due_date || null, notes || null);
    res.status(201).json(db.prepare('SELECT * FROM production_orders WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production order not found' });
    const { product_id, sales_order_id, qty, start_date, due_date, notes } = req.body;
    db.prepare(
      `UPDATE production_orders SET product_id = ?, sales_order_id = ?, qty = ?, start_date = ?, due_date = ?, notes = ? WHERE id = ?`
    ).run(
      product_id ?? existing.product_id,
      sales_order_id ?? existing.sales_order_id,
      qty ?? existing.qty,
      start_date ?? existing.start_date,
      due_date ?? existing.due_date,
      notes ?? existing.notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/stage',
  authRequired,
  asyncHandler(async (req, res) => {
    const { stage } = req.body;
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ error: `stage must be one of: ${STAGES.join(', ')}` });
    }
    const existing = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production order not found' });
    const status = stage === 'completed' ? 'completed' : stage === 'quality_check' ? 'quality_check' : 'in_progress';

    // Only QC-approved quantities may proceed to packing/shipping.
    if ((stage === 'packing' || stage === 'completed') && existing.qc_status !== 'passed') {
      return res.status(400).json({ error: 'This production order has not passed QC yet - record a passing QC inspection first' });
    }

    runInTransaction(db, () => {
      db.prepare('UPDATE production_orders SET stage = ?, status = ?, completed_date = ? WHERE id = ?').run(
        stage,
        status,
        stage === 'completed' ? new Date().toISOString().slice(0, 10) : existing.completed_date,
        req.params.id
      );
      // When production completes: consume raw materials per BOM and add finished goods stock.
      if (stage === 'completed' && existing.stage !== 'completed') {
        const bom = db.prepare('SELECT * FROM product_materials WHERE product_id = ?').all(existing.product_id);
        for (const b of bom) {
          const consumed = b.qty_required * existing.qty;
          issueMaterialStock(b.material_id, consumed, {
            refType: 'production_consumed',
            refId: req.params.id,
            notes: `Consumed for ${existing.order_no}`,
          });
        }
        db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(existing.qty, existing.product_id);
        db.prepare(
          `INSERT INTO inventory_movements (item_type, item_id, movement_type, qty, ref_type, ref_id, notes)
           VALUES ('product', ?, 'in', ?, 'production_completed', ?, ?)`
        ).run(existing.product_id, existing.qty, req.params.id, `Completed production ${existing.order_no}`);
      }
    });

    recordAudit(req, {
      entity_type: 'production_order',
      entity_id: Number(req.params.id),
      action: 'stage_change',
      before: { stage: existing.stage, status: existing.status },
      after: { stage, status },
    });
    res.json(db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id));
  })
);

// QC & Packaging: record quality-check result and packing details for a production order.
router.patch(
  '/:id/qc',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production order not found' });
    const { qc_status, qc_notes, packaging_notes, cartons_count } = req.body;
    if (qc_status && !['pending', 'passed', 'failed'].includes(qc_status)) {
      return res.status(400).json({ error: 'qc_status must be one of: pending, passed, failed' });
    }
    db.prepare(
      'UPDATE production_orders SET qc_status = ?, qc_notes = ?, packaging_notes = ?, cartons_count = ? WHERE id = ?'
    ).run(
      qc_status ?? existing.qc_status,
      qc_notes ?? existing.qc_notes,
      packaging_notes ?? existing.packaging_notes,
      cartons_count ?? existing.cartons_count,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id));
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
    const existing = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production order not found' });
    db.prepare('UPDATE production_orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json(db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production order not found' });
    db.prepare('DELETE FROM production_orders WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

export default router;
