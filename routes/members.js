import { Router } from 'express';
import db, {
  generateMemberId,
  PLAN_AMOUNTS,
  calculateEndDate,
  todayDate,
} from '../database/db.js';

const router = Router();

// ── POST /api/members — Register new member ────────────────────────────────────

router.post('/', (req, res) => {
  try {
    const { full_name, phone, gender, membership_plan, payment_mode, payment_screenshot } = req.body;

    // Validate required fields
    if (!full_name || !phone || !gender || !membership_plan || !payment_mode) {
      return res.status(400).json({
        error: 'Missing required fields: full_name, phone, gender, membership_plan, payment_mode',
      });
    }

    // Validate plan
    if (!PLAN_AMOUNTS[membership_plan]) {
      return res.status(400).json({ error: `Invalid membership_plan. Must be one of: ${Object.keys(PLAN_AMOUNTS).join(', ')}` });
    }

    // Validate gender
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender. Must be Male, Female, or Other' });
    }

    // Validate payment_mode
    if (!['cash', 'online'].includes(payment_mode)) {
      return res.status(400).json({ error: 'Invalid payment_mode. Must be cash or online' });
    }

    // Check for duplicate: same name + same phone together
    const existingMember = db.prepare(
      'SELECT id FROM members WHERE LOWER(full_name) = LOWER(?) AND phone = ?'
    ).get(full_name, phone);
    if (existingMember) {
      return res.status(400).json({ error: 'A member with this name and phone number is already registered. Use "Renew Membership" to extend your plan.' });
    }

    const member_id = generateMemberId();
    const amount = PLAN_AMOUNTS[membership_plan];
    const registration_date = todayDate();
    const end_date = calculateEndDate(registration_date, membership_plan);

    const screenshotPath = (payment_mode === 'online' && payment_screenshot) ? payment_screenshot : null;
    const payment_status = payment_mode === 'online' ? 'paid' : 'pending';
    const fee_submission_date = payment_mode === 'online' ? registration_date : null;

    const stmt = db.prepare(`
      INSERT INTO members (member_id, full_name, phone, gender, membership_plan, amount, payment_mode, payment_status, payment_screenshot, registration_date, fee_submission_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(member_id, full_name, phone, gender, membership_plan, amount, payment_mode, payment_status, screenshotPath, registration_date, fee_submission_date, end_date);

    console.log('lastInsertRowid:', result.lastInsertRowid);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    console.log('member from DB:', member);

    res.status(201).json({ message: 'Member registered successfully', member });
  } catch (err) {
    console.error('Error registering member:', err.message);
    res.status(500).json({ error: 'Failed to register member' });
  }
});

// ── GET /api/members/stats — Dashboard statistics ───────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS count FROM members').get().count;
    const active = db.prepare("SELECT COUNT(*) AS count FROM members WHERE status = 'active'").get().count;

    const revenueRow = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM members WHERE payment_status = 'paid'").get();
    const totalRevenue = revenueRow.total;

    const cashCount = db.prepare("SELECT COUNT(*) AS count FROM members WHERE payment_mode = 'cash'").get().count;
    const onlineCount = db.prepare("SELECT COUNT(*) AS count FROM members WHERE payment_mode = 'online'").get().count;

    const totalPaidOrAll = cashCount + onlineCount;
    const cashPercent = totalPaidOrAll > 0 ? (cashCount / totalPaidOrAll) * 100 : 0;
    const onlinePercent = totalPaidOrAll > 0 ? (onlineCount / totalPaidOrAll) * 100 : 0;

    const monthly = db.prepare("SELECT COUNT(*) AS count FROM members WHERE membership_plan = 'Monthly'").get().count;
    const quarterly = db.prepare("SELECT COUNT(*) AS count FROM members WHERE membership_plan = 'Quarterly'").get().count;
    const halfYearly = db.prepare("SELECT COUNT(*) AS count FROM members WHERE membership_plan = 'Half-yearly'").get().count;
    const yearly = db.prepare("SELECT COUNT(*) AS count FROM members WHERE membership_plan = 'Yearly'").get().count;

    res.json({
      totalMembers: total,
      activeMembers: active,
      totalRevenue,
      cashCount,
      onlineCount,
      cashPercent,
      onlinePercent,
      planBreakdown: { monthly, quarterly, halfYearly, yearly },
    });
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ── GET /api/members — List all members (with optional filters) ─────────────────

router.get('/', (req, res) => {
  try {
    const { search, plan, payment_mode, status } = req.query;

    let query = 'SELECT * FROM members WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (full_name LIKE ? OR phone LIKE ? OR member_id LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (plan) {
      query += ' AND membership_plan = ?';
      params.push(plan);
    }

    if (payment_mode) {
      query += ' AND payment_mode = ?';
      params.push(payment_mode);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC';

    const members = db.prepare(query).all(...params);
    res.json(members);
  } catch (err) {
    console.error('Error listing members:', err.message);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ── GET /api/members/lookup — Find member by phone number ───────────────────────

router.get('/lookup', (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Please provide a valid 10-digit phone number' });
    }

    const member = db.prepare('SELECT * FROM members WHERE phone = ?').get(phone);
    if (!member) {
      return res.status(404).json({ error: 'No member found with this phone number' });
    }

    // Check if membership is expired
    const today = todayDate();
    const isExpired = member.end_date < today;
    member.is_expired = isExpired;
    if (isExpired && member.status === 'active') {
      db.prepare("UPDATE members SET status = 'expired' WHERE member_id = ?").run(member.member_id);
      member.status = 'expired';
    }

    res.json(member);
  } catch (err) {
    console.error('Error looking up member:', err.message);
    res.status(500).json({ error: 'Failed to look up member' });
  }
});

// ── GET /api/members/:id — Get single member by member_id ───────────────────────

router.get('/:id', (req, res) => {
  try {
    const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(req.params.id);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json(member);
  } catch (err) {
    console.error('Error fetching member:', err.message);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

// ── PUT /api/members/:id — Update member details ────────────────────────────────

router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM members WHERE member_id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const {
      full_name,
      phone,
      gender,
      membership_plan,
      payment_mode,
      payment_status,
      payment_screenshot,
      status,
    } = req.body;

    // Recalculate amount and end_date if plan changed
    let amount = existing.amount;
    let end_date = existing.end_date;
    if (membership_plan && membership_plan !== existing.membership_plan) {
      if (!PLAN_AMOUNTS[membership_plan]) {
        return res.status(400).json({ error: `Invalid membership_plan. Must be one of: ${Object.keys(PLAN_AMOUNTS).join(', ')}` });
      }
      amount = PLAN_AMOUNTS[membership_plan];
      end_date = calculateEndDate(existing.registration_date, membership_plan);
    }

    const stmt = db.prepare(`
      UPDATE members SET
        full_name          = COALESCE(?, full_name),
        phone              = COALESCE(?, phone),
        gender             = COALESCE(?, gender),
        membership_plan    = COALESCE(?, membership_plan),
        amount             = ?,
        payment_mode       = COALESCE(?, payment_mode),
        payment_status     = COALESCE(?, payment_status),
        payment_screenshot = COALESCE(?, payment_screenshot),
        status             = COALESCE(?, status),
        end_date           = ?
      WHERE member_id = ?
    `);

    stmt.run(
      full_name || null,
      phone || null,
      gender || null,
      membership_plan || null,
      amount,
      payment_mode || null,
      payment_status || null,
      payment_screenshot || null,
      status || null,
      end_date,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM members WHERE member_id = ?').get(req.params.id);
    res.json({ message: 'Member updated successfully', member: updated });
  } catch (err) {
    console.error('Error updating member:', err.message);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// ── DELETE /api/members/:id — Delete member ─────────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM members WHERE member_id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }

    db.prepare('DELETE FROM members WHERE member_id = ?').run(req.params.id);
    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    console.error('Error deleting member:', err.message);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// ── POST /api/members/renew — Renew membership ─────────────────────────────────

router.post('/renew', (req, res) => {
  try {
    const { phone, membership_plan, payment_mode, payment_screenshot } = req.body;

    if (!phone || !membership_plan || !payment_mode) {
      return res.status(400).json({ error: 'Missing required fields: phone, membership_plan, payment_mode' });
    }

    if (!PLAN_AMOUNTS[membership_plan]) {
      return res.status(400).json({ error: `Invalid membership_plan. Must be one of: ${Object.keys(PLAN_AMOUNTS).join(', ')}` });
    }

    if (!['cash', 'online'].includes(payment_mode)) {
      return res.status(400).json({ error: 'Invalid payment_mode. Must be cash or online' });
    }

    const member = db.prepare('SELECT * FROM members WHERE phone = ?').get(phone);
    if (!member) {
      return res.status(404).json({ error: 'No member found with this phone number' });
    }

    const amount = PLAN_AMOUNTS[membership_plan];
    const registration_date = todayDate();
    const end_date = calculateEndDate(registration_date, membership_plan);
    const screenshotPath = (payment_mode === 'online' && payment_screenshot) ? payment_screenshot : null;
    const payment_status = payment_mode === 'online' ? 'paid' : 'pending';
    const fee_submission_date = payment_mode === 'online' ? registration_date : null;

    db.prepare(`
      UPDATE members SET
        membership_plan = ?,
        amount = ?,
        payment_mode = ?,
        payment_status = ?,
        payment_screenshot = COALESCE(?, payment_screenshot),
        registration_date = ?,
        fee_submission_date = ?,
        end_date = ?,
        status = 'active'
      WHERE phone = ?
    `).run(
      membership_plan, amount, payment_mode, payment_status,
      screenshotPath, registration_date, fee_submission_date,
      end_date, phone
    );

    const updated = db.prepare('SELECT * FROM members WHERE phone = ?').get(phone);
    res.json({ message: 'Membership renewed successfully', member: updated });
  } catch (err) {
    console.error('Error renewing membership:', err.message);
    res.status(500).json({ error: 'Failed to renew membership' });
  }
});

export default router;

