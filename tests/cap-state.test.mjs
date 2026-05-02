import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// computeCapState lives inside server.js. Loading server.js opens a DB, so
// give it a temp path so it doesn't touch the live tms.db.
const dir = mkdtempSync(join(tmpdir(), 'tms-cap-test-'));
process.env.TMS_DB_PATH = join(dir, 'cap.db');
const { computeCapState } = require('../server/server.js');

function call(pnl, balance, personalPct = 3, firmPct = 5) {
  return computeCapState({
    dailyPnlToday: pnl,
    startingCapital: balance,
    personalDailyCapPct: personalPct,
    firmDailyCapPct: firmPct,
  });
}

test('safe — pnl positive', () => {
  const r = call(50, 1000);
  assert.equal(r.capState, 'safe');
  assert.equal(r.personalCapPctUsed, 0);
});

test('safe — small loss under 40% of personal cap', () => {
  // personal cap = 3% of 1000 = $30. ~39% used = $11.70 loss
  const r = call(-11.70, 1000);
  assert.equal(r.capState, 'safe');
  assert.ok(r.personalCapPctUsed > 38 && r.personalCapPctUsed < 40);
});

test('caution — at 40% boundary', () => {
  // 40% of $30 = $12 loss
  const r = call(-12, 1000);
  assert.equal(r.capState, 'caution');
});

test('warning — at 70% boundary', () => {
  // 70% of $30 = $21 loss
  const r = call(-21, 1000);
  assert.equal(r.capState, 'warning');
});

test('breach_imminent — at 90% boundary', () => {
  const r = call(-27, 1000);
  assert.equal(r.capState, 'breach_imminent');
});

test('personal_breached — at 100% personal but firm not breached', () => {
  // -$30 = 100% personal, 60% firm
  const r = call(-30, 1000);
  assert.equal(r.capState, 'personal_breached');
});

test('firm_breached — over 100% firm', () => {
  // -$50 = ~167% personal, 100% firm
  const r = call(-50, 1000);
  assert.equal(r.capState, 'firm_breached');
});

test('positive pnl does not trigger any cap state above safe', () => {
  const r = call(200, 1000);
  assert.equal(r.capState, 'safe');
  assert.equal(r.firmCapPctUsed, 0);
});

test('zero balance is handled gracefully', () => {
  const r = call(-10, 0);
  assert.equal(r.capState, 'safe');
});

test('custom personal cap percentage', () => {
  // 5% personal cap on $1000 = $50; loss of $25 = 50% used → caution
  const r = call(-25, 1000, 5, 10);
  assert.equal(r.capState, 'caution');
});
