# SOP Checklist on Journal Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every journal entry behind an 8-rule "ស្មារតីអង្គភាព" SOP doctrine and persist a post-trade grade (A/B/C/Off-SOP/Pre-grading) on every journal row.

**Architecture:** Add four columns to the `journals` table (`sop_checks`, `grade`, `confluence_count`, `pre_grading`); compute grade server-side from confirmed-rule count (≥7→A, ≥5→B, ≥3→C, else Off-SOP); render an 8-row checklist component in the journal-entry side panel with a live grade preview; show the grade pill on journal cards/detail and add a Grade filter.

**Tech Stack:** Node 20 + `better-sqlite3` (CommonJS server), vanilla ES-module frontend, `node:test` for tests (no new deps), idempotent boot-time `ALTER TABLE` migration pattern already used in [server/server.js](../../../server/server.js).

**Source spec:** [docs/sprints/2026-05-02-week1-sprint.md](../../sprints/2026-05-02-week1-sprint.md) — Feature 1 only.

---

## File map

**Create:**
- [js/sop-rules.js](../../../js/sop-rules.js) — fixed 8-rule constant (ESM)
- [js/sop-checklist.js](../../../js/sop-checklist.js) — DOM component: 8-row checklist + live grade preview
- [tests/grading.test.mjs](../../../tests/grading.test.mjs) — `computeJournalGrade()` boundary tests
- [tests/journal-api.test.mjs](../../../tests/journal-api.test.mjs) — integration tests against a temp-DB server
- [tests/helpers/test-server.mjs](../../../tests/helpers/test-server.mjs) — spin up server with isolated DB
- [css/sop-checklist.css](../../../css/sop-checklist.css) — checklist + grade-pill styles

**Modify:**
- [js/grading.js](../../../js/grading.js) — add `computeJournalGrade()` export (do not touch existing `computeGrade`)
- [server/schema.sql](../../../server/schema.sql) — add four columns to `journals` table definition
- [server/server.js](../../../server/server.js) — boot migration, journals MAPPERS, validation, ?grade= filter, optional `TMS_DB_PATH` env var
- [server/package.json](../../../server/package.json) — add `test` script
- [js/journal.js](../../../js/journal.js) — integrate `sopChecklistField`, grade pill on cards/detail, Grade filter
- [js/forms.js](../../../js/forms.js) — extend `readForm()` with optional `jsonFields` arg
- [index.html](../../../index.html) — link [css/sop-checklist.css](../../../css/sop-checklist.css)

---

## Pre-flight

- [ ] **Step 0.1: Confirm a clean working tree (or stash)**

```bash
git status
```

If anything is uncommitted, stash it:

```bash
git stash push -m "pre-sop-checklist-stash"
```

- [ ] **Step 0.2: Create a feature branch**

```bash
git checkout -b feat/sop-checklist
```

- [ ] **Step 0.3: Verify server boots on the current `main`**

```bash
cd server && npm install && PORT=3001 npm start
```

Expected: `TMS server → http://localhost:3001`. Press Ctrl+C to stop. We use port 3001 because port 3000 has a Windows auto-start instance.

---

## Task 1: Wire `node:test` infrastructure (no new deps)

**Files:**
- Create: [tests/helpers/test-server.mjs](../../../tests/helpers/test-server.mjs)
- Modify: [server/package.json](../../../server/package.json)
- Modify: [server/server.js](../../../server/server.js) (env-var DB path + export factory for tests)

- [ ] **Step 1.1: Refactor server.js so DB path and listening are configurable**

Read [server/server.js](../../../server/server.js) lines 17 and 428-433. Replace the hardcoded `DB_PATH` and the bottom listen block:

```js
const DB_PATH = process.env.TMS_DB_PATH || path.join(ROOT, 'tms.db');
```

At the bottom of the file, replace `app.listen(...)` with:

```js
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`TMS server → http://localhost:${PORT}`);
    console.log(`Database   → ${DB_PATH}`);
    console.log(`Uploads    → ${UPLOADS_DIR}`);
  });
}

module.exports = { app, db };
```

Rationale: `require.main === module` lets `npm start` listen, but `tests/helpers/test-server.mjs` can `import('../server/server.js')` for in-process testing without binding a port. Since the file is CJS, ESM tests reach it via the default-export interop: `(await import('../../server/server.js')).default`.

Sanity-run:

```bash
cd server && node server.js
```

Expected: still boots and prints the three lines. Ctrl+C.

- [ ] **Step 1.2: Add the test script and a `type` field for the project root**

Edit [server/package.json](../../../server/package.json):

```json
{
  "name": "tms-server",
  "version": "1.0.0",
  "private": true,
  "description": "Local SQLite backend for the Trading Management System",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test ../tests/**/*.test.mjs"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1"
  }
}
```

The test files are `.mjs` so the CommonJS package can sit next to ES-module tests without changing the existing module system.

- [ ] **Step 1.3: Build the test-server helper**

Create [tests/helpers/test-server.mjs](../../../tests/helpers/test-server.mjs):

```js
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function startTestServer() {
  const dir = mkdtempSync(join(tmpdir(), 'tms-test-'));
  process.env.TMS_DB_PATH = join(dir, 'test.db');
  // Force a fresh require so a new in-process DB is opened per test file
  delete require.cache[require.resolve('../../server/server.js')];
  const { app, db } = require('../../server/server.js');
  return {
    app,
    db,
    cleanup() {
      try { db.close(); } catch {}
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 1.4: Smoke-test the harness**

Create [tests/_smoke.test.mjs](../../../tests/_smoke.test.mjs):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/test-server.mjs';

test('test harness boots an isolated server with empty journals', () => {
  const { db, cleanup } = startTestServer();
  try {
    const rows = db.prepare('SELECT COUNT(*) AS n FROM journals').get();
    assert.equal(rows.n, 0);
  } finally {
    cleanup();
  }
});
```

- [ ] **Step 1.5: Run the smoke test**

```bash
cd server && npm test
```

Expected: `tests 1 / pass 1 / fail 0`. If `tests/**/*.test.mjs` glob doesn't expand, fall back to `node --test ../tests/_smoke.test.mjs` and adjust the script.

- [ ] **Step 1.6: Commit**

```bash
git add server/server.js server/package.json tests/
git commit -m "test: add node:test harness with isolated tms.db per run"
```

---

## Task 2: `computeJournalGrade()` — TDD on the frontend module

**Files:**
- Modify: [js/grading.js](../../../js/grading.js)
- Create: [tests/grading.test.mjs](../../../tests/grading.test.mjs)

- [ ] **Step 2.1: Write the failing test**

Create [tests/grading.test.mjs](../../../tests/grading.test.mjs):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeJournalGrade } from '../js/grading.js';

function checks(...confirmed) {
  const obj = {};
  for (let i = 1; i <= 8; i++) obj[`rule_${i}`] = { confirmed: confirmed.includes(i), note: '' };
  return obj;
}

test('0 confirmed → Off-SOP / count 0', () => {
  const r = computeJournalGrade(checks());
  assert.deepEqual(r, { grade: 'Off-SOP', confluenceCount: 0 });
});

test('2 confirmed → Off-SOP / count 2 (boundary below C)', () => {
  const r = computeJournalGrade(checks(1, 2));
  assert.deepEqual(r, { grade: 'Off-SOP', confluenceCount: 2 });
});

test('3 confirmed → C (lower boundary)', () => {
  const r = computeJournalGrade(checks(1, 2, 3));
  assert.deepEqual(r, { grade: 'C', confluenceCount: 3 });
});

test('4 confirmed → C (mid)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4));
  assert.deepEqual(r, { grade: 'C', confluenceCount: 4 });
});

test('5 confirmed → B (lower boundary)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5));
  assert.deepEqual(r, { grade: 'B', confluenceCount: 5 });
});

test('6 confirmed → B (mid)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5, 6));
  assert.deepEqual(r, { grade: 'B', confluenceCount: 6 });
});

test('7 confirmed → A (lower boundary)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5, 6, 7));
  assert.deepEqual(r, { grade: 'A', confluenceCount: 7 });
});

test('8 confirmed → A (max)', () => {
  const r = computeJournalGrade(checks(1, 2, 3, 4, 5, 6, 7, 8));
  assert.deepEqual(r, { grade: 'A', confluenceCount: 8 });
});

test('null/undefined input → Off-SOP / 0', () => {
  assert.deepEqual(computeJournalGrade(null),      { grade: 'Off-SOP', confluenceCount: 0 });
  assert.deepEqual(computeJournalGrade(undefined), { grade: 'Off-SOP', confluenceCount: 0 });
  assert.deepEqual(computeJournalGrade({}),        { grade: 'Off-SOP', confluenceCount: 0 });
});
```

- [ ] **Step 2.2: Run the test, expect failure**

```bash
cd server && npm test -- ../tests/grading.test.mjs
```

Expected: failures with `computeJournalGrade is not a function` (or import error). Good.

- [ ] **Step 2.3: Implement `computeJournalGrade` in [js/grading.js](../../../js/grading.js)**

Append to the bottom of the file:

```js
/**
 * Post-trade SOP grade. Counts confirmed rules out of 8.
 *   ≥7 → A, ≥5 → B, ≥3 → C, else Off-SOP.
 * Distinct from the plan-time `computeGrade` above — they use different inputs
 * and different vocab (Off-SOP vs SKIP) by design.
 *
 * @param {Record<string, { confirmed?: boolean, note?: string }>|null|undefined} sopChecks
 * @returns {{ grade: 'A'|'B'|'C'|'Off-SOP', confluenceCount: number }}
 */
export function computeJournalGrade(sopChecks) {
  const confluenceCount = Object.values(sopChecks || {})
    .filter(r => r && r.confirmed === true).length;
  const grade = confluenceCount >= 7 ? 'A'
              : confluenceCount >= 5 ? 'B'
              : confluenceCount >= 3 ? 'C'
              : 'Off-SOP';
  return { grade, confluenceCount };
}
```

- [ ] **Step 2.4: Run the test, expect green**

```bash
cd server && npm test -- ../tests/grading.test.mjs
```

Expected: 9 passes, 0 fails.

- [ ] **Step 2.5: Commit**

```bash
git add js/grading.js tests/grading.test.mjs
git commit -m "feat(grading): add computeJournalGrade for post-trade SOP audit"
```

---

## Task 3: Schema migration — add 4 columns to `journals`

**Files:**
- Modify: [server/schema.sql](../../../server/schema.sql)
- Modify: [server/server.js](../../../server/server.js) (boot migration block at line ~47)

- [ ] **Step 3.1: Update the canonical schema**

Edit [server/schema.sql](../../../server/schema.sql), inside the `journals` CREATE TABLE block (after the `tags TEXT` line, before `created_at`):

```sql
  sop_checks       TEXT,                    -- JSON: { rule_1: { confirmed, note }, ... }
  grade            TEXT,                    -- 'A' | 'B' | 'C' | 'Off-SOP' | NULL (legacy)
  confluence_count INTEGER,                 -- 0–8 confirmed rules; NULL for legacy
  pre_grading      INTEGER NOT NULL DEFAULT 0,  -- 1 if logged before SOP rollout
```

Order should be: `... description, tags, plan_id, sop_checks, grade, confluence_count, pre_grading, created_at, updated_at, ...`. (`plan_id` was already added by an earlier migration block — keep it where the migration puts it. The schema.sql file is consulted on fresh-DB creation; existing DBs use the boot migration in step 3.2.)

- [ ] **Step 3.2: Add idempotent ALTER TABLE statements + backfill to server.js**

In [server/server.js](../../../server/server.js), inside the existing journals-migration block (lines 47–66) — append after the `if (!cols.includes('plan_id')) ...` line and before the closing `}`:

```js
  if (!cols.includes('sop_checks'))       db.exec('ALTER TABLE journals ADD COLUMN sop_checks TEXT');
  if (!cols.includes('grade'))            db.exec('ALTER TABLE journals ADD COLUMN grade TEXT');
  if (!cols.includes('confluence_count')) db.exec('ALTER TABLE journals ADD COLUMN confluence_count INTEGER');
  if (!cols.includes('pre_grading')) {
    db.exec('ALTER TABLE journals ADD COLUMN pre_grading INTEGER NOT NULL DEFAULT 0');
    // One-shot backfill: anything already in the table at the moment we add this
    // column was logged before the SOP rollout. Future inserts default to 0 and
    // are overridden by the mapper when sop_checks is supplied.
    const r = db.prepare('UPDATE journals SET pre_grading = 1 WHERE sop_checks IS NULL').run();
    if (r.changes > 0) console.log(`[migrate] flagged ${r.changes} journal entries as pre-grading`);
  }
```

- [ ] **Step 3.3: Write a migration test**

Create [tests/journal-schema.test.mjs](../../../tests/journal-schema.test.mjs):

```js
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

test('legacy journal without sop_checks is flagged pre_grading=1', () => {
  // Open a "legacy" DB: insert a journal row directly with sop_checks NULL,
  // close, reopen the server (which reruns boot migrations), assert flag.
  const { db, cleanup } = startTestServer();
  try {
    const now = Date.now();
    db.prepare(`INSERT INTO journals
      (id, account_id, instrument, result, amount, created_at, updated_at)
      VALUES ('j-legacy', NULL, 'XAU/USD', 'win', 100, ?, ?)`).run(now, now);
    // The boot migration already ran when the server was required, but since
    // the row was inserted *after* boot the flag is still 0. Re-run the
    // backfill SQL directly to verify the predicate works:
    db.prepare('UPDATE journals SET pre_grading = 1 WHERE sop_checks IS NULL').run();
    const row = db.prepare('SELECT pre_grading FROM journals WHERE id = ?').get('j-legacy');
    assert.equal(row.pre_grading, 1);
  } finally {
    cleanup();
  }
});
```

- [ ] **Step 3.4: Run the schema tests**

```bash
cd server && npm test -- ../tests/journal-schema.test.mjs
```

Expected: 2 passes.

- [ ] **Step 3.5: Commit**

```bash
git add server/schema.sql server/server.js tests/journal-schema.test.mjs
git commit -m "feat(schema): add sop_checks/grade/confluence_count/pre_grading to journals"
```

---

## Task 4: Server-side journals mapper — persist + grade

**Files:**
- Modify: [server/server.js](../../../server/server.js) (`MAPPERS.journals.toDb` and `fromDb` at line ~201)

- [ ] **Step 4.1: Add a server-side grade helper**

In [server/server.js](../../../server/server.js), just after the `MAPPERS` object opens (right before `accounts:`), add a top-level helper:

```js
const SOP_RULE_KEYS = ['rule_1','rule_2','rule_3','rule_4','rule_5','rule_6','rule_7','rule_8'];

function computeJournalGradeServer(sopChecks) {
  const n = SOP_RULE_KEYS.reduce((c, k) => c + (sopChecks?.[k]?.confirmed === true ? 1 : 0), 0);
  const grade = n >= 7 ? 'A' : n >= 5 ? 'B' : n >= 3 ? 'C' : 'Off-SOP';
  return { grade, confluenceCount: n };
}

function validateSopChecks(sopChecks) {
  if (sopChecks == null) return { ok: true };
  if (typeof sopChecks !== 'object') return { ok: false, msg: 'sopChecks must be an object' };
  for (const k of SOP_RULE_KEYS) {
    if (!(k in sopChecks)) return { ok: false, msg: `sopChecks missing rule key: ${k}` };
  }
  return { ok: true };
}
```

(Yes, this duplicates [js/grading.js](../../../js/grading.js) by design — the server has no ESM bridge to that file under CJS, and the function is 4 lines. The duplication is covered by tests in Task 7.)

- [ ] **Step 4.2: Extend the journals `toDb` mapper**

Replace the `toDb` block in `MAPPERS.journals` with:

```js
    toDb: b => {
      const ids = Array.isArray(b.strategyIds) && b.strategyIds.length
        ? b.strategyIds.filter(Boolean)
        : (b.strategyId ? [b.strategyId] : []);
      const hasSop = b.sopChecks && typeof b.sopChecks === 'object';
      const graded = hasSop ? computeJournalGradeServer(b.sopChecks) : null;
      return {
        id: b.id,
        strategy_id: ids[0] ?? null,
        strategy_ids: JSON.stringify(ids),
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
        plan_id: b.planId ?? null,
        sop_checks: hasSop ? JSON.stringify(b.sopChecks) : null,
        grade: graded?.grade ?? null,
        confluence_count: graded?.confluenceCount ?? null,
        pre_grading: hasSop ? 0 : 1,
        created_at: b.createdAt ?? Date.now(),
        updated_at: b.updatedAt ?? Date.now(),
      };
    },
```

- [ ] **Step 4.3: Extend the journals `fromDb` mapper**

Replace the `fromDb` block in `MAPPERS.journals` with:

```js
    fromDb: r => {
      const ids = r.strategy_ids ? JSON.parse(r.strategy_ids) : (r.strategy_id ? [r.strategy_id] : []);
      return {
        id: r.id,
        strategyId: ids[0] ?? r.strategy_id ?? null,
        strategyIds: ids,
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
        planId: r.plan_id,
        sopChecks: r.sop_checks ? JSON.parse(r.sop_checks) : null,
        grade: r.grade,
        confluenceCount: r.confluence_count,
        preGrading: r.pre_grading === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    },
```

- [ ] **Step 4.4: Wire the validation into the PUT handler**

In [server/server.js](../../../server/server.js), find the `app.put('/api/:store', ...)` handler (around line 369). After `if (!obj.id)`, add a journals-specific validation block:

```js
  if (store === 'journals') {
    const v = validateSopChecks(obj.sopChecks);
    if (!v.ok) return res.status(400).json({ error: v.msg });
  }
```

- [ ] **Step 4.5: Commit**

```bash
git add server/server.js
git commit -m "feat(api): persist + grade sop_checks on journal upsert"
```

---

## Task 5: Integration tests for the journals API

**Files:**
- Create: [tests/journal-api.test.mjs](../../../tests/journal-api.test.mjs)

- [ ] **Step 5.1: Write the test (covers happy path + validation + grade persistence + filter)**

Create [tests/journal-api.test.mjs](../../../tests/journal-api.test.mjs):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/test-server.mjs';

function fullSop(confirmed = []) {
  const obj = {};
  for (let i = 1; i <= 8; i++) {
    obj[`rule_${i}`] = { confirmed: confirmed.includes(i), note: '' };
  }
  return obj;
}

async function put(app, store, body) {
  return await new Promise((resolve, reject) => {
    const req = { method: 'PUT', url: `/api/${store}`, headers: { 'content-type': 'application/json' }, body };
    // Use supertest-free: directly invoke the express app via node:http. Simpler:
    // wrap app.handle through a fake req/res. Instead, we'll use http.request against a
    // briefly-bound port.
    reject(new Error('not used'));
  });
}

// Use http.request against a real port — simpler than mocking req/res.
import http from 'node:http';
function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = {
        method, hostname: '127.0.0.1', port, path,
        headers: { 'content-type': 'application/json' },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          server.close();
          let json = null; try { json = data ? JSON.parse(data) : null; } catch {}
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

test('PUT /api/journals with full sopChecks persists grade + count', async () => {
  const { app, db, cleanup } = startTestServer();
  try {
    const r = await request(app, 'PUT', '/api/journals', {
      id: 'j1', instrument: 'XAU/USD', result: 'win', amount: 100,
      sopChecks: fullSop([1,2,3,4,5,6,7]),  // 7 confirmed → A
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade, 'A');
    assert.equal(r.body.confluenceCount, 7);
    assert.equal(r.body.preGrading, false);

    const row = db.prepare('SELECT grade, confluence_count, pre_grading FROM journals WHERE id = ?').get('j1');
    assert.equal(row.grade, 'A');
    assert.equal(row.confluence_count, 7);
    assert.equal(row.pre_grading, 0);
  } finally { cleanup(); }
});

test('PUT /api/journals without sopChecks marks entry as pre_grading', async () => {
  const { app, db, cleanup } = startTestServer();
  try {
    const r = await request(app, 'PUT', '/api/journals', {
      id: 'j2', instrument: 'XAU/USD', result: 'loss', amount: 50,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.grade, null);
    assert.equal(r.body.preGrading, true);
  } finally { cleanup(); }
});

test('PUT /api/journals with partial sopChecks → 400', async () => {
  const { cleanup, app } = startTestServer();
  try {
    const r = await request(app, 'PUT', '/api/journals', {
      id: 'j3', sopChecks: { rule_1: { confirmed: true } },  // missing 2..8
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /missing rule key/);
  } finally { cleanup(); }
});

test('round-trip via GET returns sopChecks unchanged', async () => {
  const { app, cleanup } = startTestServer();
  try {
    const sop = fullSop([1,3,5,7]);
    sop.rule_1.note = 'OB confirmed at 2785';
    await request(app, 'PUT', '/api/journals', {
      id: 'j4', sopChecks: sop, result: 'be', amount: 0,
    });
    const r = await request(app, 'GET', '/api/journals/j4');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sopChecks, sop);
    assert.equal(r.body.grade, 'C');           // 4 confirmed → C
    assert.equal(r.body.confluenceCount, 4);
  } finally { cleanup(); }
});
```

- [ ] **Step 5.2: Run the integration tests**

```bash
cd server && npm test -- ../tests/journal-api.test.mjs
```

Expected: 4 passes.

- [ ] **Step 5.3: Commit**

```bash
git add tests/journal-api.test.mjs
git commit -m "test(api): integration tests for journal sopChecks/grade"
```

---

## Task 6: Add `?grade=` filter to GET /api/journals

**Files:**
- Modify: [server/server.js](../../../server/server.js) (`GET /api/:store` at line ~354)

- [ ] **Step 6.1: Replace the list handler with a filter-aware version**

Replace the existing `app.get('/api/:store', ...)` (lines 354-359) with:

```js
app.get('/api/:store', (req, res) => {
  const { store } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });

  if (store === 'journals' && typeof req.query.grade === 'string' && req.query.grade.length) {
    const wanted = req.query.grade.split(',').map(s => s.trim()).filter(Boolean);
    const grades  = wanted.filter(g => g !== 'Pre-grading');
    const wantsPg = wanted.includes('Pre-grading');
    const clauses = [];
    const params = [];
    if (grades.length) {
      clauses.push(`grade IN (${grades.map(() => '?').join(',')})`);
      params.push(...grades);
    }
    if (wantsPg) clauses.push('pre_grading = 1');
    const where = clauses.length ? `WHERE ${clauses.join(' OR ')}` : '';
    const rows = db.prepare(`SELECT * FROM journals ${where} ORDER BY created_at DESC`).all(...params);
    return res.json(rows.map(MAPPERS.journals.fromDb));
  }

  const rows = db.prepare(`SELECT * FROM ${store} ORDER BY created_at DESC`).all();
  res.json(rows.map(MAPPERS[store].fromDb));
});
```

- [ ] **Step 6.2: Add a filter test**

Append to [tests/journal-api.test.mjs](../../../tests/journal-api.test.mjs):

```js
test('?grade= filter returns only matching grades + Pre-grading', async () => {
  const { app, cleanup } = startTestServer();
  try {
    await request(app, 'PUT', '/api/journals', { id: 'a',  sopChecks: fullSop([1,2,3,4,5,6,7,8]) });  // A
    await request(app, 'PUT', '/api/journals', { id: 'b',  sopChecks: fullSop([1,2,3,4,5]) });        // B
    await request(app, 'PUT', '/api/journals', { id: 'c',  sopChecks: fullSop([1,2,3]) });            // C
    await request(app, 'PUT', '/api/journals', { id: 'o',  sopChecks: fullSop([1]) });                // Off-SOP
    await request(app, 'PUT', '/api/journals', { id: 'pg' });                                         // pre_grading

    const onlyA = await request(app, 'GET', '/api/journals?grade=A');
    assert.deepEqual(onlyA.body.map(j => j.id).sort(), ['a']);

    const aAndB = await request(app, 'GET', '/api/journals?grade=A,B');
    assert.deepEqual(aAndB.body.map(j => j.id).sort(), ['a','b']);

    const pgOnly = await request(app, 'GET', '/api/journals?grade=Pre-grading');
    assert.deepEqual(pgOnly.body.map(j => j.id).sort(), ['pg']);

    const cAndPg = await request(app, 'GET', '/api/journals?grade=C,Pre-grading');
    assert.deepEqual(cAndPg.body.map(j => j.id).sort(), ['c','pg']);
  } finally { cleanup(); }
});
```

- [ ] **Step 6.3: Run the test**

```bash
cd server && npm test -- ../tests/journal-api.test.mjs
```

Expected: 5 passes.

- [ ] **Step 6.4: Commit**

```bash
git add server/server.js tests/journal-api.test.mjs
git commit -m "feat(api): GET /api/journals?grade= filter incl. Pre-grading"
```

---

## Task 7: Frontend — `js/sop-rules.js` constant

**Files:**
- Create: [js/sop-rules.js](../../../js/sop-rules.js)

- [ ] **Step 7.1: Write the file**

Create [js/sop-rules.js](../../../js/sop-rules.js):

```js
// 8-rule "ស្មារតីអង្គភាព" (unit consciousness) doctrine.
// Order, ids, and labels are canonical — do not edit without updating the SOP
// document. The post-trade audit grading depends on rule_1..rule_8 keys.

export const SOP_RULES = [
  { id: 'rule_1', label: 'Market structure — 5M Liquidity Order Block identified' },
  { id: 'rule_2', label: 'Order flow imbalance ≥10% (buyer/seller dominance)' },
  { id: 'rule_3', label: '5M signal confirmation (Sn1P3r)' },
  { id: 'rule_4', label: 'Minimum 1:2 risk-to-reward' },
  { id: 'rule_5', label: 'Within 3 trades/day limit' },
  { id: 'rule_6', label: 'No high-impact news event active' },
  { id: 'rule_7', label: 'Hourly fundamentals reviewed' },
  { id: 'rule_8', label: 'BHUB sentiment checked (contra-signal if >65%)' },
];

export const SOP_RULE_IDS = SOP_RULES.map(r => r.id);

/** Build an empty sopChecks object with all 8 rules present and unconfirmed. */
export function emptySopChecks() {
  return SOP_RULES.reduce((o, r) => {
    o[r.id] = { confirmed: false, note: '' };
    return o;
  }, {});
}
```

- [ ] **Step 7.2: Commit**

```bash
git add js/sop-rules.js
git commit -m "feat: add canonical 8-rule SOP doctrine constant"
```

---

## Task 8: Frontend — `js/sop-checklist.js` component

**Files:**
- Create: [js/sop-checklist.js](../../../js/sop-checklist.js)

- [ ] **Step 8.1: Write the component**

Create [js/sop-checklist.js](../../../js/sop-checklist.js):

```js
/**
 * sop-checklist.js — 8-row SOP checklist field with live grade preview.
 *
 * Returns a DOM node containing:
 *   - 8 rows: [checkbox] [rule label] [optional note input]
 *   - a live grade pill that updates on every interaction
 *   - a hidden <input name="sopChecks"> whose value is JSON-serialized state
 *
 * Validation contract: the field exposes `isFullyTouched()` so the journal
 * form's submit handler can block until all 8 checkboxes have been touched.
 */

import { el } from './utils.js';
import { SOP_RULES, emptySopChecks } from './sop-rules.js';
import { computeJournalGrade } from './grading.js';

/**
 * @param {Object} opts
 * @param {string} opts.name             Hidden-input name, used by readForm()
 * @param {Object|null} opts.value       Existing sopChecks (edit mode) or null
 * @returns {HTMLElement & { isFullyTouched: () => boolean, getState: () => object }}
 */
export function sopChecklistField({ name = 'sopChecks', value = null } = {}) {
  const state = value && typeof value === 'object' ? cloneState(value) : emptySopChecks();
  const editing = !!value;
  const touched = new Set(editing ? SOP_RULES.map(r => r.id) : []);

  const wrap = el('div', { class: 'sop-checklist' });
  const hidden = el('input', { type: 'hidden', name, value: JSON.stringify(state) });

  const rowsEl = el('div', { class: 'sop-checklist-rows' });
  const previewEl = el('div', { class: 'sop-grade-preview' });

  function syncHidden() { hidden.value = JSON.stringify(state); }

  function renderPreview() {
    const { grade, confluenceCount } = computeJournalGrade(state);
    previewEl.innerHTML = '';
    previewEl.appendChild(el('span', { class: 'sop-grade-label' }, 'GRADE'));
    previewEl.appendChild(el('span', { class: `grade-pill grade-pill--${gradeClass(grade)}` }, grade));
    previewEl.appendChild(el('span', { class: 'sop-grade-count' }, `${confluenceCount}/8 confirmed`));
  }

  function row(rule) {
    const cb = el('input', { type: 'checkbox', class: 'sop-row-cb' });
    cb.checked = state[rule.id]?.confirmed === true;
    const note = el('input', {
      type: 'text', class: 'text-input sop-row-note',
      value: state[rule.id]?.note ?? '',
      placeholder: 'Optional note',
    });
    cb.addEventListener('change', () => {
      state[rule.id] = { ...state[rule.id], confirmed: cb.checked };
      touched.add(rule.id);
      syncHidden();
      renderPreview();
    });
    note.addEventListener('input', () => {
      state[rule.id] = { ...state[rule.id], note: note.value };
      syncHidden();
    });
    return el('div', { class: 'sop-row' },
      el('label', { class: 'sop-row-cb-wrap' }, cb),
      el('span', { class: 'sop-row-label' }, rule.label),
      note,
    );
  }

  SOP_RULES.forEach(r => rowsEl.appendChild(row(r)));
  wrap.appendChild(rowsEl);
  wrap.appendChild(previewEl);
  wrap.appendChild(hidden);
  renderPreview();

  wrap.isFullyTouched = () => touched.size === SOP_RULES.length;
  wrap.getState = () => cloneState(state);
  return wrap;
}

function cloneState(s) {
  const out = {};
  for (const r of SOP_RULES) {
    out[r.id] = {
      confirmed: s[r.id]?.confirmed === true,
      note: s[r.id]?.note ?? '',
    };
  }
  return out;
}

export function gradeClass(grade) {
  if (grade === 'A') return 'a';
  if (grade === 'B') return 'b';
  if (grade === 'C') return 'c';
  if (grade === 'Off-SOP') return 'off-sop';
  return 'pre-grading';
}
```

- [ ] **Step 8.2: Commit**

```bash
git add js/sop-checklist.js
git commit -m "feat: add SOP checklist field component with live grade preview"
```

---

## Task 9: Extend `readForm()` to handle JSON fields

**Files:**
- Modify: [js/forms.js](../../../js/forms.js) (the `readForm` export at line ~213)

- [ ] **Step 9.1: Replace `readForm`**

Replace the existing function with:

```js
/**
 * Reads a form's values into a plain object.
 *  - chipFields: comma-separated chip inputs become arrays
 *  - jsonFields: hidden inputs whose value is a JSON string become parsed objects
 */
export function readForm(form, chipFields = [], jsonFields = []) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) {
    if (chipFields.includes(k))      obj[k] = v ? v.split(',').filter(Boolean) : [];
    else if (jsonFields.includes(k)) { try { obj[k] = v ? JSON.parse(v) : null; } catch { obj[k] = null; } }
    else                             obj[k] = v;
  }
  return obj;
}
```

(The third param defaults to `[]` so existing callers are untouched.)

- [ ] **Step 9.2: Smoke-check the existing site still loads**

```bash
cd server && PORT=3001 npm start
```

Open `http://localhost:3001`, browse to Journal and Plans pages, confirm no console errors. Ctrl+C.

- [ ] **Step 9.3: Commit**

```bash
git add js/forms.js
git commit -m "refactor(forms): readForm accepts optional jsonFields list"
```

---

## Task 10: Integrate SOP checklist into the journal form

**Files:**
- Modify: [js/journal.js](../../../js/journal.js) (`openJournalForm` at line ~185, `journalCard` at line ~94, filter bar at line ~48, `filters` constant at line 11)

- [ ] **Step 10.1: Add imports at the top**

Replace lines 6-8 of [js/journal.js](../../../js/journal.js):

```js
import { data, savejournal, deletejournal, strategyById, accountById, saveAccount, journalStrategyIds, journalHasStrategy, executePlan } from './store.js';
import { openFormPanel, field, textInput, numberInput, textArea, select, toggleGroup, imageUpload, multiChips, readForm } from './forms.js';
import { el, INSTRUMENTS, TIMEFRAMES, iconSVG, toast, fmtDate, fmtRelative } from './utils.js';
import { emptyState } from './accounts.js';
import { sopChecklistField, gradeClass } from './sop-checklist.js';
```

- [ ] **Step 10.2: Add `grade` to the filters constant**

Line 11:

```js
let filters = { strategy: 'all', account: 'all', result: 'all', instrument: 'all', grade: 'all' };
```

- [ ] **Step 10.3: Insert the SOP checklist field in `openJournalForm`**

In `openJournalForm`, locate the `body = el('div', {}, ...)` block. Before the line `field('Strategies', stratOpts.length ...)`, capture a reference to the SOP field so we can call `isFullyTouched()` later. Replace the body construction (the `el('div', {}, ...)` block) with:

```js
  const sopField = sopChecklistField({ name: 'sopChecks', value: b.sopChecks || null });

  const body = el('div', {},
    isDisciplineViolation
      ? el('div', { class: 'discipline-warning-banner' },
          el('strong', {}, 'Discipline violation warning:'),
          ' This plan failed must-pass checks. Logging it anyway will be recorded as a discipline violation.')
      : null,
    field('Screenshot', imageUpload({ name: 'screenshotPath', value: b.screenshotPath || '' })),
    field('Strategies', stratOpts.length
      ? multiChips({ name: 'strategyIds', values: initialStrategyIds, options: stratOpts })
      : el('div', { class: 'form-empty-note' }, 'Create a strategy first.'),
      'Tap one or more strategies that contributed to this trade.'),
    sectionHeader('SOP CHECKLIST'),
    sopField,
    field('Account', select({ name: 'accountId', value: b.accountId || '', options: acctOpts })),
    row(
      field('Instrument', select({ name: 'instrument', value: b.instrument || 'XAU/USD', options: INSTRUMENTS.map(i => ({ value: i, label: i })) })),
      field('Timeframe',  select({ name: 'timeframe',  value: b.timeframe || 'H1',      options: TIMEFRAMES.map(t => ({ value: t, label: t })) }))
    ),
    row(
      field('Direction', toggleGroup({ name: 'direction', value: b.direction || 'long', options: [
        { value: 'long', label: 'Long' }, { value: 'short', label: 'Short' }
      ]})),
      field('Entry date', textInput({ name: 'entryDate', type: 'date', value: b.entryDate ? new Date(b.entryDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10) }))
    ),
    field('Result', resultToggle),
    amountRow,
    field('Description', textArea({ name: 'description', value: b.description || '', rows: 4, placeholder: 'What you saw, why you entered, how it played out…' })),
    sectionHeader('Tags'),
    tagInput({ name: 'tags', values: b.tags || [] })
  );
```

- [ ] **Step 10.4: Block submit until checklist fully touched + persist `sopChecks`**

Replace the `onSubmit:` arrow inside `openFormPanel({ ... })` with:

```js
    onSubmit: async (form) => {
      if (!sopField.isFullyTouched()) {
        toast('Review all 8 SOP rules before saving.');
        throw new Error('sop-not-touched');  // prevent panel close in openFormPanel's catch
      }
      const raw = readForm(form, ['tags', 'strategyIds'], ['sopChecks']);

      const oldResult = existing ? existing.result : null;
      const oldAmount = existing ? existing.amount : 0;
      const oldAccountId = existing ? (existing.accountId || null) : null;

      const newResult = raw.result;
      const newAmount = Math.abs(parseFloat(raw.amount) || 0);
      const newAccountId = raw.accountId || null;
      const newStrategyIds = Array.isArray(raw.strategyIds) ? raw.strategyIds.filter(Boolean) : [];

      const obj = {
        ...b,
        planId: planId || b.planId || null,
        strategyIds: newStrategyIds,
        strategyId: newStrategyIds[0] || null,
        accountId: newAccountId,
        instrument: raw.instrument,
        timeframe: raw.timeframe,
        direction: raw.direction,
        entryDate: raw.entryDate ? new Date(raw.entryDate).getTime() : Date.now(),
        result: newResult,
        rAchieved: newResult === 'win' ? (parseFloat(raw.rAchieved) || 0) : 0,
        amount: newAmount,
        screenshotPath: raw.screenshotPath || b.screenshotPath || '',
        description: raw.description,
        tags: raw.tags || [],
        sopChecks: raw.sopChecks || sopField.getState(),
      };
      const savedJournal = await savejournal(obj);

      if (planId && !existing) {
        await executePlan(planId, savedJournal.id);
      }

      const oldDelta = signedDelta(oldResult, oldAmount);
      const newDelta = signedDelta(newResult, newAmount);
      if (oldAccountId === newAccountId) {
        await applyBalanceChange(newAccountId, newDelta - oldDelta);
      } else {
        await applyBalanceChange(oldAccountId, -oldDelta);
        await applyBalanceChange(newAccountId, newDelta);
      }

      toast(existing ? 'Journal entry updated' : 'Journal entry saved');
    }
```

(Note on the `throw`: [js/forms.js](../../../js/forms.js) line 31 swallows submit errors via `console.error`, which keeps the panel open. That's the behavior we want when validation fails.)

- [ ] **Step 10.5: Commit**

```bash
git add js/journal.js
git commit -m "feat(journal): integrate SOP checklist into entry form"
```

---

## Task 11: Render grade pill on journal cards + detail modal + filter

**Files:**
- Modify: [js/journal.js](../../../js/journal.js) (`journalCard` line ~94, `openJournalDetail` line ~130, `renderJournalPage` line ~48)

- [ ] **Step 11.1: Update `journalCard` to render the grade pill**

In `journalCard()`, modify the `bt-thumb-lg` block. Replace it with:

```js
    el('div', { class: 'bt-thumb-lg', style: b.screenshotPath ? { backgroundImage: `url(${b.screenshotPath})` } : {} },
      !b.screenshotPath ? el('div', { class: 'bt-thumb-placeholder' }, 'no image') : null,
      el('span', { class: 'bt-result-badge ' + (b.result || 'be') }, (b.result || 'be').toUpperCase()),
      b.preGrading
        ? el('span', { class: 'grade-pill grade-pill--pre-grading bt-grade-badge' }, 'Pre-grading')
        : (b.grade
          ? el('span', { class: `grade-pill grade-pill--${gradeClass(b.grade)} bt-grade-badge` }, b.grade)
          : null),
      b.rAchieved ? el('span', { class: 'bt-r-badge' }, b.rAchieved + 'R') : null
    ),
```

- [ ] **Step 11.2: Show grade pill in detail modal**

In `openJournalDetail`, replace the `bt-detail-meta` block with:

```js
    el('div', { class: 'bt-detail-meta' },
      metaPill('Result', (b.result || '—').toUpperCase(), `result ${b.result}`),
      metaPill('Grade', b.preGrading ? 'Pre-grading' : (b.grade || '—'),
        b.preGrading ? 'grade-pre-grading' : (b.grade ? `grade-${gradeClass(b.grade)}` : '')),
      metaPill('R achieved', b.rAchieved ? b.rAchieved + 'R' : '—'),
      metaPill('Account', a?.name || 'Unassigned'),
      metaPill('Entry', fmtDate(b.entryDate || b.createdAt))
    ),
```

- [ ] **Step 11.3: Add Grade filter to the filter bar**

In `renderJournalPage()`, after the existing `Instrument` filter but before the `root.appendChild(bar)` line, add:

```js
  bar.appendChild(filterSelect('Grade', 'grade', [
    { value: 'all',         label: 'All grades' },
    { value: 'A',           label: 'A' },
    { value: 'B',           label: 'B' },
    { value: 'C',           label: 'C' },
    { value: 'Off-SOP',     label: 'Off-SOP' },
    { value: 'Pre-grading', label: 'Pre-grading' },
  ]));
```

- [ ] **Step 11.4: Apply the grade filter client-side**

Replace the `data.journals.filter(...)` chain with:

```js
  const filtered = data.journals.filter(b =>
    (filters.strategy === 'all'   || journalHasStrategy(b, filters.strategy)) &&
    (filters.account === 'all'    || b.accountId === filters.account) &&
    (filters.result === 'all'     || b.result === filters.result) &&
    (filters.instrument === 'all' || b.instrument === filters.instrument) &&
    (filters.grade === 'all'
      || (filters.grade === 'Pre-grading' ? b.preGrading === true : b.grade === filters.grade))
  );
```

- [ ] **Step 11.5: Commit**

```bash
git add js/journal.js
git commit -m "feat(journal): render grade pill on cards + detail, add grade filter"
```

---

## Task 12: CSS — checklist + grade pill styles

**Files:**
- Create: [css/sop-checklist.css](../../../css/sop-checklist.css)
- Modify: [index.html](../../../index.html) (`<head>` link tags)

- [ ] **Step 12.1: Write the stylesheet**

Create [css/sop-checklist.css](../../../css/sop-checklist.css):

```css
/* SOP checklist — 8-row field + live grade preview */
.sop-checklist {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 8px 0 4px;
}

.sop-checklist-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sop-row {
  display: grid;
  grid-template-columns: auto 1fr minmax(140px, 1fr);
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 160ms ease;
}
.sop-row:hover { border-color: rgba(245, 158, 11, 0.25); }

.sop-row-cb-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sop-row-cb { width: 16px; height: 16px; cursor: pointer; }

.sop-row-label {
  font-size: 13px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.85);
}

.sop-row-note { font-size: 12px; padding: 6px 8px; }

.sop-grade-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 12px;
}
.sop-grade-label {
  letter-spacing: 0.08em;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}
.sop-grade-count {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.6);
}

/* Grade pill — reused on cards, detail meta, and live preview */
.grade-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.grade-pill--a           { background: rgba(16, 185, 129, 0.18); color: #10B981; border-color: rgba(16,185,129,0.4); }
.grade-pill--b           { background: rgba(245, 158, 11, 0.18); color: #FDE68A; border-color: rgba(245,158,11,0.4); }
.grade-pill--c           { background: rgba(249, 115, 22, 0.18); color: #FDBA74; border-color: rgba(249,115,22,0.4); }
.grade-pill--off-sop     { background: rgba(239, 68, 68, 0.20);  color: #FCA5A5; border-color: rgba(239,68,68,0.45); }
.grade-pill--pre-grading { background: rgba(255,255,255,0.06);    color: rgba(255,255,255,0.55); border-color: rgba(255,255,255,0.12); }

.bt-grade-badge {
  position: absolute;
  top: 10px;
  right: 56px;
  z-index: 2;
  font-size: 10px;
  padding: 2px 6px;
}

/* meta pill grade tinting in detail modal */
.meta-pill.grade-a .meta-pill-v          { color: #10B981; }
.meta-pill.grade-b .meta-pill-v          { color: #FDE68A; }
.meta-pill.grade-c .meta-pill-v          { color: #FDBA74; }
.meta-pill.grade-off-sop .meta-pill-v    { color: #FCA5A5; }
.meta-pill.grade-pre-grading .meta-pill-v { color: rgba(255,255,255,0.6); }
```

- [ ] **Step 12.2: Link the stylesheet from index.html**

Open [index.html](../../../index.html), find the `<link rel="stylesheet" href="css/journal.css">` line in the `<head>`, and add directly after it:

```html
<link rel="stylesheet" href="css/sop-checklist.css">
```

- [ ] **Step 12.3: Commit**

```bash
git add css/sop-checklist.css index.html
git commit -m "style: add SOP checklist + grade pill stylesheet"
```

---

## Task 13: Manual end-to-end verification

**Files:** none — interactive only

- [ ] **Step 13.1: Boot server with the dev DB**

```bash
cd server && PORT=3001 npm start
```

- [ ] **Step 13.2: Open browser**

Visit `http://localhost:3001`. Hard reload (Ctrl+Shift+R).

- [ ] **Step 13.3: Click Journal in sidebar**

Verify: existing entries (if any) display a "Pre-grading" pill on the card thumbnail.

- [ ] **Step 13.4: Click "New entry"**

Verify the side panel shows the SOP CHECKLIST section between Strategies and Account, with 8 rows.

- [ ] **Step 13.5: Try to save without touching any checkboxes**

Click "Save entry" with the form half-filled. Toast should say "Review all 8 SOP rules before saving." and the panel should stay open.

- [ ] **Step 13.6: Tick all 8 checkboxes**

Watch the live preview at the bottom of the SOP section update from "Off-SOP · 0/8" → "C · 3/8" → "B · 5/8" → "A · 7/8" → "A · 8/8" as you tick.

- [ ] **Step 13.7: Save with 8/8 ticked**

Fill the rest of the form (Account, Result=win, Amount=100, R achieved=2.0). Save. New card should appear with a green "A" grade pill on the thumbnail.

- [ ] **Step 13.8: Filter by grade**

Use the new Grade dropdown — set it to "A". Only the new entry should be visible. Set to "Pre-grading". Only the legacy entries.

- [ ] **Step 13.9: Edit the new entry**

Click the card → modal → Edit. Confirm the SOP checklist re-renders with all 8 boxes ticked. Untick rule 4 and save. Card should now show "A · 7/8 confirmed" → wait, 7 confirmed = A still. Untick another → B.

- [ ] **Step 13.10: Inspect the DB**

In another terminal:

```bash
sqlite3 tms.db 'SELECT id, grade, confluence_count, pre_grading FROM journals ORDER BY created_at DESC LIMIT 5;'
```

Expected: the new entry shows the live grade and the legacy entries show `grade=NULL, pre_grading=1`.

- [ ] **Step 13.11: Stop the server**

Ctrl+C.

---

## Task 14: Final cleanup + merge prep

- [ ] **Step 14.1: Run the full test suite once more**

```bash
cd server && npm test
```

Expected: all tests pass (smoke + grading + schema + journal-api).

- [ ] **Step 14.2: Skim the diff**

```bash
git log --oneline main..HEAD
git diff main..HEAD --stat
```

Confirm no unrelated files changed.

- [ ] **Step 14.3: Push the feature branch**

```bash
git push -u origin feat/sop-checklist
```

- [ ] **Step 14.4: Stop. Do not merge yet.**

Per the spec, the merge happens at end of sprint after the Daily Cap branch is also ready. Confirm with the user before merging.

---

## Self-review notes

- **Spec coverage:** all six Feature 1 acceptance-criteria checkboxes from [docs/sprints/2026-05-02-week1-sprint.md](../../sprints/2026-05-02-week1-sprint.md) map to tasks above (8-checkbox-touch → Task 10.4, server-side grade compute → Task 4, Pre-grading display → Task 11.1+11.4, Grade filter → Task 11.3, grade pill on card → Task 11.1, live preview → Task 8.1).
- **Type consistency:** `sopChecks` (camelCase) used throughout JS, `sop_checks` only in SQL. `confluenceCount` in JS, `confluence_count` in SQL. `preGrading` / `pre_grading`. The component's `gradeClass()` helper produces the suffix used in both the pill class names (Task 8.1, 11.1) and the meta-pill modifier (Task 11.2, 12.1) — verified consistent.
- **Out of scope:** no editing of legacy entries, no backfill of old grades, no per-rule analytics — all explicitly deferred per the spec.
- **No placeholders** — every code block in this plan is the final implementation, every command has expected output.
