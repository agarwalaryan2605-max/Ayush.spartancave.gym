import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { todayDate } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ── Multer Configuration ────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `screenshot-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// ── PUT /api/payments/:memberId — Update payment status ─────────────────────────

router.put('/:memberId', (req, res) => {
  try {
    const { memberId } = req.params;
    const { payment_status } = req.body;

    if (!payment_status || !['paid', 'pending'].includes(payment_status)) {
      return res.status(400).json({ error: 'Invalid payment_status. Must be paid or pending' });
    }

    const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    let fee_submission_date = member.fee_submission_date;
    if (payment_status === 'paid') {
      fee_submission_date = todayDate();
    } else {
      fee_submission_date = null;
    }

    db.prepare(`
      UPDATE members SET payment_status = ?, fee_submission_date = ? WHERE member_id = ?
    `).run(payment_status, fee_submission_date, memberId);

    const updated = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
    res.json({ message: 'Payment status updated', member: updated });
  } catch (err) {
    console.error('Error updating payment:', err.message);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// ── GET /api/payments/summary — Payment summary ─────────────────────────────────

router.get('/summary', (req, res) => {
  try {
    const totalCollected = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM members WHERE payment_status = 'paid'"
    ).get().total;

    const cashTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM members WHERE payment_status = 'paid' AND payment_mode = 'cash'"
    ).get().total;

    const onlineTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM members WHERE payment_status = 'paid' AND payment_mode = 'online'"
    ).get().total;

    const pendingTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM members WHERE payment_status = 'pending'"
    ).get().total;

    res.json({ totalCollected, cashTotal, onlineTotal, pendingTotal });
  } catch (err) {
    console.error('Error fetching payment summary:', err.message);
    res.status(500).json({ error: 'Failed to fetch payment summary' });
  }
});

// ── POST /api/payments/upload-screenshot — Upload payment screenshot ────────────

router.post('/upload-screenshot', upload.single('screenshot'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No screenshot file uploaded' });
    }

    const { memberId } = req.body;
    const filePath = `/uploads/${req.file.filename}`;

    // If memberId provided, link screenshot to member
    if (memberId) {
      const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      db.prepare('UPDATE members SET payment_screenshot = ? WHERE member_id = ?').run(filePath, memberId);
    }

    res.json({ message: 'Screenshot uploaded successfully', filePath });
  } catch (err) {
    console.error('Error uploading screenshot:', err.message);
    res.status(500).json({ error: 'Failed to upload screenshot' });
  }
});

// ── GET /api/payments/screenshot/:filename — Serve screenshot file ──────────────

router.get('/screenshot/:filename', (req, res) => {
  try {
    const filePath = path.join(__dirname, '..', 'uploads', req.params.filename);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error serving screenshot:', err.message);
    res.status(500).json({ error: 'Failed to serve screenshot' });
  }
});

export default router;
