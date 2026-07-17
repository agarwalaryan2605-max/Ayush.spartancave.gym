import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database/db.js';
import { createToken, verifyToken } from '../middleware/auth.js';

const router = Router();

// ── POST /api/admin/login — Admin login ─────────────────────────────────────────

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = bcrypt.compareSync(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = createToken(admin.username);

    res.json({ message: 'Login successful', token, username: admin.username });
  } catch (err) {
    console.error('Error during login:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/admin/verify — Verify token ────────────────────────────────────────

router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided', valid: false });
    }

    // Support both "Bearer <token>" and plain "<token>"
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token', valid: false });
    }

    res.json({ valid: true, username: decoded.username });
  } catch (err) {
    console.error('Error verifying token:', err.message);
    res.status(500).json({ error: 'Verification failed', valid: false });
  }
});

// ── POST /api/admin/logout — Invalidate token ──────────────────────────────────

router.post('/logout', (req, res) => {
  // Stateless tokens are invalidated by removing them from client's storage (localStorage)
  res.json({ message: 'Logged out successfully' });
});

export default router;
