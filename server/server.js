/**
 * server.js — Tiny Express + SQLite backend for the TMS frontend.
 *
 * Serves the static frontend from the project root and a REST API
 * under /api that mirrors the old IndexedDB-wrapper contract.
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT        = path.join(__dirname, '..');
const DB_PATH     = path.join(ROOT, 'tms.db');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Pre-schema migration: older DBs had a `backtests` table; rename it to
// `journals` so CREATE TABLE IF NOT EXISTS sees it and skips creation.
try {
  const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  if (tableNames.includes('backtests') && !tableNames.includes('journals')) {
    const migrate = db.transaction(() => {
      db.exec('DROP INDEX IF EXISTS idx_backtests_strategy');
      db.exec('DROP INDEX IF EXISTS idx_backtests_account');
      db.exec('DROP INDEX IF EXISTS idx_backtests_created');
      db.exec('ALTER TABLE backtests RENAME TO journals');
    });
    migrate();
    console.log('[migrate] renamed backtests → journals');
  }
} catch (err) {
  console.warn('[migrate] backtests → journals:', err.message);
}

db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Lightweight migrations for older DB files
try {
  const cols = db.prepare('PRAGMA table_info(journals)').all().map(c => c.name);
  if (!cols.includes('amount')) db.exec('ALTER TABLE journals ADD COLUMN amount REAL');
} catch (err) {
  console.warn('[migrate] journals.amount:', err.message);
}

// ── Field mapping (snake_case DB ↔ camelCase JS) ─────────
const MAPPERS = {
  accounts: {
    toDb: a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      company: a.company ?? null,
      capital: a.capital ?? null,
      status: a.status ?? null,
      rules: JSON.stringify(a.rules ?? {}),
      strategy_ids: JSON.stringify(a.strategyIds ?? []),
      ea_name: a.eaName ?? null,
      created_at: a.createdAt ?? Date.now(),
      updated_at: a.updatedAt ?? Date.now(),
    }),
    fromDb: r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      company: r.company,
      capital: r.capital,
      status: r.status,
      rules: r.rules ? JSON.parse(r.rules) : {},
      strategyIds: r.strategy_ids ? JSON.parse(r.strategy_ids) : [],
      eaName: r.ea_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  },
  strategies: {
    toDb: s => ({
      id: s.id,
      name: s.name,
      color: s.color ?? null,
      description: s.description ?? null,
      entry_methods: JSON.stringify(s.entryMethods ?? []),
      timeframes: JSON.stringify(s.timeframes ?? []),
      instruments: JSON.stringify(s.instruments ?? []),
      preferred_rr: s.preferredRR ?? null,
      max_sl_pips: s.maxSLPips ?? null,
      notes: s.notes ?? null,
      created_at: s.createdAt ?? Date.now(),
      updated_at: s.updatedAt ?? Date.now(),
    }),
    fromDb: r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description,
      entryMethods: r.entry_methods ? JSON.parse(r.entry_methods) : [],
      timeframes: r.timeframes ? JSON.parse(r.timeframes) : [],
      instruments: r.instruments ? JSON.parse(r.instruments) : [],
      preferredRR: r.preferred_rr,
      maxSLPips: r.max_sl_pips,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  },
  journals: {
    toDb: b => ({
      id: b.id,
      strategy_id: b.strategyId ?? null,
      account_id: b.accountId ?? null,
      instrument: b.instrument ?? null,
      timeframe: b.timeframe ?? null,
      direction: b.direction ?? null,
      entry_date: b.entryDate ?? null,
      result: b.result ?? null,
      r_achieved: b.rAchieved ?? null,
      amount: b.amount ?? null,
      screenshot_path: b.screenshotPath ?? null,
      description: b.description ?? null,
      tags: JSON.stringify(b.tags ?? []),
      created_at: b.createdAt ?? Date.now(),
      updated_at: b.updatedAt ?? Date.now(),
    }),
    fromDb: r => ({
      id: r.id,
      strategyId: r.strategy_id,
      accountId: r.account_id,
      instrument: r.instrument,
      timeframe: r.timeframe,
      direction: r.direction,
      entryDate: r.entry_date,
      result: r.result,
      rAchieved: r.r_achieved,
      amount: r.amount,
      screenshotPath: r.screenshot_path,
      description: r.description,
      tags: r.tags ? JSON.parse(r.tags) : [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  },
};

const STORES = Object.keys(MAPPERS);
const isStore = s => STORES.includes(s);

// ── App ──────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve the frontend + uploaded screenshots
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(ROOT, { index: 'index.html' }));

// Multer disk storage for screenshots
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.png').toLowerCase();
    const id = crypto.randomBytes(6).toString('hex');
    cb(null, `bt-${Date.now()}-${id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads allowed'));
    cb(null, true);
  },
});

// ── API ──────────────────────────────────────────────────
app.get('/api/:store', (req, res) => {
  const { store } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });
  const rows = db.prepare(`SELECT * FROM ${store} ORDER BY created_at DESC`).all();
  res.json(rows.map(MAPPERS[store].fromDb));
});

app.get('/api/:store/:id', (req, res) => {
  const { store, id } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });
  const row = db.prepare(`SELECT * FROM ${store} WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(MAPPERS[store].fromDb(row));
});

app.put('/api/:store', (req, res) => {
  const { store } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });
  const obj = req.body || {};
  if (!obj.id) return res.status(400).json({ error: 'id required' });

  const row = MAPPERS[store].toDb(obj);
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(',');
  const sql = `INSERT INTO ${store} (${cols.join(',')}) VALUES (${placeholders})
               ON CONFLICT(id) DO UPDATE SET ${updates}`;
  db.prepare(sql).run(...cols.map(c => row[c]));

  const saved = db.prepare(`SELECT * FROM ${store} WHERE id = ?`).get(obj.id);
  res.json(MAPPERS[store].fromDb(saved));
});

app.delete('/api/:store/:id', (req, res) => {
  const { store, id } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });

  // Cascade: delete screenshot file when removing a journal
  if (store === 'journals') {
    const row = db.prepare('SELECT screenshot_path FROM journals WHERE id = ?').get(id);
    if (row?.screenshot_path) deleteUpload(row.screenshot_path);
  }

  db.prepare(`DELETE FROM ${store} WHERE id = ?`).run(id);
  res.status(204).end();
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

function deleteUpload(relPath) {
  const clean = String(relPath).replace(/^\/+/, '');
  const abs = path.resolve(ROOT, clean);
  if (!abs.startsWith(UPLOADS_DIR)) return;  // guard against traversal
  fs.promises.unlink(abs).catch(() => {});
}

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`TMS server → http://localhost:${PORT}`);
  console.log(`Database   → ${DB_PATH}`);
  console.log(`Uploads    → ${UPLOADS_DIR}`);
});
