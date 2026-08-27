import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { JWT_SECRET } from '../config/auth.js';

const router = Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookie = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});
const dummyPasswordHash = '$2a$10$7EqJtq98hPqEX7fNZaFWoO5An8eKQj5Q6fYQ5Q5Q5Q5Q5Q5Q5Q5Q.';

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password || password.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
    const valid = await bcrypt.compare(password, user?.password_hash || dummyPasswordHash);
    if (!user || !user.is_active || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.cookie('ah_crm_session', token, sessionCookie);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie('ah_crm_session', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.status(204).end();
});

router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const user = db
      .prepare('SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?')
      .get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  })
);

export default router;
