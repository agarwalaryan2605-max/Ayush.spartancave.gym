import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'spartan_cave.db');

// ── Initialize pg pool if DATABASE_URL is defined ─────────────────────────────
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

// ── Initialize sql.js and create/load database ────────────────────────────────

let db;

/**
 * Wrapper around sql.js to provide a better-sqlite3 compatible API.
 * Routes can use dbWrapper.prepare(sql).get(...params), .all(...params), .run(...params)
 */
const dbWrapper = {
  prepare(sql) {
    return {
      get(...params) {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
      run(...params) {
        db.run(sql, params);
        const lastInsertRowid = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
        saveDatabase();
        return {
          lastInsertRowid,
          changes: db.getRowsModified(),
        };
      },
    };
  },
  exec(sql) {
    db.run(sql);
    saveDatabase();
  },
};

/**
 * Save database to disk and sync to cloud if configured
 */
function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    if (pool) {
      const base64 = buffer.toString('base64');
      pool.query(`
        INSERT INTO database_sync (id, data, updated_at)
        VALUES (1, $1, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = CURRENT_TIMESTAMP
      `, [base64])
      .then(() => console.log('☁️  SQLite database synced to PostgreSQL cloud successfully.'))
      .catch(err => console.error('❌ Cloud database sync failed:', err.message));
    }
  } catch (err) {
    console.error('Error saving database:', err.message);
  }
}

/**
 * Initialize the database. Must be called before using dbWrapper.
 */
export async function initDatabase() {
  if (pool) {
    console.log('🔄 Cloud Database Sync: Syncing database from PostgreSQL...');
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS database_sync (
          id INT PRIMARY KEY,
          data TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const res = await pool.query('SELECT data FROM database_sync WHERE id = 1');
      if (res.rows.length > 0) {
        const base64Data = res.rows[0].data;
        const fileBuffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(dbPath, fileBuffer);
        console.log('📂 SQLite database successfully loaded from PostgreSQL cloud backup!');
      } else {
        console.log('🆕 No cloud backup found. Initializing fresh database.');
      }
    } catch (syncErr) {
      console.error('❌ Cloud database synchronization failed:', syncErr.message);
    }
  }

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    console.log('📂 Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('🆕 Created new database');
  }

  // ── Create Tables ──────────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id           TEXT UNIQUE NOT NULL,
      full_name           TEXT NOT NULL,
      phone               TEXT NOT NULL,
      gender              TEXT NOT NULL CHECK(gender IN ('Male', 'Female', 'Other')),
      membership_plan     TEXT NOT NULL CHECK(membership_plan IN ('Monthly', 'Quarterly', 'Half-yearly', 'Yearly')),
      amount              REAL NOT NULL,
      payment_mode        TEXT NOT NULL CHECK(payment_mode IN ('cash', 'online')),
      payment_status      TEXT DEFAULT 'pending' CHECK(payment_status IN ('paid', 'pending')),
      payment_screenshot  TEXT,
      registration_date   TEXT NOT NULL,
      fee_submission_date TEXT,
      end_date            TEXT NOT NULL,
      created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
      status              TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  // ── Seed Default Admin ───────────────────────────────────────────────────────

  const existingAdmin = dbWrapper.prepare('SELECT id FROM admin WHERE username = ?').get('ayush');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    dbWrapper.prepare('INSERT INTO admin (username, password_hash) VALUES (?, ?)').run('ayush', hash);
    console.log('✅ Default admin seeded (username: ayush)');
  }

  saveDatabase();
  console.log('✅ Database initialized successfully');
}

// ── Helper: Generate Member ID ─────────────────────────────────────────────────

/**
 * Generates a unique member ID in the format SC-YYYY-XXXX
 * where YYYY is the current year and XXXX is a zero-padded sequence number.
 */
export function generateMemberId() {
  const year = new Date().getFullYear();
  const prefix = `SC-${year}-`;

  const row = dbWrapper.prepare(`
    SELECT member_id FROM members
    WHERE member_id LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(`${prefix}%`);

  let nextNum = 1;
  if (row) {
    const lastNum = parseInt(row.member_id.split('-')[2], 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

// ── Helper: Plan → Amount Mapping ──────────────────────────────────────────────

export const PLAN_AMOUNTS = {
  'Monthly': 1099,
  'Quarterly': 2999,
  'Half-yearly': 5499,
  'Yearly': 10999,
};

// ── Helper: Plan → Duration in Days ────────────────────────────────────────────

export const PLAN_DURATIONS = {
  'Monthly': 30,
  'Quarterly': 90,
  'Half-yearly': 180,
  'Yearly': 365,
};

/**
 * Calculate end date from a start date string (YYYY-MM-DD) and a plan name.
 */
export function calculateEndDate(startDate, plan) {
  const days = PLAN_DURATIONS[plan];
  if (!days) throw new Error(`Unknown plan: ${plan}`);

  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Returns today's date in YYYY-MM-DD format (local time).
 */
export function todayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default dbWrapper;
