import { Router } from 'express';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import db from '../database/db.js';
import os from 'os';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Helper to get local network IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Find non-internal IPv4 address
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ── GET /api/export/excel — Export all members to Excel ─────────────────────────

router.get('/excel', authMiddleware, async (req, res) => {
  try {
    const members = db.prepare('SELECT * FROM members ORDER BY id DESC').all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Spartan Cave Gym';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Members', {
      headerFooter: { firstHeader: 'Spartan Cave Gym — Members List' },
    });

    // Define columns
    worksheet.columns = [
      { header: 'Member ID', key: 'member_id', width: 18 },
      { header: 'Full Name', key: 'full_name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Plan', key: 'membership_plan', width: 15 },
      { header: 'Amount (₹)', key: 'amount', width: 12 },
      { header: 'Payment Mode', key: 'payment_mode', width: 14 },
      { header: 'Payment Status', key: 'payment_status', width: 14 },
      { header: 'Registration Date', key: 'registration_date', width: 16 },
      { header: 'Fee Submission Date', key: 'fee_submission_date', width: 18 },
      { header: 'End Date', key: 'end_date', width: 14 },
      { header: 'Status', key: 'status', width: 10 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D2D2D' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    // Add data rows
    for (const member of members) {
      worksheet.addRow({
        member_id: member.member_id,
        full_name: member.full_name,
        phone: member.phone,
        gender: member.gender,
        membership_plan: member.membership_plan,
        amount: member.amount,
        payment_mode: member.payment_mode,
        payment_status: member.payment_status,
        registration_date: member.registration_date,
        fee_submission_date: member.fee_submission_date || '—',
        end_date: member.end_date,
        status: member.status,
      });
    }

    // Add borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=spartan-cave-members-${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting Excel:', err.message);
    res.status(500).json({ error: 'Failed to export Excel file' });
  }
});

// ── GET /api/export/qrcode — Generate QR code for registration page ─────────────

router.get('/qrcode', authMiddleware, async (req, res) => {
  try {
    const localIp = getLocalIpAddress();
    const port = process.env.PORT || 3000;
    const defaultUrl = `http://${localIp}:${port}/register.html`;
    const baseUrl = req.query.baseUrl || defaultUrl;

    const qrDataUrl = await QRCode.toDataURL(baseUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    res.json({ qrDataUrl, url: baseUrl });
  } catch (err) {
    console.error('Error generating QR code:', err.message);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── GET /api/export/payment-qr — Generate UPI payment QR code ───────────────────

router.get('/payment-qr', async (req, res) => {
  try {
    const amount = req.query.amount;
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'A valid amount query parameter is required' });
    }

    const upiUrl = `upi://pay?pa=ayushmittal288@okaxis&pn=Spartan Cave&am=${amount}&cu=INR`;
    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    res.json({ qrDataUrl, upiUrl });
  } catch (err) {
    console.error('Error generating payment QR:', err.message);
    res.status(500).json({ error: 'Failed to generate payment QR code' });
  }
});

export default router;
