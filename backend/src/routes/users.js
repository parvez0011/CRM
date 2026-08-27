import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
const allowedRoles = new Set(['admin', 'manager', 'staff']);

function validateAccount(email, password, role) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  if (password && (password.length < 12 || password.length > 128)) {
    return 'Password must be between 12 and 128 characters';
  }
  if (role && !allowedRoles.has(role)) return 'Invalid role';
  return null;
}

router.get(
  '/',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(db.prepare('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id DESC').all());
  })
);

router.post(
  '/',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = req.body.role || 'staff';
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    const validationError = validateAccount(email, password, role);
    if (validationError) return res.status(400).json({ error: validationError });
    const hash = bcrypt.hashSync(password, 12);
    try {
      const info = db
        .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(name, email, hash, role);
      res.status(201).json(db.prepare('SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?').get(info.lastInsertRowid));
    } catch (err) {
      res.status(400).json({ error: 'A user with this email already exists' });
    }
  })
);

router.put(
  '/:id',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : existing.name;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : existing.email;
    const role = req.body.role ?? existing.role;
    const { is_active, password } = req.body;
    const validationError = validateAccount(email, password, role);
    if (validationError) return res.status(400).json({ error: validationError });
    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, is_active = ? WHERE id = ?').run(
      name,
      email,
      role,
      is_active === undefined ? existing.is_active : (is_active ? 1 : 0),
      req.params.id
    );
    if (password) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), req.params.id);
    }
    res.json(db.prepare('SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

export default router;
