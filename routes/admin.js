import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';

const router = Router();

// ── In-memory session store ─────────────────────────────────────────────────────

const sessions = new Map();

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

    const token = uuidv4();
    sessions.set(token, { username: admin.username, createdAt: new Date().toISOString() });

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

    if (!sessions.has(token)) {
      return res.status(401).json({ error: 'Invalid or expired token', valid: false });
    }

    const session = sessions.get(token);
    res.json({ valid: true, username: session.username });
  } catch (err) {
    console.error('Error verifying token:', err.message);
    res.status(500).json({ error: 'Verification failed', valid: false });
  }
});

// ── POST /api/admin/logout — Invalidate token ──────────────────────────────────

router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(400).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (sessions.has(token)) {
      sessions.delete(token);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error during logout:', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
