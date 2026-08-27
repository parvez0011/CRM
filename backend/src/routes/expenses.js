import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber } from '../utils/orderNumber.js';
import { recordAudit } from '../services/auditLog.js';

const router = Router();
const CATEGORIES = [
  'RAW_MATERIAL', 'LABOUR', 'MANUFACTURING', 'FINISHING', 'PACKAGING', 'QC', 'TRANSPORT',
  'FREIGHT', 'PORT', 'CUSTOMS', 'DOCUMENTATION', 'BANK_CHARGES', 'OTHER',
];
const TARGET_TYPES = ['proforma_invoice', 'customer_po', 'production_order'];

function getAllocations(expenseId) {
  return db
    .prepare(
      `SELECT ea.*,
              CASE ea.target_type
                WHEN 'proforma_invoice' THEN (SELECT pi_no FROM proforma_invoices WHERE id = ea.target_id)
                WHEN 'customer_po' THEN (SELECT po_no FROM customer_purchase_orders WHERE id = ea.target_id)
                WHEN 'production_order' THEN (SELECT order_no FROM production_orders WHERE id = ea.target_id)
              END as target_label
       FROM expense_allocations ea WHERE ea.expense_id = ?`
    )
    .all(expenseId);
}

function getAllocatedTotal(expenseId) {
  return db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expense_allocations WHERE expense_id = ?').get(expenseId).total;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { category, approval_status } = req.query;
    let sql = `SELECT e.*, s.name as supplier_name FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id WHERE 1=1`;
    const params = [];
    if (category) {
      sql += ' AND e.category = ?';
      params.push(category);
    }
    if (approval_status) {
      sql += ' AND e.approval_status = ?';
      params.push(approval_status);
    }
    sql += ' ORDER BY e.id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(
      rows.map((e) => ({
        ...e,
        allocated_total: getAllocatedTotal(e.id),
        unallocated: e.amount + e.tax - getAllocatedTotal(e.id),
      }))
    );
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const expense = db
      .prepare(`SELECT e.*, s.name as supplier_name FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id WHERE e.id = ?`)
      .get(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    const allocations = getAllocations(expense.id);
    res.json({ ...expense, allocations, allocated_total: getAllocatedTotal(expense.id), unallocated: expense.amount + expense.tax - getAllocatedTotal(expense.id) });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { expense_date, category, amount, currency, tax, supplier_id, notes } = req.body;
    if (!category || !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (amount === undefined || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const expenseNo = nextDocNumber(db, 'expenses', 'expense_no', 'EXP');
    const info = db
      .prepare(
        `INSERT INTO expenses (expense_no, expense_date, category, amount, currency, tax, supplier_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(expenseNo, expense_date || null, category, Number(amount), currency || 'USD', Number(tax) || 0, supplier_id || null, notes || null);
    recordAudit(req, { entity_type: 'expense', entity_id: info.lastInsertRowid, action: 'create', after: req.body });
    res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (existing.approval_status === 'approved') {
      return res.status(400).json({ error: 'Cannot edit an approved expense - reject it first if a correction is needed' });
    }
    const { expense_date, category, amount, currency, tax, supplier_id, notes } = req.body;
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    db.prepare(
      `UPDATE expenses SET expense_date = ?, category = ?, amount = ?, currency = ?, tax = ?, supplier_id = ?, notes = ? WHERE id = ?`
    ).run(
      expense_date ?? existing.expense_date,
      category ?? existing.category,
      amount !== undefined ? Number(amount) : existing.amount,
      currency ?? existing.currency,
      tax !== undefined ? Number(tax) : existing.tax,
      supplier_id === undefined ? existing.supplier_id : supplier_id || null,
      notes ?? existing.notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/approval',
  authRequired,
  asyncHandler(async (req, res) => {
    const { approval_status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(approval_status)) {
      return res.status(400).json({ error: 'approval_status must be one of: pending, approved, rejected' });
    }
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (approval_status === 'approved' && getAllocations(req.params.id).length === 0) {
      return res.status(400).json({ error: 'Allocate this expense to at least one PI/PO/Production Order before approving' });
    }
    db.prepare('UPDATE expenses SET approval_status = ? WHERE id = ?').run(approval_status, req.params.id);
    recordAudit(req, {
      entity_type: 'expense',
      entity_id: Number(req.params.id),
      action: 'approval_status_change',
      before: { approval_status: existing.approval_status },
      after: { approval_status },
    });
    res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (existing.approval_status === 'approved') {
      return res.status(400).json({ error: 'Cannot delete an approved expense - reject it first' });
    }
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

// Allocate (part of) an expense to a PI, Customer PO, or Production Order.
router.post(
  '/:id/allocations',
  authRequired,
  asyncHandler(async (req, res) => {
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    const { target_type, target_id, amount } = req.body;
    if (!TARGET_TYPES.includes(target_type)) {
      return res.status(400).json({ error: `target_type must be one of: ${TARGET_TYPES.join(', ')}` });
    }
    if (!target_id || !(Number(amount) > 0)) {
      return res.status(400).json({ error: 'target_id and a positive amount are required' });
    }
    const totalPool = expense.amount + expense.tax;
    const alreadyAllocated = getAllocatedTotal(expense.id);
    if (alreadyAllocated + Number(amount) > totalPool + 0.01) {
      return res.status(400).json({ error: `Cannot allocate ${amount} - only ${(totalPool - alreadyAllocated).toFixed(2)} remains unallocated on ${expense.expense_no}` });
    }
    const info = db
      .prepare('INSERT INTO expense_allocations (expense_id, target_type, target_id, amount) VALUES (?, ?, ?, ?)')
      .run(expense.id, target_type, target_id, Number(amount));
    res.status(201).json(db.prepare('SELECT * FROM expense_allocations WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.delete(
  '/allocations/:allocId',
  authRequired,
  asyncHandler(async (req, res) => {
    const allocation = db.prepare('SELECT * FROM expense_allocations WHERE id = ?').get(req.params.allocId);
    if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(allocation.expense_id);
    if (expense && expense.approval_status === 'approved') {
      return res.status(400).json({ error: 'Cannot remove an allocation from an approved expense - reject it first' });
    }
    db.prepare('DELETE FROM expense_allocations WHERE id = ?').run(req.params.allocId);
    res.status(204).end();
  })
);

export default router;
