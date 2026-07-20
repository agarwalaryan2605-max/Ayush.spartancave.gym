import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db, { todayDate } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';

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

router.put('/:memberId', authMiddleware, (req, res) => {
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

router.get('/summary', authMiddleware, (req, res) => {
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
    
    // Read the uploaded file and convert to Base64
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64Data = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;

    // Clean up file from local disk to save space/stateless compatibility
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkErr) {
      console.warn('Temporary file cleanup failed:', unlinkErr.message);
    }

    // If memberId provided, link screenshot to member
    if (memberId) {
      const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      db.prepare('UPDATE members SET payment_screenshot = ? WHERE member_id = ?').run(base64Data, memberId);
    }

    res.json({ message: 'Screenshot uploaded successfully', filePath: base64Data });
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

// ── POST /api/payments/clear-screenshots — Purge verified screenshots to free space ──
router.post('/clear-screenshots', authMiddleware, (req, res) => {
  try {
    const result = db.prepare("UPDATE members SET payment_screenshot = NULL WHERE payment_status = 'paid' AND payment_screenshot IS NOT NULL").run();
    res.json({ message: 'Verified payment screenshots cleared successfully', clearedCount: result.changes });
  } catch (err) {
    console.error('Error clearing screenshots:', err.message);
    res.status(500).json({ error: 'Failed to clear payment screenshots' });
  }
});

// ── POST /api/payments/clear-screenshot/:memberId — Clear single screenshot ──
router.post('/clear-screenshot/:memberId', authMiddleware, (req, res) => {
  try {
    const { memberId } = req.params;
    db.prepare("UPDATE members SET payment_screenshot = NULL WHERE member_id = ?").run(memberId);
    res.json({ message: 'Screenshot cleared for member' });
  } catch (err) {
    console.error('Error clearing member screenshot:', err.message);
    res.status(500).json({ error: 'Failed to clear screenshot' });
  }
});

// ── GET /api/payments/screenshots-list — List all members with payment screenshots ──
router.get('/screenshots-list', authMiddleware, (req, res) => {
  try {
    const members = db.prepare(`
      SELECT member_id, full_name, phone, membership_plan, amount, payment_mode, payment_status, payment_screenshot, registration_date
      FROM members
      WHERE payment_screenshot IS NOT NULL AND payment_screenshot != ''
      ORDER BY id DESC
    `).all();
    res.json(members);
  } catch (err) {
    console.error('Error fetching screenshots list:', err.message);
    res.status(500).json({ error: 'Failed to fetch screenshots list' });
  }
});

// ── POST /api/payments/delete-selected-screenshots — Bulk delete selected screenshots ──
router.post('/delete-selected-screenshots', authMiddleware, (req, res) => {
  try {
    const { memberIds } = req.body;
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'No member IDs provided for deletion' });
    }

    const placeholders = memberIds.map(() => '?').join(',');
    const result = db.prepare(`UPDATE members SET payment_screenshot = NULL WHERE member_id IN (${placeholders})`).run(...memberIds);
    res.json({ message: 'Selected payment screenshots deleted successfully', deletedCount: result.changes });
  } catch (err) {
    console.error('Error deleting selected screenshots:', err.message);
    res.status(500).json({ error: 'Failed to delete selected screenshots' });
  }
});

export default router;
