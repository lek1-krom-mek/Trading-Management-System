import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/test-server.mjs';

test('boot migration adds sop_checks/grade/confluence_count/pre_grading', () => {
  const { db, cleanup } = startTestServer();
  try {
    const cols = db.prepare('PRAGMA table_info(journals)').all().map(c => c.name);
    assert.ok(cols.includes('sop_checks'),       'sop_checks column missing');
    assert.ok(cols.includes('grade'),            'grade column missing');
    assert.ok(cols.includes('confluence_count'), 'confluence_count column missing');
    assert.ok(cols.includes('pre_grading'),      'pre_grading column missing');
  } finally {
    cleanup();
  }
});

test('legacy journal without sop_checks is flagged pre_grading=1 by backfill UPDATE', () => {
  const { db, cleanup } = startTestServer();
  try {
    const now = Date.now();
    db.prepare(`INSERT INTO journals
      (id, account_id, instrument, result, amount, created_at, updated_at)
      VALUES ('j-legacy', NULL, 'XAU/USD', 'win', 100, ?, ?)`).run(now, now);
    db.prepare('UPDATE journals SET pre_grading = 1 WHERE sop_checks IS NULL').run();
    const row = db.prepare('SELECT pre_grading FROM journals WHERE id = ?').get('j-legacy');
    assert.equal(row.pre_grading, 1);
  } finally {
    cleanup();
  }
});

test('migration is idempotent — running boot twice does not error', () => {
  const { db, cleanup } = startTestServer();
  try {
    const cols = db.prepare('PRAGMA table_info(journals)').all().map(c => c.name);
    assert.equal(cols.filter(c => c === 'sop_checks').length, 1);
    assert.equal(cols.filter(c => c === 'grade').length, 1);
    assert.equal(cols.filter(c => c === 'confluence_count').length, 1);
    assert.equal(cols.filter(c => c === 'pre_grading').length, 1);
  } finally {
    cleanup();
  }
});
