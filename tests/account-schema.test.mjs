import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/test-server.mjs';

test('accounts table has personal_daily_cap_pct + firm_daily_cap_pct after boot', () => {
  const { db, cleanup } = startTestServer();
  try {
    const cols = db.prepare('PRAGMA table_info(accounts)').all().map(c => c.name);
    assert.ok(cols.includes('personal_daily_cap_pct'), 'personal_daily_cap_pct missing');
    assert.ok(cols.includes('firm_daily_cap_pct'),     'firm_daily_cap_pct missing');
  } finally { cleanup(); }
});

test('new account gets default daily-cap values 3.0 / 5.0', () => {
  const { db, cleanup } = startTestServer();
  try {
    const now = Date.now();
    db.prepare(`INSERT INTO accounts (id, name, type, created_at, updated_at)
      VALUES ('a-new', 'New Account', 'own_funds', ?, ?)`).run(now, now);
    const row = db.prepare('SELECT personal_daily_cap_pct, firm_daily_cap_pct FROM accounts WHERE id = ?').get('a-new');
    assert.equal(row.personal_daily_cap_pct, 3.0);
    assert.equal(row.firm_daily_cap_pct, 5.0);
  } finally { cleanup(); }
});

test('migration is idempotent — running boot twice does not error', () => {
  const { db, cleanup } = startTestServer();
  try {
    const cols = db.prepare('PRAGMA table_info(accounts)').all().map(c => c.name);
    assert.equal(cols.filter(c => c === 'personal_daily_cap_pct').length, 1);
    assert.equal(cols.filter(c => c === 'firm_daily_cap_pct').length, 1);
  } finally { cleanup(); }
});
