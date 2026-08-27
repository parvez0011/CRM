import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { recordAudit } from '../services/auditLog.js';

const router = Router();
const STATUSES = ['pending', 'in_progress', 'passed', 'failed', 'rework_required', 'recheck', 'closed'];

// Rolls up all (append-only) inspections for a production order into the order's simple
// qc_status/qc_notes fields, so existing screens that only read those two fields stay correct.
// A production order only counts as fully "passed" once inspected-passed quantity covers the
// whole order quantity - partial passes keep it 'pending' so packing/shipping stays gated.
export function refreshQcRollup(productionOrderId) {
  const order = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(productionOrderId);
  if (!order) return;
  const inspections = db
    .prepare('SELECT * FROM qc_inspections WHERE production_order_id = ? ORDER BY id DESC')
    .all(productionOrderId);
  const totalPassed = inspections.reduce((sum, i) => sum + i.qty_passed, 0);
  let qcStatus = 'pending';
  if (totalPassed >= order.qty && order.qty > 0) qcStatus = 'passed';
  else if (inspections.some((i) => i.status === 'failed' || i.status === 'rework_required')) qcStatus = 'failed';
  const latestNotes = inspections[0]?.defect_notes || null;
  db.prepare('UPDATE production_orders SET qc_status = ?, qc_notes = ? WHERE id = ?').run(qcStatus, latestNotes, productionOrderId);
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { production_order_id } = req.query;
    let sql = `SELECT qi.*, po.order_no, p.name as product_name, p.sku
               FROM qc_inspections qi
               JOIN production_orders po ON po.id = qi.production_order_id
               JOIN products p ON p.id = po.product_id WHERE 1=1`;
    const params = [];
    if (production_order_id) {
      sql += ' AND qi.production_order_id = ?';
      params.push(production_order_id);
    }
    sql += ' ORDER BY qi.id DESC';
    res.json(db.prepare(sql).all(...params));
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { production_order_id, qty_inspected, qty_passed, qty_failed, qty_rework, defect_notes, inspector, status } = req.body;
    const order = db.prepare('SELECT * FROM production_orders WHERE id = ?').get(production_order_id);
    if (!order) return res.status(404).json({ error: 'Production order not found' });
    const inspected = Number(qty_inspected) || 0;
    const passed = Number(qty_passed) || 0;
    const failed = Number(qty_failed) || 0;
    const rework = Number(qty_rework) || 0;
    if (inspected <= 0) return res.status(400).json({ error: 'qty_inspected must be greater than zero' });
    if (passed + failed + rework > inspected) {
      return res.status(400).json({ error: 'Passed + Failed + Rework cannot exceed the quantity inspected' });
    }
    const finalStatus = STATUSES.includes(status) ? status : passed >= inspected ? 'passed' : failed > 0 ? 'failed' : 'rework_required';
    const info = db
      .prepare(
        `INSERT INTO qc_inspections (production_order_id, qty_inspected, qty_passed, qty_failed, qty_rework, defect_notes, inspector, status, inspected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'))`
      )
      .run(production_order_id, inspected, passed, failed, rework, defect_notes || null, inspector || req.user?.name || null, finalStatus);
    refreshQcRollup(production_order_id);
    recordAudit(req, {
      entity_type: 'production_order',
      entity_id: Number(production_order_id),
      action: 'qc_inspection',
      after: { qty_inspected: inspected, qty_passed: passed, qty_failed: failed, qty_rework: rework, status: finalStatus },
    });
    res.status(201).json(db.prepare('SELECT * FROM qc_inspections WHERE id = ?').get(info.lastInsertRowid));
  })
);

export default router;
