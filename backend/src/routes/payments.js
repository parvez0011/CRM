import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const sql = `SELECT pay.*, inv.invoice_no, inv.currency, c.name as customer_name
                 FROM payments pay
                 JOIN invoices inv ON inv.id = pay.invoice_id
                 JOIN customers c ON c.id = inv.customer_id
                 ORDER BY pay.id DESC`;
    res.json(db.prepare(sql).all());
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
    const paidRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as paid FROM payments WHERE invoice_id = ?').get(payment.invoice_id);
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoice_id);
    let status = 'unpaid';
    if (invoice) {
      if (paidRow.paid >= invoice.total_amount && invoice.total_amount > 0) status = 'paid';
      else if (paidRow.paid > 0) status = 'partial';
      db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(paidRow.paid, status, payment.invoice_id);
    }
    res.status(204).end();
  })
);

export default router;
