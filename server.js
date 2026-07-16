import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initDatabase } from './database/db.js';
import membersRouter from './routes/members.js';
import paymentsRouter from './routes/payments.js';
import adminRouter from './routes/admin.js';
import exportRouter from './routes/export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure uploads directory exists ─────────────────────────────────────────────

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads/ directory');
}

// ── Middleware ───────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// ── Routes ──────────────────────────────────────────────────────────────────────

app.use('/api/members', membersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/export', exportRouter);

// ── Health check ────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'Spartan Cave Gym API', timestamp: new Date().toISOString() });
});

// ── 404 handler ─────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// ── Error handling middleware ────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('❌ Unhandled Error:', err.stack || err.message);

  // Handle multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  if (err.message && err.message.includes('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ────────────────────────────────────────────────────────────────

async function startServer() {
  try {
    // Initialize database before starting
    await initDatabase();

    app.listen(PORT, () => {
      console.log('');
      console.log('🏛️  ═══════════════════════════════════════════');
      console.log('🏛️   SPARTAN CAVE — Gym Membership System');
      console.log(`🏛️   Server running at http://localhost:${PORT}`);
      console.log('🏛️  ═══════════════════════════════════════════');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
