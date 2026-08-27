import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  authRequired,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { entity_type, entity_id, user_id, from, to } = req.query;
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (entity_type) {
      sql += ' AND entity_type = ?';
      params.push(entity_type);
    }
    if (entity_id) {
      sql += ' AND entity_id = ?';
      params.push(entity_id);
    }
    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(user_id);
    }
    if (from) {
      sql += ' AND date(created_at) >= date(?)';
      params.push(from);
    }
    if (to) {
      sql += ' AND date(created_at) <= date(?)';
      params.push(to);
    }
    sql += ' ORDER BY id DESC LIMIT 500';
    res.json(db.prepare(sql).all(...params));
  })
);

export default router;
