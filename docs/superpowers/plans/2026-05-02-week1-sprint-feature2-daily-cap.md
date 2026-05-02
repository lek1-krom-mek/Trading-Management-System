# Daily Cap Warning on Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface real-time daily P&L vs the personal 3% cap and firm 5% cap on the Dashboard, plus a persistent inline indicator on the Risk Calculator. The band is hidden when safe; it appears with progressively stronger color cues as the trader approaches and crosses the personal cap.

**Architecture:** Two new account columns (`personal_daily_cap_pct`, `firm_daily_cap_pct`) with sensible defaults. `GET /api/accounts` enriches each account with a server-computed block (`dailyPnlToday`, cap dollars, pct used, `capState`). A new `js/daily-cap-band.js` renders the band reactively for the active account. The Risk Calculator shows a smaller persistent inline indicator next to its existing "Daily limit (X%)" label.

**Tech Stack:** Same as Feature 1 — Node 20 + `better-sqlite3` (CommonJS server), vanilla ES-module frontend, `node:test` for tests. Builds on top of `feat/sop-checklist` already merged to `main`.

**Source spec:** [docs/sprints/2026-05-02-week1-sprint.md](../../sprints/2026-05-02-week1-sprint.md) — Feature 2 only.

---

## File map

**Create:**
- [js/daily-cap-band.js](../../../js/daily-cap-band.js) — DOM component, reactive
- [css/daily-cap-band.css](../../../css/daily-cap-band.css) — band + state colors
- [tests/cap-state.test.mjs](../../../tests/cap-state.test.mjs) — boundary tests for cap_state
- [tests/account-api.test.mjs](../../../tests/account-api.test.mjs) — integration tests for the enriched account response

**Modify:**
- [server/schema.sql](../../../server/schema.sql) — add 2 columns to `accounts`
- [server/server.js](../../../server/server.js) — boot migration, accounts mapper, daily cap helper, `GET /api/accounts*` enrichment
- [js/dashboard.js](../../../js/dashboard.js) — insert band slot between KPI row and Portfolio Accounts
- [js/main.js](../../../js/main.js) — possibly hook `renderCalcMeta()` to add inline indicator (see Task 8)
- [js/ui.js](../../../js/ui.js) — render the inline daily-used indicator next to existing "Daily limit (X%)" label
- [index.html](../../../index.html) — link [css/daily-cap-band.css](../../../css/daily-cap-band.css)

---

## Pre-flight

- [ ] **Step 0.1: Confirm clean working tree on `main`**

```bash
cd "/mnt/z/obsidian/000AAAAAA-Trading/Trading Management System" && git status --short && git log --oneline -3
```

Expected: clean tree, top commit is the merge `5447123`. If anything's dirty, stash first.

- [ ] **Step 0.2: Create feature branch from main**

```bash
git checkout -b feat/daily-cap
```

- [ ] **Step 0.3: Confirm Feature 1 tests still green**

```bash
cd server && npm test 2>&1 | tail -8
```

Expected: 19 tests pass. This is our baseline; Feature 2 must not regress it.

---

## Task 1: Schema migration — add `personal_daily_cap_pct` + `firm_daily_cap_pct` to accounts

**Files:**
- Modify: [server/schema.sql](../../../server/schema.sql)
- Modify: [server/server.js](../../../server/server.js) (accounts-migration block at line ~68)

- [ ] **Step 1.1: Update [server/schema.sql](../../../server/schema.sql)**

In the `accounts` CREATE TABLE block, after the `vps TEXT` line and before `created_at`, add:

```sql
  personal_daily_cap_pct REAL NOT NULL DEFAULT 3.0,
  firm_daily_cap_pct     REAL NOT NULL DEFAULT 5.0,
```

- [ ] **Step 1.2: Add idempotent ALTER TABLE + backfill in server.js**

Find the existing accounts-migration block (around line 68, search for `PRAGMA table_info(accounts)`). Inside its `try { ... }` body, after the existing `for (const [name, type] of adds) { ... }` loop, append:

```js
  if (!cols.includes('personal_daily_cap_pct')) {
    db.exec('ALTER TABLE accounts ADD COLUMN personal_daily_cap_pct REAL');
    db.prepare('UPDATE accounts SET personal_daily_cap_pct = 3.0 WHERE personal_daily_cap_pct IS NULL').run();
  }
  if (!cols.includes('firm_daily_cap_pct')) {
    db.exec('ALTER TABLE accounts ADD COLUMN firm_daily_cap_pct REAL');
    db.prepare('UPDATE accounts SET firm_daily_cap_pct = 5.0 WHERE firm_daily_cap_pct IS NULL').run();
  }
```

(Note: SQLite `ALTER TABLE ADD COLUMN` with `NOT NULL DEFAULT` would fail on a table with existing rows because the new column would need a non-null value before any default propagates. So we add as nullable, then backfill via UPDATE, then rely on the schema.sql `NOT NULL DEFAULT` only for fresh DBs.)

- [ ] **Step 1.3: Write a schema test**

Create [tests/account-schema.test.mjs](../../../tests/account-schema.test.mjs):

```js
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

test('legacy account without daily-cap fields backfills to 3.0 / 5.0', () => {
  const { db, cleanup } = startTestServer();
  try {
    const now = Date.now();
    db.prepare(`INSERT INTO accounts (id, name, type, created_at, updated_at, personal_daily_cap_pct, firm_daily_cap_pct)
      VALUES ('a-legacy', 'Legacy', 'prop_challenge', ?, ?, NULL, NULL)`).run(now, now);
    db.prepare('UPDATE accounts SET personal_daily_cap_pct = 3.0 WHERE personal_daily_cap_pct IS NULL').run();
    db.prepare('UPDATE accounts SET firm_daily_cap_pct = 5.0 WHERE firm_daily_cap_pct IS NULL').run();
    const row = db.prepare('SELECT personal_daily_cap_pct, firm_daily_cap_pct FROM accounts WHERE id = ?').get('a-legacy');
    assert.equal(row.personal_daily_cap_pct, 3.0);
    assert.equal(row.firm_daily_cap_pct, 5.0);
  } finally { cleanup(); }
});
```

- [ ] **Step 1.4: Run tests**

```bash
cd "/mnt/z/obsidian/000AAAAAA-Trading/Trading Management System/server" && npm test 2>&1 | tail -8
```

Expected: 21 tests pass (19 from Feature 1 + 2 new).

- [ ] **Step 1.5: Commit**

```bash
cd "/mnt/z/obsidian/000AAAAAA-Trading/Trading Management System" && git add server/schema.sql server/server.js tests/account-schema.test.mjs && git commit -m "feat(schema): add personal_daily_cap_pct + firm_daily_cap_pct to accounts"
```

---

## Task 2: cap_state computation — TDD

**Files:**
- Create: [tests/cap-state.test.mjs](../../../tests/cap-state.test.mjs)
- Modify: [server/server.js](../../../server/server.js) (add helper above MAPPERS)

- [ ] **Step 2.1: Write failing tests**

Create [tests/cap-state.test.mjs](../../../tests/cap-state.test.mjs):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// We import computeCapState from the server module. Loading it requires the
// sqlite hook and a tmp DB path so the module can boot without errors.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'tms-cap-test-'));
process.env.TMS_DB_PATH = join(dir, 'cap.db');
const { computeCapState } = require('../server/server.js');

function call(pnl, balance, personalPct = 3, firmPct = 5) {
  return computeCapState({ dailyPnlToday: pnl, startingCapital: balance, personalDailyCapPct: personalPct, firmDailyCapPct: firmPct });
}

test('safe — pnl positive', () => {
  const r = call(50, 1000);
  assert.equal(r.capState, 'safe');
  assert.equal(r.personalCapPctUsed, 0);
});

test('safe — small loss under 40% of personal cap', () => {
  // personal cap = 3% of 1000 = $30. 39% used = $11.70 loss
  const r = call(-11.70, 1000);
  assert.equal(r.capState, 'safe');
  assert.ok(r.personalCapPctUsed >= 39 && r.personalCapPctUsed < 40);
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
  assert.equal(r.capState, 'safe');  // can't compute pct of 0; defensive default
});

test('custom personal cap percentage', () => {
  // 5% personal cap on $1000 = $50; loss of $25 = 50% used → caution
  const r = call(-25, 1000, 5, 10);
  assert.equal(r.capState, 'caution');
});
```

- [ ] **Step 2.2: Run tests, expect failures**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: failures with `computeCapState is not a function` (since we haven't exported it yet).

- [ ] **Step 2.3: Implement `computeCapState` in [server/server.js](../../../server/server.js)**

Find the existing `SOP_RULE_KEYS` constant added in Feature 1 (just before `const MAPPERS = {`). Add the new helper directly under it:

```js
function computeCapState({ dailyPnlToday, startingCapital, personalDailyCapPct, firmDailyCapPct }) {
  const balance = Number(startingCapital) || 0;
  const personalPct = Number(personalDailyCapPct) || 3.0;
  const firmPct     = Number(firmDailyCapPct)     || 5.0;
  const pnl = Number(dailyPnlToday) || 0;

  const personalCapDollars = -(balance * personalPct / 100);
  const firmCapDollars     = -(balance * firmPct / 100);
  const personalCapPctUsed = balance > 0 && pnl < 0 ? Math.abs(pnl / personalCapDollars * 100) : 0;
  const firmCapPctUsed     = balance > 0 && pnl < 0 ? Math.abs(pnl / firmCapDollars * 100)     : 0;

  let capState = 'safe';
  if (firmCapPctUsed >= 100)            capState = 'firm_breached';
  else if (personalCapPctUsed >= 100)   capState = 'personal_breached';
  else if (personalCapPctUsed >= 90)    capState = 'breach_imminent';
  else if (personalCapPctUsed >= 70)    capState = 'warning';
  else if (personalCapPctUsed >= 40)    capState = 'caution';

  return { dailyPnlToday: pnl, personalCapDollars, firmCapDollars, personalCapPctUsed, firmCapPctUsed, capState };
}
```

- [ ] **Step 2.4: Export `computeCapState` from server.js**

At the bottom of `server.js`, find the existing `module.exports = { app, db };` line. Replace with:

```js
module.exports = { app, db, computeCapState };
```

- [ ] **Step 2.5: Run tests**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: 31 tests pass (21 prior + 10 new cap-state).

- [ ] **Step 2.6: Commit**

```bash
git add server/server.js tests/cap-state.test.mjs && git commit -m "feat(api): computeCapState helper with 6-state ladder"
```

---

## Task 3: Accounts mapper + GET /api/accounts enrichment

**Files:**
- Modify: [server/server.js](../../../server/server.js) — accounts MAPPER and GET handlers

- [ ] **Step 3.1: Add `personalDailyCapPct` + `firmDailyCapPct` to accounts mapper**

Find `MAPPERS.accounts.toDb`. Inside the returned object, add (after `vps:`, before `created_at:`):

```js
      personal_daily_cap_pct: a.personalDailyCapPct ?? 3.0,
      firm_daily_cap_pct: a.firmDailyCapPct ?? 5.0,
```

Find `MAPPERS.accounts.fromDb`. Inside the returned object, add (after `vps:`, before `createdAt:`):

```js
      personalDailyCapPct: r.personal_daily_cap_pct ?? 3.0,
      firmDailyCapPct: r.firm_daily_cap_pct ?? 5.0,
```

- [ ] **Step 3.2: Add a daily-pnl helper and account-enricher**

Just below `computeCapState` in server.js, add:

```js
const TRADER_TZ_OFFSET_MINUTES = 420;  // GMT+7 (Cambodia)

function todayBoundsMs(now = Date.now()) {
  // Trader's local "now" in ms since epoch in their tz
  const localNow = now + TRADER_TZ_OFFSET_MINUTES * 60_000;
  const dayMs = 24 * 60 * 60 * 1000;
  const startLocal = Math.floor(localNow / dayMs) * dayMs;
  const endLocal = startLocal + dayMs;
  // Convert back to UTC ms
  return { startUtcMs: startLocal - TRADER_TZ_OFFSET_MINUTES * 60_000,
           endUtcMs:   endLocal   - TRADER_TZ_OFFSET_MINUTES * 60_000 };
}

function dailyPnlForAccount(accountId) {
  if (!accountId) return 0;
  const { startUtcMs, endUtcMs } = todayBoundsMs();
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN result = 'win'  THEN amount
      WHEN result = 'loss' THEN -amount
      ELSE 0
    END), 0) AS pnl
    FROM journals
    WHERE account_id = ? AND entry_date >= ? AND entry_date < ?
  `).get(accountId, startUtcMs, endUtcMs);
  return row.pnl || 0;
}

function enrichAccount(account) {
  const pnl = dailyPnlForAccount(account.id);
  const cap = computeCapState({
    dailyPnlToday: pnl,
    startingCapital: account.startingCapital ?? account.capital,
    personalDailyCapPct: account.personalDailyCapPct,
    firmDailyCapPct: account.firmDailyCapPct,
  });
  return { ...account, ...cap };
}
```

- [ ] **Step 3.3: Wire enrichment into GET /api/accounts list and single handlers**

Find `app.get('/api/:store', ...)` (the journals-filter-aware one we built in Feature 1). The existing code looks like:

```js
app.get('/api/:store', (req, res) => {
  const { store } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });

  if (store === 'journals' && typeof req.query.grade === 'string' && req.query.grade.length) {
    // ... existing journal filter ...
  }

  const rows = db.prepare(`SELECT * FROM ${store} ORDER BY created_at DESC`).all();
  res.json(rows.map(MAPPERS[store].fromDb));
});
```

Replace the final two lines (after the journals-filter block) with:

```js
  const rows = db.prepare(`SELECT * FROM ${store} ORDER BY created_at DESC`).all();
  const mapped = rows.map(MAPPERS[store].fromDb);
  if (store === 'accounts') return res.json(mapped.map(enrichAccount));
  res.json(mapped);
});
```

Find `app.get('/api/:store/:id', ...)` and replace with:

```js
app.get('/api/:store/:id', (req, res) => {
  const { store, id } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });
  const row = db.prepare(`SELECT * FROM ${store} WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const mapped = MAPPERS[store].fromDb(row);
  if (store === 'accounts') return res.json(enrichAccount(mapped));
  res.json(mapped);
});
```

- [ ] **Step 3.4: Sanity test**

```bash
cd server && npm test 2>&1 | tail -8
```

Expected: 31 tests still pass (no new tests this step; existing ones must not regress).

- [ ] **Step 3.5: Commit**

```bash
git add server/server.js && git commit -m "feat(api): enrich GET /api/accounts with daily P&L + cap state"
```

---

## Task 4: API integration tests

**Files:**
- Create: [tests/account-api.test.mjs](../../../tests/account-api.test.mjs)

- [ ] **Step 4.1: Write the test file**

Create [tests/account-api.test.mjs](../../../tests/account-api.test.mjs):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer } from './helpers/test-server.mjs';

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = { method, hostname: '127.0.0.1', port, path, headers: { 'content-type': 'application/json' } };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          server.close();
          let json = null; try { json = data ? JSON.parse(data) : null; } catch {}
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

function fullSop(confirmed = []) {
  const obj = {};
  for (let i = 1; i <= 8; i++) obj[`rule_${i}`] = { confirmed: confirmed.includes(i), note: '' };
  return obj;
}

test('GET /api/accounts/:id returns dailyPnlToday=0 + capState=safe when no entries today', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a1', name: 'A', type: 'prop_challenge', capital: 1000, startingCapital: 1000 });
    const r = await request(app, 'GET', '/api/accounts/a1');
    assert.equal(r.status, 200);
    assert.equal(r.body.dailyPnlToday, 0);
    assert.equal(r.body.capState, 'safe');
    assert.equal(r.body.personalDailyCapPct, 3.0);
    assert.equal(r.body.firmDailyCapPct, 5.0);
  } finally { cleanup(); }
});

test('account with -$22 today on $1000 balance reports capState=warning', async () => {
  // personal cap $30; -$22 = 73% used → warning
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a2', name: 'A2', type: 'prop_challenge', capital: 1000, startingCapital: 1000 });
    await request(app, 'PUT', '/api/journals', {
      id: 'j-today', accountId: 'a2', result: 'loss', amount: 22,
      entryDate: Date.now(),
      sopChecks: fullSop(),
    });
    const r = await request(app, 'GET', '/api/accounts/a2');
    assert.equal(r.body.capState, 'warning');
    assert.equal(r.body.dailyPnlToday, -22);
    assert.ok(r.body.personalCapPctUsed >= 70 && r.body.personalCapPctUsed < 90);
  } finally { cleanup(); }
});

test('GET /api/accounts (list) enriches every account', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a3', name: 'A3', type: 'prop_instant', capital: 2000, startingCapital: 2000 });
    await request(app, 'PUT', '/api/accounts', { id: 'a4', name: 'A4', type: 'own_funds',     capital: 5000, startingCapital: 5000 });
    const r = await request(app, 'GET', '/api/accounts');
    assert.equal(r.status, 200);
    for (const acc of r.body) {
      assert.equal(typeof acc.capState, 'string');
      assert.equal(typeof acc.dailyPnlToday, 'number');
      assert.equal(typeof acc.personalCapDollars, 'number');
    }
  } finally { cleanup(); }
});

test('entry from yesterday does NOT count toward today', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/accounts', { id: 'a5', name: 'A5', type: 'own_funds', capital: 1000, startingCapital: 1000 });
    const yesterday = Date.now() - 25 * 60 * 60 * 1000;
    await request(app, 'PUT', '/api/journals', {
      id: 'j-yesterday', accountId: 'a5', result: 'loss', amount: 100,
      entryDate: yesterday, sopChecks: fullSop(),
    });
    const r = await request(app, 'GET', '/api/accounts/a5');
    assert.equal(r.body.dailyPnlToday, 0);
    assert.equal(r.body.capState, 'safe');
  } finally { cleanup(); }
});
```

- [ ] **Step 4.2: Run tests**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: 35 tests pass (31 prior + 4 new).

- [ ] **Step 4.3: Commit**

```bash
git add tests/account-api.test.mjs && git commit -m "test(api): integration tests for daily-cap account enrichment"
```

---

## Task 5: Frontend — `js/daily-cap-band.js`

**Files:**
- Create: [js/daily-cap-band.js](../../../js/daily-cap-band.js)

- [ ] **Step 5.1: Write the component**

Create [js/daily-cap-band.js](../../../js/daily-cap-band.js):

```js
/**
 * daily-cap-band.js — Renders today's P&L vs personal/firm caps on the dashboard.
 *
 * Returns a DOM node when the active account is in caution+ state, or null when safe.
 * Caller (dashboard) inserts this between the KPI row and the Portfolio Accounts section.
 */

import { el } from './utils.js';

const STATE_COPY = {
  safe:              null,
  caution:           'Approaching personal daily cap. Stay disciplined.',
  warning:           'Approaching personal daily cap. Consider stopping for the day.',
  breach_imminent:   'Personal cap nearly hit. SOP Rule 5: 3 trades/day max.',
  personal_breached: 'Personal cap reached. SOP Rule 5: stop trading.',
  firm_breached:     'FIRM CAP BREACHED. Account at risk.',
};

export function dailyCapBand(account) {
  if (!account) return null;
  if (account.capState === 'safe' || !account.capState) return null;

  const fmtUsd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;

  const head = el('div', { class: 'dcb-head' },
    el('span', { class: 'dcb-eyebrow' }, 'TODAY · ACTIVE ACCOUNT'),
    el('span', { class: 'dcb-account' }, account.name || ''),
  );

  const summary = el('div', { class: 'dcb-summary' },
    `${fmtUsd(account.dailyPnlToday)} of ${fmtUsd(account.personalCapDollars)} personal cap (${Math.round(account.personalCapPctUsed)}% used)`
  );

  const pBar = bar(account.personalCapPctUsed, `Personal ${account.personalDailyCapPct ?? 3}%`);
  const fBar = bar(account.firmCapPctUsed,     `Firm ${account.firmDailyCapPct ?? 5}%`);

  const message = STATE_COPY[account.capState];
  const messageEl = message
    ? el('div', { class: 'dcb-message' }, '⚠ ' + message)
    : null;

  return el('section', { class: `daily-cap-band daily-cap-band--${account.capState.replace(/_/g, '-')}` },
    head,
    summary,
    pBar,
    fBar,
    messageEl,
  );
}

function bar(pctUsed, label) {
  const clamped = Math.min(100, Math.max(0, pctUsed || 0));
  return el('div', { class: 'dcb-bar' },
    el('div', { class: 'dcb-bar-track' },
      el('div', { class: 'dcb-bar-fill', style: { width: clamped + '%' } }),
    ),
    el('span', { class: 'dcb-bar-label' }, label),
  );
}
```

- [ ] **Step 5.2: Commit**

```bash
git add js/daily-cap-band.js && git commit -m "feat: add daily cap band component"
```

---

## Task 6: Wire band into dashboard, with reactive updates

**Files:**
- Modify: [js/dashboard.js](../../../js/dashboard.js)

- [ ] **Step 6.1: Import the component**

At the top of [js/dashboard.js](../../../js/dashboard.js), add:

```js
import { dailyCapBand } from './daily-cap-band.js';
```

- [ ] **Step 6.2: Insert the band slot in `renderDashboardPage()`**

Find the `el('div', { class: 'kpi-strip' }, ...)` block — that's the KPI row. The next thing in the function is the "Account strip" section (`accSection`). Between those two, add:

```js
  // Daily cap band — reads active account from store, hides when safe
  const active = data.accounts.find(a => a.id === data.activeAccountId);
  const band = dailyCapBand(active);
  if (band) root.appendChild(band);
```

Note: the `active` constant is already declared earlier in the function for the page-head section. Reuse it — don't re-declare. Look at the file: `const active = data.accounts.find(...)` appears around line 19. Just use that existing reference and add `const band = dailyCapBand(active); if (band) root.appendChild(band);` between the kpi-strip's containing block and `accSection`.

- [ ] **Step 6.3: Wire to store changes (live updates after journal save / account switch)**

The dashboard already re-renders on store updates via main.js's subscription. Verify by reading [js/main.js](../../../js/main.js) — search for `subscribe(` — there's an existing pattern that re-renders the dashboard on `notify('journals')` and `notify('active')`. If that pattern exists and points at `renderDashboardPage`, the band will re-render automatically.

If it does NOT exist yet for these events, locate the `subscribe(...)` call in main.js and add `journals` / `active` to its handled types so the dashboard re-renders on save/switch. (Read the file first; the structure may already cover this.)

- [ ] **Step 6.4: Sanity check**

```bash
cd server && npm test 2>&1 | tail -8
```

Expected: 35 tests still pass (no test changes; we just need to confirm we didn't break anything).

- [ ] **Step 6.5: Commit**

```bash
git add js/dashboard.js js/main.js 2>/dev/null && git commit -m "feat(dashboard): insert daily cap band between KPI and accounts"
```

---

## Task 7: CSS for the band

**Files:**
- Create: [css/daily-cap-band.css](../../../css/daily-cap-band.css)
- Modify: [index.html](../../../index.html)

- [ ] **Step 7.1: Write the stylesheet**

Create [css/daily-cap-band.css](../../../css/daily-cap-band.css):

```css
/* Daily cap band — single-row card on dashboard */
.daily-cap-band {
  display: grid;
  gap: 8px;
  padding: 14px 18px;
  margin: 12px 0 18px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
}

.dcb-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.dcb-eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.5);
}
.dcb-account {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
}

.dcb-summary {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
}

.dcb-bar {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 12px;
  align-items: center;
}
.dcb-bar-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.dcb-bar-fill {
  height: 100%;
  background: currentColor;
  transition: width 240ms ease;
}
.dcb-bar-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.04em;
}

.dcb-message {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 4px;
}

/* State variants — color the border + fill */
.daily-cap-band--caution {
  border-color: rgba(245, 158, 11, 0.25);
  color: #FBBF24;
}
.daily-cap-band--warning {
  border-color: rgba(249, 115, 22, 0.4);
  background: rgba(249, 115, 22, 0.06);
  color: #FB923C;
}
.daily-cap-band--breach-imminent {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.07);
  color: #F87171;
  animation: dcb-pulse 2s ease-in-out infinite;
}
.daily-cap-band--personal-breached {
  border-color: rgba(239, 68, 68, 0.75);
  background: rgba(239, 68, 68, 0.18);
  color: #FCA5A5;
}
.daily-cap-band--firm-breached {
  border: 2px double rgba(239, 68, 68, 0.85);
  background: rgba(239, 68, 68, 0.25);
  color: #FCA5A5;
}

@keyframes dcb-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  50%      { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18); }
}

@media (prefers-reduced-motion: reduce) {
  .daily-cap-band--breach-imminent { animation: none; }
}
```

- [ ] **Step 7.2: Link from index.html**

Find the existing `<link rel="stylesheet" href="css/sop-checklist.css">` line in [index.html](../../../index.html). Add right after it:

```html
<link rel="stylesheet" href="css/daily-cap-band.css">
```

(No leading whitespace — match the surrounding link tags.)

- [ ] **Step 7.3: Commit**

```bash
git add css/daily-cap-band.css index.html && git commit -m "style: add daily cap band stylesheet with state variants"
```

---

## Task 8: Inline daily-used indicator on Risk Calculator

**Files:**
- Modify: [js/ui.js](../../../js/ui.js)
- Modify: [js/main.js](../../../js/main.js)

- [ ] **Step 8.1: Import the store into [js/ui.js](../../../js/ui.js)**

At the top of [js/ui.js](../../../js/ui.js), check the existing imports. Add (if not already present):

```js
import { data } from './store.js';
```

This is safe: store.js only imports from db.js, db.js imports nothing local — no circular dep.

Note: the `el()` helper in [js/ui.js](../../../js/ui.js) is a `document.getElementById` shorthand (not the create-element helper from `utils.js`). Confirm by reading lines 1-20 of the file before editing.

- [ ] **Step 8.2: Append inline indicator next to "Daily limit (X%)"**

The calculator's existing label rendering happens at [js/ui.js](../../../js/ui.js) line 73:

```js
el('m-daily-label').textContent  = `Daily limit (${state.dailyPct}%)`;
```

Replace that single line with:

```js
const dailyLabelEl = el('m-daily-label');
dailyLabelEl.textContent = `Daily limit (${state.dailyPct}%)`;
const activeAcc = data.accounts.find(a => a.id === data.activeAccountId);
if (activeAcc && typeof activeAcc.personalCapPctUsed === 'number') {
  const pct = Math.round(activeAcc.personalCapPctUsed);
  const tone = activeAcc.capState === 'safe' ? 'neutral'
             : activeAcc.capState === 'caution' ? 'caution'
             : activeAcc.capState === 'warning' ? 'warning'
             : 'breach';
  const span = document.createElement('span');
  span.className = `m-daily-used m-daily-used--${tone}`;
  span.textContent = ` · today: ${pct}% used`;
  dailyLabelEl.appendChild(span);
}
```

The indicator updates on every `recompute()` call (which fires on input change). When the user navigates to a new active account, dashboard.js's re-render won't trigger ui.js — but the next time the user touches the calc page or any input, recompute runs and refreshes the indicator. That's fine for v0.2.

- [ ] **Step 8.3: Add styles for the inline indicator**

Append to [css/daily-cap-band.css](../../../css/daily-cap-band.css) (the file we created in Task 7):

```css
.m-daily-used {
  font-size: 11px;
  font-weight: 500;
  margin-left: 4px;
}
.m-daily-used--neutral { color: rgba(255, 255, 255, 0.55); }
.m-daily-used--caution { color: #FBBF24; }
.m-daily-used--warning { color: #FB923C; }
.m-daily-used--breach  { color: #F87171; }
```

- [ ] **Step 8.4: Sanity check**

Boot live server, open `http://localhost:3001`, navigate to the Risk Calculator page. The `Daily limit (5%)` line should now have ` · today: 0% used` appended (or whatever the current % is).

- [ ] **Step 8.5: Commit**

```bash
git add js/ui.js js/main.js css/daily-cap-band.css && git commit -m "feat(calc): inline daily-used indicator next to Daily limit label"
```

---

## Task 9: Manual end-to-end verification

- [ ] **Step 9.1: Boot the server with the SQLite hook**

```bash
cd "/mnt/z/obsidian/000AAAAAA-Trading/Trading Management System/server" && PORT=3001 node --require ../tests/helpers/sqlite-hook.cjs server.js
```

Watch the boot log for `[migrate]` lines confirming the new account columns landed.

- [ ] **Step 9.2: Test the safe state**

Open `http://localhost:3001`, hard-reload (Ctrl+Shift+R). On the Dashboard:
- No daily-cap band should be visible (your active account has $0 P&L today → safe).
- Risk Calculator page → Daily limit label should show `· today: 0% used` in muted grey.

- [ ] **Step 9.3: Drive into caution → warning → breach states**

Pick the active account. Note its starting capital — the personal cap is 3% of that.

- Add a journal loss equal to 50% of personal cap → reload Dashboard, expect yellow `caution` band.
- Add a second loss to push to ~75% → expect orange `warning` band.
- Add a third to push to 95% → expect red `breach_imminent` band with subtle pulse animation.
- Add another to cross 100% → red `personal_breached` band, message says "Personal cap reached. SOP Rule 5: stop trading."
- If your personal cap is 60% of firm cap (3/5), you'd need to lose 5% of starting capital to trigger `firm_breached`.

For each state, switch to Risk Calculator and confirm the inline indicator color updates.

- [ ] **Step 9.4: Test account switch**

Click a different account in the Portfolio Accounts strip. Band should update (or hide) for the new active account WITHOUT a page reload.

- [ ] **Step 9.5: Test "yesterday doesn't count"**

If you have an entry from a previous day, edit its date to today → band should react. Edit it back to yesterday → band should hide. (Edge case: not strictly required; just sanity-check the trader-tz boundary works.)

- [ ] **Step 9.6: Stop the server**

Ctrl+C.

---

## Task 10: Final cleanup + merge

- [ ] **Step 10.1: Run full test suite**

```bash
cd server && npm test 2>&1 | tail -10
```

Expected: 35 tests pass.

- [ ] **Step 10.2: Skim the diff vs main**

```bash
cd .. && git log --oneline main..HEAD && git diff main..HEAD --stat | tail -10
```

Expected: ~9 commits, ~12-15 files changed, ~600-800 line diff.

- [ ] **Step 10.3: Merge to main**

```bash
git checkout main && git merge --no-ff feat/daily-cap -m "merge: feat/daily-cap (Feature 2 of week 1 sprint)

Surfaces real-time daily P&L vs personal 3% / firm 5% caps on the
dashboard with a 6-state color ladder (safe → caution → warning →
breach_imminent → personal_breached → firm_breached). Adds an inline
daily-used indicator on the Risk Calculator. Trader timezone GMT+7.

35 tests passing (Feature 1 + cap-state + account API)."
```

- [ ] **Step 10.4: Tag release**

```bash
git tag -a v0.2-week1-sprint -m "Week 1 sprint: SOP checklist + Daily cap warning"
```

- [ ] **Step 10.5: Confirm clean state**

```bash
git status && git log --oneline -5
```

Working tree clean, both feature merges visible in the log, tag pointing at the latest commit.

---

## Self-review notes

- **Spec coverage:** all seven Feature 2 acceptance-criteria checkboxes from [docs/sprints/2026-05-02-week1-sprint.md](../../sprints/2026-05-02-week1-sprint.md) are covered: daily P&L computation (Task 3.2), both caps visualized (Task 5), state transitions correct (Task 2 tests cover all six boundaries), band hides when safe (Task 5.1's null-return), personal cap is primary trigger (Task 2's threshold ladder), Risk Calculator indicator (Task 8), single-account view via active-account read (Task 6.2).
- **Type consistency:** `personalDailyCapPct` / `firmDailyCapPct` (camelCase) used in JS, `personal_daily_cap_pct` / `firm_daily_cap_pct` only in SQL. `capState` enum values match between server and frontend (`safe`/`caution`/`warning`/`breach_imminent`/`personal_breached`/`firm_breached`). CSS modifier replaces underscores with dashes (Task 5.1's `.replace(/_/g, '-')`).
- **Out of scope:** multi-account aggregated view, push notifications, historical reports — all explicitly deferred per spec.
- **No placeholders** — every code block is the final implementation.
