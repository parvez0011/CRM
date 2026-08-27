import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
const fields = [
  'company_name', 'address', 'city', 'country', 'email', 'phone', 'gstin', 'iec_code', 'pan',
  'bank_name', 'bank_account_name', 'bank_account_no', 'bank_ifsc', 'bank_swift', 'bank_address', 'authorized_signatory',
];

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const row = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    if (!row || req.user.role !== 'staff') return res.json(row || {});
    const { bank_account_name, bank_account_no, bank_ifsc, bank_swift, bank_address, ...safeSettings } = row;
    res.json(safeSettings);
  })
);

router.put(
  '/',
  authRequired,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    const values = fields.map((f) => (req.body[f] === undefined ? existing?.[f] ?? null : req.body[f]));
    if (existing) {
      db.prepare(`UPDATE company_settings SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = 1`).run(...values);
    } else {
      db.prepare(
        `INSERT INTO company_settings (id, ${fields.join(', ')}) VALUES (1, ${fields.map(() => '?').join(', ')})`
      ).run(...values);
    }
    res.json(db.prepare('SELECT * FROM company_settings WHERE id = 1').get());
  })
);

export default router;
