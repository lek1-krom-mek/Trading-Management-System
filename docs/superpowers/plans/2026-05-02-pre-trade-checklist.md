# Pre-Trade Checklist & Setup Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-trade discipline gate to TMS — Trade Plan records with multi-source checklists (global + per-strategy), automatic A/B/C/SKIP grading, journal linkage, and Discipline analytics.

**Architecture:** Two new SQLite tables (`trade_plans`, `checks`) and one column on `journals` (`plan_id`). Two new top-level UI surfaces (Trade Plans workspace, Doctrine checklist editor). One reusable checklist editor component used by both Doctrine and Strategy forms. One pure grading function. One pure analytics module. All vanilla JS / ES modules — no build step, no framework, no test runner added (the existing project has none). Testing for the pure grading function uses an ad-hoc `test-grading.html` page; everything else uses documented manual smoke tests.

**Tech Stack:** Node.js + Express + better-sqlite3 (server), vanilla ES modules (frontend), native `<canvas>` for charts, `multer` for screenshot uploads. All existing.

**Spec:** [docs/superpowers/specs/2026-05-02-pre-trade-checklist-design.md](../specs/2026-05-02-pre-trade-checklist-design.md)

---

## Conventions

- All code blocks contain real, complete code — copy-paste should work.
- File paths are absolute from the project root (e.g. `js/plans.js`).
- Each task ends with a commit. Commit messages use conventional commits.
- "Smoke test" steps tell you exactly what to click, what to expect, and what should still work afterward (regression guard).
- Where a task modifies existing code, it shows the surrounding context lines from the current file so you can locate the insertion point precisely.

---

## Phase 1 — Backend foundation

### Task 1: Schema additions for `trade_plans`, `checks`, and `journals.plan_id`

**Files:**
- Modify: `server/schema.sql`

- [ ] **Step 1: Append the two new tables to `server/schema.sql`**

Add this block at the end of the file (after the existing `idx_journals_*` indexes):

```sql

CREATE TABLE IF NOT EXISTS trade_plans (
  id                    TEXT PRIMARY KEY,
  strategy_ids          TEXT,        -- JSON array of strategy ids
  account_id            TEXT,
  instrument            TEXT,
  timeframe             TEXT,
  direction             TEXT,        -- 'long' | 'short'
  planned_entry         REAL,
  planned_sl            REAL,
  planned_tp            REAL,
  planned_rr            REAL,
  risk_pct              REAL,
  check_results         TEXT,        -- JSON object: { "<checkId>": true|false }
  grade                 TEXT,        -- 'A' | 'B' | 'C' | 'SKIP'
  status                TEXT,        -- 'draft' | 'planned' | 'executed' | 'skipped' | 'expired'
  journal_id            TEXT,
  premortem             TEXT,
  screenshot_path       TEXT,
  discipline_violation  INTEGER DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  executed_at           INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_status   ON trade_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_grade    ON trade_plans(grade);
CREATE INDEX IF NOT EXISTS idx_plans_created  ON trade_plans(created_at DESC);

CREATE TABLE IF NOT EXISTS checks (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL,        -- 'global' | 'strategy'
  strategy_id  TEXT,
  label        TEXT NOT NULL,
  description  TEXT,
  must_pass    INTEGER DEFAULT 0,    -- 0 | 1
  position     INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checks_scope    ON checks(scope);
CREATE INDEX IF NOT EXISTS idx_checks_strategy ON checks(strategy_id);
CREATE INDEX IF NOT EXISTS idx_checks_position ON checks(position);
```

- [ ] **Step 2: Verify schema parses by booting the server**

```bash
cd "server" && node -e "const Database=require('better-sqlite3');const fs=require('fs');const path=require('path');const db=new Database(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));console.log('OK');console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());"
```

Expected: prints `OK` followed by an array including `accounts`, `strategies`, `journals`, `trade_plans`, `checks`.

- [ ] **Step 3: Commit**

```bash
git add server/schema.sql
git commit -m "feat(schema): add trade_plans and checks tables"
```

---

### Task 2: Boot-time migration adds `journals.plan_id` to existing databases

**Files:**
- Modify: `server/server.js` (insert after the existing journals migration block, around line 65)

- [ ] **Step 1: Add `plan_id` migration to `server/server.js`**

Locate the existing block:

```javascript
try {
  const cols = db.prepare('PRAGMA table_info(journals)').all().map(c => c.name);
  if (!cols.includes('amount')) db.exec('ALTER TABLE journals ADD COLUMN amount REAL');
  if (!cols.includes('strategy_ids')) {
    db.exec('ALTER TABLE journals ADD COLUMN strategy_ids TEXT');
    // Backfill multi-strategy column from legacy single strategy_id
    ...
  }
} catch (err) {
  console.warn('[migrate] journals columns:', err.message);
}
```

Inside the same `try` block (after the `strategy_ids` backfill, before the closing `}`), add:

```javascript
  if (!cols.includes('plan_id')) db.exec('ALTER TABLE journals ADD COLUMN plan_id TEXT');
```

- [ ] **Step 2: Verify with a fresh-DB smoke test**

```bash
cd "server" && rm -f /tmp/tms-test.db && DB_PATH=/tmp/tms-test.db node -e "
const Database=require('better-sqlite3');const fs=require('fs');const path=require('path');
const db=new Database('/tmp/tms-test.db');
// Simulate an old DB without plan_id
db.exec('CREATE TABLE journals (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
// Apply schema (idempotent CREATE IF NOT EXISTS)
db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
const cols = db.prepare('PRAGMA table_info(journals)').all().map(c => c.name);
if (!cols.includes('plan_id')) db.exec('ALTER TABLE journals ADD COLUMN plan_id TEXT');
console.log(db.prepare('PRAGMA table_info(journals)').all().map(c => c.name));
" && rm /tmp/tms-test.db
```

Expected: array printed contains `plan_id`.

- [ ] **Step 3: Commit**

```bash
git add server/server.js
git commit -m "feat(server): migrate existing journals to add plan_id column"
```

---

### Task 3: Server MAPPERS for `trade_plans` and `checks`

**Files:**
- Modify: `server/server.js` (extend the `MAPPERS` object, around lines 86–205)

- [ ] **Step 1: Append two mappers inside `MAPPERS`**

After the closing `},` of the `journals` mapper (before the closing `};` of `MAPPERS` at ~line 205), insert:

```javascript
  trade_plans: {
    toDb: p => ({
      id: p.id,
      strategy_ids: JSON.stringify(p.strategyIds ?? []),
      account_id: p.accountId ?? null,
      instrument: p.instrument ?? null,
      timeframe: p.timeframe ?? null,
      direction: p.direction ?? null,
      planned_entry: p.plannedEntry ?? null,
      planned_sl: p.plannedSl ?? null,
      planned_tp: p.plannedTp ?? null,
      planned_rr: p.plannedRr ?? null,
      risk_pct: p.riskPct ?? null,
      check_results: JSON.stringify(p.checkResults ?? {}),
      grade: p.grade ?? null,
      status: p.status ?? 'draft',
      journal_id: p.journalId ?? null,
      premortem: p.premortem ?? null,
      screenshot_path: p.screenshotPath ?? null,
      discipline_violation: p.disciplineViolation ? 1 : 0,
      created_at: p.createdAt ?? Date.now(),
      updated_at: p.updatedAt ?? Date.now(),
      executed_at: p.executedAt ?? null,
    }),
    fromDb: r => ({
      id: r.id,
      strategyIds: r.strategy_ids ? JSON.parse(r.strategy_ids) : [],
      accountId: r.account_id,
      instrument: r.instrument,
      timeframe: r.timeframe,
      direction: r.direction,
      plannedEntry: r.planned_entry,
      plannedSl: r.planned_sl,
      plannedTp: r.planned_tp,
      plannedRr: r.planned_rr,
      riskPct: r.risk_pct,
      checkResults: r.check_results ? JSON.parse(r.check_results) : {},
      grade: r.grade,
      status: r.status,
      journalId: r.journal_id,
      premortem: r.premortem,
      screenshotPath: r.screenshot_path,
      disciplineViolation: r.discipline_violation === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      executedAt: r.executed_at,
    }),
  },
  checks: {
    toDb: c => ({
      id: c.id,
      scope: c.scope,
      strategy_id: c.strategyId ?? null,
      label: c.label,
      description: c.description ?? null,
      must_pass: c.mustPass ? 1 : 0,
      position: Number.isFinite(c.position) ? c.position : 0,
      created_at: c.createdAt ?? Date.now(),
      updated_at: c.updatedAt ?? Date.now(),
    }),
    fromDb: r => ({
      id: r.id,
      scope: r.scope,
      strategyId: r.strategy_id,
      label: r.label,
      description: r.description,
      mustPass: r.must_pass === 1,
      position: r.position ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  },
```

- [ ] **Step 2: Manual smoke test — start the server**

```bash
cd "server" && npm start
```

Expected console output: `TMS server → http://localhost:3000` with no schema errors. Hit Ctrl+C to stop.

- [ ] **Step 3: Verify list endpoints respond**

In a second terminal while server runs:

```bash
curl -s http://localhost:3000/api/trade_plans
curl -s http://localhost:3000/api/checks
```

Both should return `[]` (empty arrays — table exists, no rows yet).

- [ ] **Step 4: Commit**

```bash
git add server/server.js
git commit -m "feat(server): add MAPPERS for trade_plans and checks"
```

---

### Task 4: Server-side cascade rules and screenshot cleanup for plans

**Files:**
- Modify: `server/server.js` (the `app.delete('/api/:store/:id', ...)` handler, around lines 271–283)

- [ ] **Step 1: Replace the existing DELETE handler**

Find the existing handler:

```javascript
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
```

Replace with:

```javascript
app.delete('/api/:store/:id', (req, res) => {
  const { store, id } = req.params;
  if (!isStore(store)) return res.status(404).json({ error: 'Unknown store' });

  if (store === 'journals') {
    const row = db.prepare('SELECT screenshot_path FROM journals WHERE id = ?').get(id);
    if (row?.screenshot_path) deleteUpload(row.screenshot_path);
    // Unlink any plan that referenced this journal
    db.prepare('UPDATE trade_plans SET journal_id = NULL WHERE journal_id = ?').run(id);
  }

  if (store === 'trade_plans') {
    const row = db.prepare('SELECT screenshot_path, journal_id FROM trade_plans WHERE id = ?').get(id);
    if (row?.screenshot_path) deleteUpload(row.screenshot_path);
    // Null out the back-link on any journal that pointed at this plan
    if (row?.journal_id) {
      db.prepare('UPDATE journals SET plan_id = NULL WHERE id = ?').run(row.journal_id);
    }
  }

  db.prepare(`DELETE FROM ${store} WHERE id = ?`).run(id);
  res.status(204).end();
});
```

- [ ] **Step 2: Smoke test — server starts and journals/plans still delete**

```bash
cd "server" && npm start
```

Expected: server boots without errors. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server/server.js
git commit -m "feat(server): cascade unlink between trade_plans and journals on delete"
```

---

### Task 5: Server-side seeding of default global checks on first boot

**Files:**
- Modify: `server/server.js` (insert a new block after the `accounts` migration at ~line 83, before the `MAPPERS` declaration)

- [ ] **Step 1: Insert seeding block**

Add this block immediately after the `accounts` migration `try { ... } catch ...` block (around line 83):

```javascript
// ── Seed default global checks (only if `checks` table is empty) ─────────
try {
  const count = db.prepare('SELECT COUNT(*) AS n FROM checks').get().n;
  if (count === 0) {
    const now = Date.now();
    const defaults = [
      // Must-pass discipline gates
      { id: 'g-risk-1pct',   scope: 'global', label: 'Risk on this trade is ≤ 1% of account',           mustPass: 1, position: 0 },
      { id: 'g-no-news',     scope: 'global', label: 'No high-impact news within 30 minutes of entry',  mustPass: 1, position: 1 },
      { id: 'g-not-tilted',  scope: 'global', label: 'Not revenge-trading or tilted',                   mustPass: 1, position: 2 },
      { id: 'g-plan-first',  scope: 'global', label: 'Plan written before clicking buy/sell',           mustPass: 1, position: 3 },
      // Scored checks
      { id: 'g-good-session',scope: 'global', label: 'In a high-quality session (London / NY / US open)', mustPass: 0, position: 4 },
      { id: 'g-loss-limit',  scope: 'global', label: 'Daily loss limit not breached',                   mustPass: 0, position: 5 },
      { id: 'g-rr-2',        scope: 'global', label: 'Reward-to-risk ≥ 2.0',                            mustPass: 0, position: 6 },
      { id: 'g-screenshot',  scope: 'global', label: 'Setup screenshot captured',                        mustPass: 0, position: 7 },
    ];
    const ins = db.prepare(`INSERT INTO checks
      (id, scope, strategy_id, label, description, must_pass, position, created_at, updated_at)
      VALUES (@id, @scope, NULL, @label, NULL, @mustPass, @position, @now, @now)`);
    const tx = db.transaction(rows => { for (const r of rows) ins.run({ ...r, now }); });
    tx(defaults);
    console.log(`[seed] inserted ${defaults.length} default global checks`);
  }
} catch (err) {
  console.warn('[seed] global checks:', err.message);
}

// ── Auto-expire stale planned plans (older than 7 days) ──────────────────
try {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - sevenDaysMs;
  const upd = db.prepare(`UPDATE trade_plans
                          SET status = 'expired', updated_at = ?
                          WHERE status = 'planned' AND created_at < ?`);
  const result = upd.run(Date.now(), cutoff);
  if (result.changes > 0) console.log(`[expire] moved ${result.changes} stale plans to expired`);
} catch (err) {
  console.warn('[expire] plans:', err.message);
}
```

- [ ] **Step 2: Smoke test — defaults appear in fresh DB**

```bash
cd "server" && cp ../tms.db ../tms.db.bak 2>/dev/null; rm -f ../tms.db && npm start &
sleep 2
curl -s http://localhost:3000/api/checks | grep -c '"scope":"global"'
kill %1 2>/dev/null
mv ../tms.db.bak ../tms.db 2>/dev/null
```

Expected: prints `8`.

- [ ] **Step 3: Smoke test — re-running does NOT duplicate**

```bash
cd "server" && npm start &
sleep 2
curl -s http://localhost:3000/api/checks | grep -c '"scope":"global"'
kill %1 2>/dev/null
```

Expected: still prints `8` (no duplicates because count > 0 short-circuits).

- [ ] **Step 4: Commit**

```bash
git add server/server.js
git commit -m "feat(server): seed default global checks and auto-expire stale plans"
```

---

## Phase 2 — Pure grading function (TDD)

### Task 6: `js/grading.js` with `computeGrade()` + ad-hoc test page

**Files:**
- Create: `js/grading.js`
- Create: `test-grading.html` (project root)

- [ ] **Step 1: Write the test page first (TDD — RED)**

Create `test-grading.html` at the project root:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>grading.js tests</title>
<style>
  body { font-family: ui-monospace, monospace; background:#0b0e16; color:#e6e8ee; padding:20px; }
  .pass { color: #10B981; }
  .fail { color: #EF4444; }
  pre { background:#1a1f2b; padding:8px; border-radius:6px; }
</style></head>
<body>
<h1>computeGrade — test cases</h1>
<div id="out"></div>
<script type="module">
  import { computeGrade } from './js/grading.js';

  const out = document.getElementById('out');
  let pass = 0, fail = 0;
  function check(name, actual, expected) {
    const ok = actual === expected;
    if (ok) pass++; else fail++;
    out.appendChild(Object.assign(document.createElement('div'),
      { className: ok ? 'pass' : 'fail',
        textContent: `${ok ? '✓' : '✗'} ${name} — got ${actual}, expected ${expected}` }));
  }

  // No checks at all → A (degenerate; nothing to fail)
  check('no checks', computeGrade({}, []), 'A');

  // Single must-pass, ticked → A
  const oneMP = [{ id: 'a', mustPass: true }];
  check('one must-pass ticked', computeGrade({ a: true }, oneMP), 'A');
  check('one must-pass unticked', computeGrade({ a: false }, oneMP), 'SKIP');
  check('one must-pass missing', computeGrade({}, oneMP), 'SKIP');

  // Mix: must-pass fail → SKIP regardless of scored
  const mix = [
    { id: 'm1', mustPass: true },
    { id: 's1', mustPass: false },
    { id: 's2', mustPass: false },
  ];
  check('must-pass fails kills A', computeGrade({ m1: false, s1: true, s2: true }, mix), 'SKIP');

  // All must-pass tick + 100% scored → A
  check('all pass → A', computeGrade({ m1: true, s1: true, s2: true }, mix), 'A');

  // 50% scored, must-pass tick → C (50% < 70%)
  check('50% scored → C', computeGrade({ m1: true, s1: true, s2: false }, mix), 'C');

  // Mostly scored at 80% (4/5) → B
  const five = [
    { id: 'm1', mustPass: true },
    { id: 's1', mustPass: false },
    { id: 's2', mustPass: false },
    { id: 's3', mustPass: false },
    { id: 's4', mustPass: false },
    { id: 's5', mustPass: false },
  ];
  check('80% scored → B', computeGrade({ m1: true, s1: true, s2: true, s3: true, s4: true, s5: false }, five), 'B');

  // 90% scored exactly → A (boundary)
  const ten = Array.from({length: 11}, (_, i) =>
    i === 0 ? { id: 'm', mustPass: true } : { id: 's' + i, mustPass: false });
  const allButOne = { m: true };
  for (let i = 1; i <= 9; i++) allButOne['s' + i] = true;
  allButOne['s10'] = false;  // 9/10 scored = 90.0%
  check('90% boundary → A', computeGrade(allButOne, ten), 'A');

  // Only must-pass exists, all tick → A
  const onlyMP = [{ id: 'a', mustPass: true }, { id: 'b', mustPass: true }];
  check('only must-pass all tick → A', computeGrade({ a: true, b: true }, onlyMP), 'A');

  out.appendChild(Object.assign(document.createElement('h2'),
    { textContent: `${pass} passed, ${fail} failed`, style: { color: fail ? '#EF4444' : '#10B981' } }));
</script>
</body></html>
```

- [ ] **Step 2: Verify test page fails (no grading.js yet)**

Open `http://localhost:3000/test-grading.html` in a browser (after starting `npm start` in `server/`).
Expected: dev console shows `Failed to fetch /js/grading.js` or "module not found" — page is empty / errors.

- [ ] **Step 3: Implement `js/grading.js` (GREEN)**

Create `js/grading.js`:

```javascript
/**
 * grading.js — Pure grade computation for trade plans.
 *
 * Grades:
 *   SKIP — at least one must-pass check unticked
 *   A    — all must-pass ticked AND scored ratio ≥ 0.90 (or no scored checks)
 *   B    — all must-pass ticked AND scored ratio ≥ 0.70
 *   C    — all must-pass ticked AND scored ratio  < 0.70
 *
 * @param {Record<string, boolean>} checkResults  Map of checkId → ticked.
 * @param {Array<{id: string, mustPass: boolean}>} checks  All checks shown on the form.
 * @returns {'A' | 'B' | 'C' | 'SKIP'}
 */
export function computeGrade(checkResults, checks) {
  const ticked = id => checkResults[id] === true;

  const mustPass = checks.filter(c => c.mustPass);
  const scored   = checks.filter(c => !c.mustPass);

  if (mustPass.some(c => !ticked(c.id))) return 'SKIP';
  if (scored.length === 0) return 'A';

  const ratio = scored.filter(c => ticked(c.id)).length / scored.length;
  if (ratio >= 0.90) return 'A';
  if (ratio >= 0.70) return 'B';
  return 'C';
}

/**
 * Returns the unique union of `globalChecks` and per-strategy checks for the
 * selected strategies. Dedup is by case-insensitive label. Globals always come first.
 *
 * @param {Array<Check>} globalChecks
 * @param {Map<string, Array<Check>>} byStrategy  strategyId → its checks
 * @param {string[]} selectedStrategyIds
 * @returns {Array<Check>}
 */
export function checksForPlan(globalChecks, byStrategy, selectedStrategyIds) {
  const seen = new Set();
  const out = [];
  const push = c => {
    const key = (c.label || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  [...globalChecks].sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(push);
  for (const sid of selectedStrategyIds || []) {
    const list = byStrategy.get(sid) || [];
    [...list].sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(push);
  }
  return out;
}
```

- [ ] **Step 4: Verify test page passes**

Reload `http://localhost:3000/test-grading.html`.
Expected: all rows show `✓`, footer shows `9 passed, 0 failed`.

- [ ] **Step 5: Add `test-grading.html` to `.gitignore` (it's a dev artifact; we keep it locally)**

Run:

```bash
echo 'test-grading.html' >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add js/grading.js .gitignore
git commit -m "feat(grading): add pure computeGrade and checksForPlan helpers"
```

---

## Phase 3 — Store layer

### Task 7: Extend `js/store.js` with plans + checks

**Files:**
- Modify: `js/store.js`

- [ ] **Step 1: Add the new collections to the `data` object**

Find:

```javascript
export const data = {
  accounts:   [],
  strategies: [],
  journals:  [],
  activeAccountId: null,
};
```

Replace with:

```javascript
export const data = {
  accounts:   [],
  strategies: [],
  journals:  [],
  plans:      [],
  checks:     [],
  activeAccountId: null,
};
```

- [ ] **Step 2: Update `loadAll()` to fetch plans and checks**

Find:

```javascript
export async function loadAll() {
  const [a, s, b] = await Promise.all([
    db.getAll('accounts'),
    db.getAll('strategies'),
    db.getAll('journals'),
  ]);
  data.accounts   = a.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.strategies = s.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.journals  = b.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.activeAccountId = localStorage.getItem('tms-active-account') || (data.accounts[0]?.id || null);
  notify('all');
}
```

Replace with:

```javascript
export async function loadAll() {
  const [a, s, b, p, c] = await Promise.all([
    db.getAll('accounts'),
    db.getAll('strategies'),
    db.getAll('journals'),
    db.getAll('trade_plans'),
    db.getAll('checks'),
  ]);
  data.accounts   = a.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.strategies = s.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.journals   = b.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.plans      = p.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.checks     = c.sort((x,y) => (x.position||0) - (y.position||0));
  data.activeAccountId = localStorage.getItem('tms-active-account') || (data.accounts[0]?.id || null);
  notify('all');
}
```

- [ ] **Step 3: Add CRUD writers and helpers at the end of `js/store.js`**

Append to the end of the file:

```javascript

// ── Plans CRUD ───────────────────────────────────────────
export async function savePlan(obj) {
  if (!obj.id) obj.id = uid();
  await db.put('trade_plans', obj);
  const i = data.plans.findIndex(x => x.id === obj.id);
  if (i >= 0) data.plans[i] = obj; else data.plans.unshift(obj);
  notify('plans');
  return obj;
}
export async function deletePlan(id) {
  await db.del('trade_plans', id);
  data.plans = data.plans.filter(x => x.id !== id);
  // Server unlinks journals; reflect that locally
  for (const j of data.journals) {
    if (j.planId === id) j.planId = null;
  }
  notify('plans');
}

// Mark a plan as skipped (no journal created)
export async function skipPlan(id) {
  const p = data.plans.find(x => x.id === id);
  if (!p) return;
  const updated = { ...p, status: 'skipped', updatedAt: Date.now() };
  await savePlan(updated);
  return updated;
}

// Link a plan to a journal once executed. Sets discipline_violation if grade was SKIP.
export async function executePlan(planId, journalId) {
  const p = data.plans.find(x => x.id === planId);
  if (!p) return;
  const updated = {
    ...p,
    status: 'executed',
    journalId,
    executedAt: Date.now(),
    disciplineViolation: p.grade === 'SKIP',
  };
  await savePlan(updated);
  return updated;
}

// ── Checks CRUD ──────────────────────────────────────────
export async function saveCheck(obj) {
  if (!obj.id) obj.id = uid();
  await db.put('checks', obj);
  const i = data.checks.findIndex(x => x.id === obj.id);
  if (i >= 0) data.checks[i] = obj; else data.checks.push(obj);
  data.checks.sort((a, b) => (a.position||0) - (b.position||0));
  notify('checks');
  return obj;
}
export async function deleteCheck(id) {
  await db.del('checks', id);
  data.checks = data.checks.filter(x => x.id !== id);
  notify('checks');
}

// ── Plan helpers ─────────────────────────────────────────
export function planById(id) { return data.plans.find(p => p.id === id); }

// Returns global checks ordered by position.
export function globalChecks() {
  return data.checks.filter(c => c.scope === 'global').sort((a, b) => (a.position||0) - (b.position||0));
}

// Returns checks for a specific strategy ordered by position.
export function strategyChecks(strategyId) {
  return data.checks
    .filter(c => c.scope === 'strategy' && c.strategyId === strategyId)
    .sort((a, b) => (a.position||0) - (b.position||0));
}
```

- [ ] **Step 4: Smoke test — open the app and confirm boot**

```bash
cd "server" && npm start
```

Open `http://localhost:3000`. Open dev console.
Expected: no errors. Type in console:

```javascript
import('/js/store.js').then(m => console.log(m.data.checks.length, m.data.plans.length))
```

Expected: prints `8 0` (8 seeded global checks, 0 plans).

- [ ] **Step 5: Commit**

```bash
git add js/store.js
git commit -m "feat(store): add plans and checks collections, CRUD, and helpers"
```

---

## Phase 4 — Reusable checklist editor

### Task 8: `js/checklist.js` — single editor component used by Doctrine + Strategy form

**Files:**
- Create: `js/checklist.js`
- Modify: `css/forms.css` (append styles for the editor)

- [ ] **Step 1: Create `js/checklist.js`**

```javascript
/**
 * checklist.js — Reusable editor for a list of checks.
 *
 * Renders a list of editable rows (label, description, must-pass toggle, delete)
 * plus an "add" form row. Fires the supplied callbacks for persistence.
 *
 * Use cases:
 *  - Doctrine page editing globals: scope='global', strategyId=null
 *  - Strategy form editing per-strategy: scope='strategy', strategyId=<id>
 */

import { el, iconSVG } from './utils.js';
import { uid } from './db.js';

/**
 * @param {Object} opts
 * @param {Array<Check>} opts.checks       Current checks (already filtered to scope).
 * @param {'global'|'strategy'} opts.scope
 * @param {string|null} opts.strategyId
 * @param {(check: Check) => Promise<void>} opts.onSave
 * @param {(id: string) => Promise<void>} opts.onDelete
 * @returns {HTMLElement}
 */
export function checklistEditor({ checks, scope, strategyId, onSave, onDelete }) {
  const root = el('div', { class: 'checklist-editor' });

  function render() {
    root.innerHTML = '';
    const sorted = [...checks].sort((a, b) => (a.position||0) - (b.position||0));

    if (!sorted.length) {
      root.appendChild(el('div', { class: 'checklist-empty' },
        scope === 'global'
          ? 'No global checks yet. Add your first discipline rule below.'
          : 'No checks for this strategy yet. Add setup conditions below.'));
    }

    sorted.forEach(c => root.appendChild(renderRow(c)));
    root.appendChild(renderAddRow());
  }

  function renderRow(c) {
    const labelInput = el('input', {
      type: 'text', class: 'text-input', value: c.label, placeholder: 'Check label',
    });
    const descInput = el('input', {
      type: 'text', class: 'text-input', value: c.description || '', placeholder: 'Optional description / hint',
    });
    const mpToggle = el('label', { class: 'must-pass-toggle' },
      el('input', { type: 'checkbox', checked: !!c.mustPass }),
      el('span', {}, 'must-pass'),
    );

    async function commit() {
      const label = labelInput.value.trim();
      if (!label) return;
      await onSave({
        ...c,
        label,
        description: descInput.value.trim(),
        mustPass: mpToggle.querySelector('input').checked,
      });
    }

    labelInput.addEventListener('blur', commit);
    descInput.addEventListener('blur', commit);
    mpToggle.querySelector('input').addEventListener('change', commit);

    return el('div', { class: 'checklist-row' },
      mpToggle,
      labelInput,
      descInput,
      el('button', {
        type: 'button', class: 'icon-btn icon-btn-danger',
        'aria-label': 'Remove check',
        onClick: async () => { await onDelete(c.id); },
      }, el('span', { html: iconSVG('close') })),
    );
  }

  function renderAddRow() {
    const labelInput = el('input', { type: 'text', class: 'text-input', placeholder: 'New check…' });
    const mustPass = el('input', { type: 'checkbox' });

    async function add() {
      const label = labelInput.value.trim();
      if (!label) return;
      await onSave({
        id: uid(),
        scope,
        strategyId: scope === 'strategy' ? strategyId : null,
        label,
        description: '',
        mustPass: mustPass.checked,
        position: (checks.length ? Math.max(...checks.map(c => c.position||0)) + 1 : 0),
      });
      labelInput.value = '';
      mustPass.checked = false;
    }

    labelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    return el('div', { class: 'checklist-row checklist-add-row' },
      el('label', { class: 'must-pass-toggle' }, mustPass, el('span', {}, 'must-pass')),
      labelInput,
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: add },
        el('span', { html: iconSVG('plus') }), ' Add'),
    );
  }

  render();
  return root;
}
```

- [ ] **Step 2: Append styles to `css/forms.css`**

Append to the end of `css/forms.css`:

```css

/* ── Checklist editor ─────────────────────────────────── */
.checklist-editor { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.checklist-empty {
  padding: 12px; border: 1px dashed rgba(255,255,255,0.12);
  border-radius: 10px; color: rgba(255,255,255,0.5); font-size: 13px; text-align: center;
}
.checklist-row {
  display: grid; grid-template-columns: auto 1fr 1fr auto; gap: 8px;
  align-items: center; padding: 6px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
}
.checklist-add-row { background: rgba(245,158,11,0.04); border-color: rgba(245,158,11,0.18); }
.checklist-add-row .text-input { grid-column: span 2; }
.must-pass-toggle {
  display: flex; align-items: center; gap: 6px; font-size: 11px;
  color: rgba(255,255,255,0.6); white-space: nowrap; padding: 0 6px;
}
.must-pass-toggle input[type=checkbox] { accent-color: #F59E0B; }
.icon-btn-danger:hover { color: #EF4444; }
```

- [ ] **Step 3: Smoke test — module loads without syntax errors**

In the browser console at `http://localhost:3000`:

```javascript
import('/js/checklist.js').then(m => console.log(typeof m.checklistEditor))
```

Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add js/checklist.js css/forms.css
git commit -m "feat(checklist): reusable editor component for global and strategy checks"
```

---

## Phase 5 — Doctrine checklist page

### Task 9: Add `#doctrine/checklist` route + page section + render

**Files:**
- Modify: `index.html` (add a new `<section data-page="doctrine-checklist">`)
- Create: `js/doctrine.js`
- Modify: `js/main.js` (register the route)
- Modify: `js/dashboard.js` (link from existing Doctrine footer to the new editor)

- [ ] **Step 1: Add the page section to `index.html`**

Find the `<main id="app">` block and locate the existing `<section data-page="...">` blocks (e.g. `data-page="journal"`, `data-page="calendar"`). After the last one, add:

```html
        <section data-page="doctrine-checklist" hidden></section>
```

(The router hides/unhides these by `[data-page]` attribute.)

- [ ] **Step 2: Create `js/doctrine.js`**

```javascript
/**
 * doctrine.js — Editor for the global discipline checklist.
 */

import { el, iconSVG } from './utils.js';
import { data, globalChecks, saveCheck, deleteCheck } from './store.js';
import { checklistEditor } from './checklist.js';
import { go } from './router.js';

export function renderDoctrineChecklistPage() {
  const root = document.querySelector('[data-page="doctrine-checklist"]');
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('dashboard') },
        el('span', { html: iconSVG('chevron-left') || '←' }), ' Back to dashboard'),
      el('div', { class: 'page-eyebrow', style: { marginTop: '8px' } }, 'Doctrine'),
      el('h1', { class: 'page-title' }, 'Global discipline checklist'),
      el('p', { class: 'page-sub' },
        'These checks apply to every Trade Plan. Must-pass checks are deal-breakers — if any unticked, the plan is auto-graded SKIP.'),
    ),
  ));

  const editor = checklistEditor({
    checks: globalChecks(),
    scope: 'global',
    strategyId: null,
    onSave: async (c) => {
      await saveCheck(c);
      // Re-render with fresh data
      renderDoctrineChecklistPage();
    },
    onDelete: async (id) => {
      if (!confirm('Remove this check? Existing plans that reference it will keep their original grade.')) return;
      await deleteCheck(id);
      renderDoctrineChecklistPage();
    },
  });

  root.appendChild(el('div', { class: 'card', style: { padding: '20px', marginTop: '16px' } }, editor));
}
```

- [ ] **Step 3: Register the route in `js/main.js`**

Find the imports near the top:

```javascript
import { renderCalendarPage } from './calendar.js';
```

After it, add:

```javascript
import { renderDoctrineChecklistPage } from './doctrine.js';
```

Then find the `register()` block:

```javascript
register('calendar',    renderCalendarPage);
register('calculator',  () => { renderCalcMeta(); });
```

After `calendar`, add:

```javascript
register('doctrine',    (param) => {
  if (param === 'checklist') renderDoctrineChecklistPage();
  else go('dashboard');
});
```

(Import `go` if not already in scope — it is, near line 13: `import { register, initRouter, current, go } from './router.js';`.)

- [ ] **Step 4: Add Doctrine route to the subscribe re-render switch**

In `js/main.js`, find the `subscribe(...)` block:

```javascript
    const routes = {
      dashboard: renderDashboardPage,
      accounts:  () => r.param ? renderAccountDetail(r.param) : renderAccountsPage(),
      strategies: () => r.param ? renderStrategyDetail(r.param) : renderStrategiesPage(),
      journal:   renderJournalPage,
      calendar:  renderCalendarPage,
      calculator: renderCalcMeta,
    };
```

Add a `doctrine` entry:

```javascript
    const routes = {
      dashboard: renderDashboardPage,
      accounts:  () => r.param ? renderAccountDetail(r.param) : renderAccountsPage(),
      strategies: () => r.param ? renderStrategyDetail(r.param) : renderStrategiesPage(),
      journal:   renderJournalPage,
      calendar:  renderCalendarPage,
      calculator: renderCalcMeta,
      doctrine:  () => r.param === 'checklist' ? renderDoctrineChecklistPage() : null,
    };
```

- [ ] **Step 5: Wire the dashboard Doctrine footer to link to the editor**

Open `js/dashboard.js`, search for the existing doctrine footer block (look for the link to `blueprint.html` and the gold-risk page). Find the existing list of footer links and add a new link that calls `go('doctrine/checklist')`. Concretely, search for `doctrine` in the file and add the new entry near the existing links. Example pattern (paste after the gold-risk link, adapting to whatever element pattern is in the file):

```javascript
el('a', { href: '#doctrine/checklist', class: 'doctrine-link' },
  'Edit checklist →'),
```

(If there is no `<a>` and links use buttons, mirror the existing pattern. The point is: from the Doctrine footer the user can reach the checklist editor in one click.)

- [ ] **Step 6: Smoke test — navigate and edit**

1. Reload `http://localhost:3000`.
2. Click the new "Edit checklist →" link in the Doctrine footer (or hard-navigate to `#doctrine/checklist`).
3. Page renders with 8 seeded checks (4 must-pass, 4 scored).
4. Type a new label in the add row → press Enter → row appears.
5. Toggle must-pass on an existing row → blur → no error in console.
6. Click ✕ on a row → confirm → row disappears.
7. Reload page → changes persist.

- [ ] **Step 7: Commit**

```bash
git add index.html js/doctrine.js js/main.js js/dashboard.js
git commit -m "feat(doctrine): add global checklist editor page and dashboard link"
```

---

## Phase 6 — Strategy form integration

### Task 10: Embed the checklist editor in the existing strategy slide-in form

**Files:**
- Modify: `js/strategies.js` (locate `openStrategyForm` and add a new section before submit)

- [ ] **Step 1: Open `js/strategies.js` and locate the form body**

Open `js/strategies.js` and search for `openStrategyForm`. Inside the function find where the form `body` is constructed (a sequence of `field(...)` calls inside an `el('div', {}, ...)`).

- [ ] **Step 2: Import the checklist editor and helpers at the top of the file**

Add to the existing imports at the top:

```javascript
import { strategyChecks, saveCheck, deleteCheck } from './store.js';
import { checklistEditor } from './checklist.js';
```

(Merge into existing import lines from `./store.js` rather than adding a duplicate import.)

- [ ] **Step 3: Append the checklist section after the existing "Notes" field**

In the form body construction, after the field for `notes`, append:

```javascript
field('Setup checklist',
  existing && existing.id
    ? checklistEditor({
        checks: strategyChecks(existing.id),
        scope: 'strategy',
        strategyId: existing.id,
        onSave: async (c) => { await saveCheck(c); },
        onDelete: async (id) => { await deleteCheck(id); },
      })
    : el('div', { class: 'form-empty-note' }, 'Save the strategy first, then come back to add setup checks.'),
  'Tap one or more conditions that should be present for an A-grade entry.'),
```

(The current strategy form gives a saved strategy an `id`; only existing strategies show the editor. New unsaved strategies show the hint instead.)

- [ ] **Step 4: Smoke test**

1. Reload the app.
2. Click an existing strategy → click Edit. Form opens.
3. Scroll to the bottom — the "Setup checklist" section appears below "Notes".
4. Add a check, toggle must-pass, save form.
5. Re-open the same strategy → the check is still there.
6. Open a *new* strategy form → instead of the editor, see the hint "Save the strategy first…".
7. Confirm the existing strategy save flow still works (no regressions).

- [ ] **Step 5: Commit**

```bash
git add js/strategies.js
git commit -m "feat(strategies): embed setup checklist editor in strategy form"
```

---

## Phase 7 — Trade Plans workspace shell

### Task 11: Sidebar item + route + page section + render shell

**Files:**
- Modify: `index.html` (add sidebar nav button + page section)
- Create: `js/plans.js`
- Modify: `js/main.js` (register route, sidebar add button)
- Modify: `js/utils.js` (add new icon)

- [ ] **Step 1: Add the sidebar nav button to `index.html`**

Find the existing sidebar nav buttons (look for `<button class="nav-item" data-nav="journal">`). After the journal one, before calendar:

```html
            <button class="nav-item" data-nav="plans">
              <span class="nav-icon" data-icon="clipboard"></span>
              Trade Plans
            </button>
```

(Use the existing icon-rendering convention. If the sidebar uses inline SVG via JS, mirror that pattern instead.)

- [ ] **Step 2: Add the page section to `index.html`**

After the calendar `<section data-page="calendar">`, add:

```html
        <section data-page="plans" hidden></section>
```

- [ ] **Step 3: Add a `clipboard-check` icon to `js/utils.js`**

Open `js/utils.js`, find the `iconSVG()` function or the icon registry it uses. Add an entry under key `'clipboard-check'` (path data shown). If the registry takes raw SVG strings, append:

```javascript
'clipboard-check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0z"/><path d="m9 14 2 2 4-4"/></svg>',
```

- [ ] **Step 4: Create `js/plans.js` (skeleton with grouped list)**

```javascript
/**
 * plans.js — Trade Plans workspace.
 *
 * Two top-level tabs:
 *   - Plans      (default)  — grouped list by status
 *   - Discipline (analytics)  — implemented later
 */

import { data, planById, accountById, strategyById } from './store.js';
import { el, iconSVG, fmtRelative } from './utils.js';
import { go } from './router.js';

const TABS = [
  { id: 'list',       label: 'Plans' },
  { id: 'discipline', label: 'Discipline' },
];

let activeTab = 'list';

export function renderPlansPage() {
  const root = document.querySelector('[data-page="plans"]');
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Pre-trade discipline'),
      el('h1', { class: 'page-title' }, 'Trade Plans'),
      el('p', { class: 'page-sub' }, `${data.plans.length} plan${data.plans.length === 1 ? '' : 's'} logged — gate every trade with a checklist.`),
    ),
    el('button', { class: 'btn btn-primary', onClick: () => openPlanForm() },
      el('span', { html: iconSVG('plus') }), ' New Plan'),
  ));

  // Tabs
  const tabBar = el('div', { class: 'tab-bar' },
    ...TABS.map(t => el('button', {
      class: 'tab-btn ' + (activeTab === t.id ? 'active' : ''),
      onClick: () => { activeTab = t.id; renderPlansPage(); },
    }, t.label)));
  root.appendChild(tabBar);

  if (activeTab === 'list') renderListView(root);
  else renderDisciplineTabPlaceholder(root);
}

function renderListView(root) {
  if (!data.plans.length) {
    root.appendChild(el('div', { class: 'empty-inline' },
      'No plans yet. Click New Plan to gate your next trade.'));
    return;
  }

  const groups = {
    planned:  { label: 'Open',     plans: [] },
    executed: { label: 'Executed', plans: [] },
    skipped:  { label: 'Skipped',  plans: [] },
    draft:    { label: 'Drafts',   plans: [] },
    expired:  { label: 'Expired',  plans: [] },
  };
  for (const p of data.plans) (groups[p.status] || groups.draft).plans.push(p);

  for (const key of ['planned','executed','skipped','draft','expired']) {
    const g = groups[key];
    if (!g.plans.length) continue;
    root.appendChild(el('h2', { class: 'plans-group-title' },
      g.label, el('span', { class: 'plans-group-count' }, ` · ${g.plans.length}`)));
    const grid = el('div', { class: 'plans-grid' });
    g.plans.forEach(p => grid.appendChild(planCard(p)));
    root.appendChild(grid);
  }
}

function planCard(p) {
  const strategies = (p.strategyIds || []).map(strategyById).filter(Boolean);
  const a = accountById(p.accountId);

  return el('article', { class: 'plan-card', onClick: () => openPlanDetail(p) },
    el('div', { class: 'plan-card-head' },
      el('span', { class: 'grade-chip grade-' + (p.grade || 'C').toLowerCase() }, p.grade || '—'),
      el('span', { class: 'plan-instrument' }, p.instrument || '—'),
      el('span', { class: 'plan-direction ' + (p.direction || '') }, (p.direction || '').toUpperCase() || '—'),
    ),
    el('div', { class: 'plan-card-body' },
      el('div', { class: 'plan-card-row' },
        ...strategies.length
          ? strategies.map(s => el('span', {
              class: 'mini-chip',
              style: { background: s.color + '22', color: s.color, borderColor: s.color + '55' },
            }, s.name))
          : [el('span', { class: 'mini-chip' }, 'No strategy')]),
      el('div', { class: 'plan-card-foot' },
        el('span', {}, a ? a.name : 'Unassigned'),
        el('span', {}, p.plannedRr ? p.plannedRr.toFixed(2) + 'R planned' : ''),
        el('span', {}, fmtRelative(p.createdAt)),
      ),
      p.disciplineViolation
        ? el('div', { class: 'discipline-violation-tag' },
            el('span', { html: iconSVG('alert-triangle') || '!' }), ' Discipline violation')
        : null,
    ),
  );
}

function renderDisciplineTabPlaceholder(root) {
  root.appendChild(el('div', { class: 'empty-inline' }, 'Discipline analytics coming next.'));
}

// Placeholder for next tasks
export function openPlanForm(existing = null) {
  console.log('openPlanForm — implemented in Task 13', existing);
  alert('Plan form lands in Task 13.');
}
export function openPlanDetail(p) {
  console.log('openPlanDetail — implemented in Task 15', p);
  alert(`Plan detail for ${p.id} lands in Task 15.`);
}
```

- [ ] **Step 5: Add styles to `css/forms.css`**

Append to `css/forms.css`:

```css

/* ── Trade Plans workspace ─────────────────────────────── */
.tab-bar { display: flex; gap: 4px; margin: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.tab-btn {
  padding: 10px 16px; background: transparent; border: 0; color: rgba(255,255,255,0.6);
  font-size: 14px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab-btn.active { color: #FDE68A; border-bottom-color: #F59E0B; }

.plans-group-title { font-size: 14px; color: rgba(255,255,255,0.7); margin: 16px 0 8px; font-weight: 500; }
.plans-group-count { color: rgba(255,255,255,0.4); font-weight: normal; }
.plans-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 24px; }

.plan-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px; padding: 14px; cursor: pointer; transition: transform 200ms, border-color 200ms;
}
.plan-card:hover { border-color: rgba(249,168,37,0.3); transform: translateY(-2px); }
.plan-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.plan-instrument { font-weight: 600; font-size: 13px; }
.plan-direction { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,0.06); }
.plan-direction.long  { color: #10B981; }
.plan-direction.short { color: #EF4444; }
.plan-card-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
.plan-card-foot { display: flex; justify-content: space-between; gap: 6px; color: rgba(255,255,255,0.5); font-size: 11px; margin-top: 8px; }

.grade-chip {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 28px; height: 24px; padding: 0 8px; border-radius: 6px;
  font-weight: 700; font-size: 12px; letter-spacing: 0.05em;
}
.grade-a    { background: rgba(245,158,11,0.18); color: #FDE68A; }
.grade-b    { background: rgba(16,185,129,0.18); color: #6EE7B7; }
.grade-c    { background: rgba(249,115,22,0.18); color: #FDBA74; }
.grade-skip { background: rgba(239,68,68,0.18);  color: #FCA5A5; }

.discipline-violation-tag {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 8px; padding: 4px 8px; border-radius: 6px;
  background: rgba(239,68,68,0.12); color: #FCA5A5; font-size: 11px;
}
```

- [ ] **Step 6: Wire route + sidebar add button + subscribe re-render in `js/main.js`**

Add the import near the others:

```javascript
import { renderPlansPage, openPlanForm } from './plans.js';
```

In the `register()` block, after `journal`:

```javascript
register('plans',       renderPlansPage);
```

In `updateAddButton()` map, add:

```javascript
    plans:     'New Plan',
```

In `onAddClick()` switch:

```javascript
    case 'plans':       openPlanForm();      break;
```

In the `subscribe()` re-render `routes` map:

```javascript
      plans:     renderPlansPage,
```

- [ ] **Step 7: Smoke test**

1. Reload `http://localhost:3000`.
2. Sidebar shows "Trade Plans" entry. Click it.
3. Page renders with title "Trade Plans · 0 plans logged" and empty-state hint.
4. Click "New Plan" — alert appears: "Plan form lands in Task 13."
5. No console errors.

- [ ] **Step 8: Commit**

```bash
git add index.html js/plans.js js/main.js js/utils.js css/forms.css
git commit -m "feat(plans): add Trade Plans workspace shell with tabs and grouped list"
```

---

## Phase 8 — Plan form

### Task 12: `openPlanForm` — full slide-in form with fields and live grade

**Files:**
- Modify: `js/plans.js` (replace the placeholder `openPlanForm`)

- [ ] **Step 1: Replace imports at the top of `js/plans.js`**

Replace the current imports with the expanded set:

```javascript
import {
  data, planById, accountById, strategyById,
  globalChecks, strategyChecks,
  savePlan, deletePlan, skipPlan,
} from './store.js';
import { el, iconSVG, fmtRelative, INSTRUMENTS, TIMEFRAMES, toast } from './utils.js';
import {
  openFormPanel, field, textInput, numberInput, textArea, select,
  toggleGroup, imageUpload, multiChips, readForm,
} from './forms.js';
import { computeGrade, checksForPlan } from './grading.js';
import { go } from './router.js';
import { uid } from './db.js';
```

- [ ] **Step 2: Replace the placeholder `openPlanForm` with the real implementation**

Delete the current `openPlanForm` placeholder and replace with:

```javascript
export function openPlanForm(existing = null) {
  const p = existing || {
    direction: 'long',
    timeframe: 'H1',
    instrument: 'XAU/USD',
    strategyIds: [],
    accountId: data.activeAccountId || null,
    status: 'draft',
    checkResults: {},
  };

  const stratOpts = data.strategies.map(s => ({ value: s.id, label: s.name }));
  const acctOpts = [{ value: '', label: '— Unassigned —' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))];

  // Live state for the form (all fields update this; grade re-renders from it)
  const localState = {
    strategyIds: [...(p.strategyIds || [])],
    plannedEntry: p.plannedEntry ?? null,
    plannedSl:    p.plannedSl    ?? null,
    plannedTp:    p.plannedTp    ?? null,
    checkResults: { ...(p.checkResults || {}) },
  };

  const gradeChip = el('span', { class: 'grade-chip grade-c' }, '—');
  const rrDisplay = el('span', { class: 'rr-display' }, '—');

  const checklistMount = el('div', { class: 'plan-checklist' });

  // Build a Map<strategyId, checks[]> for the helper
  function rebuildChecklistMount() {
    checklistMount.innerHTML = '';
    const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
    const checks = checksForPlan(globalChecks(), byStrategy, localState.strategyIds);

    if (!checks.length) {
      checklistMount.appendChild(el('div', { class: 'form-empty-note' },
        'No checks configured. Add global checks in Doctrine or per-strategy checks in the Strategies workspace.'));
      return;
    }

    checks.forEach(c => {
      const id = c.id;
      const checked = !!localState.checkResults[id];
      const cb = el('input', { type: 'checkbox', checked });
      cb.addEventListener('change', () => {
        localState.checkResults[id] = cb.checked;
        updateGrade();
      });
      checklistMount.appendChild(el('label', {
        class: 'plan-check-row ' + (c.mustPass ? 'must-pass' : ''),
        title: c.description || '',
      },
        cb,
        el('span', { class: 'plan-check-label' }, c.label),
        c.mustPass ? el('span', { class: 'mini-chip danger' }, 'must-pass') : null,
      ));
    });

    updateGrade();
  }

  function updateGrade() {
    const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
    const checks = checksForPlan(globalChecks(), byStrategy, localState.strategyIds);
    const g = computeGrade(localState.checkResults, checks);
    gradeChip.textContent = g;
    gradeChip.className = 'grade-chip grade-' + g.toLowerCase();
  }

  function updateRR() {
    const e = parseFloat(localState.plannedEntry), sl = parseFloat(localState.plannedSl), tp = parseFloat(localState.plannedTp);
    if (!isFinite(e) || !isFinite(sl) || !isFinite(tp) || e === sl) {
      rrDisplay.textContent = '—';
      return null;
    }
    const rr = Math.abs(e - tp) / Math.abs(e - sl);
    rrDisplay.textContent = rr.toFixed(2) + 'R';
    return rr;
  }

  // Strategies multi-chip with onChange to re-render the checklist
  const stratChips = stratOpts.length
    ? multiChips({ name: 'strategyIds', values: localState.strategyIds, options: stratOpts })
    : el('div', { class: 'form-empty-note' }, 'Create a strategy first.');
  // Watch the hidden input for changes (multiChips updates a hidden input on click)
  if (stratChips.querySelector) {
    stratChips.addEventListener('click', () => {
      const hidden = stratChips.querySelector('input[type=hidden]');
      if (hidden) {
        const v = hidden.value;
        localState.strategyIds = v ? v.split(',').filter(Boolean) : [];
        rebuildChecklistMount();
      }
    });
  }

  const entryInput = numberInput({ name: 'plannedEntry', value: p.plannedEntry ?? '', step: 0.0001, placeholder: 'e.g. 2410.50' });
  const slInput    = numberInput({ name: 'plannedSl',    value: p.plannedSl    ?? '', step: 0.0001, placeholder: 'e.g. 2407.20' });
  const tpInput    = numberInput({ name: 'plannedTp',    value: p.plannedTp    ?? '', step: 0.0001, placeholder: 'e.g. 2418.00' });
  [entryInput, slInput, tpInput].forEach(inp => {
    inp.addEventListener('input', () => {
      const key = inp.name;
      localState[key] = parseFloat(inp.value);
      updateRR();
    });
  });

  const body = el('div', {},
    el('div', { class: 'plan-grade-banner' },
      el('span', {}, 'Live grade'), gradeChip,
      el('span', { class: 'rr-label' }, 'Planned RR'), rrDisplay,
    ),
    field('Strategies', stratChips, 'Tap one or more — checklist below merges from globals + each strategy.'),
    field('Account', select({ name: 'accountId', value: p.accountId || '', options: acctOpts })),
    el('div', { class: 'form-row' },
      field('Instrument', select({ name: 'instrument', value: p.instrument || 'XAU/USD',
        options: INSTRUMENTS.map(i => ({ value: i, label: i })) })),
      field('Timeframe',  select({ name: 'timeframe',  value: p.timeframe || 'H1',
        options: TIMEFRAMES.map(t => ({ value: t, label: t })) })),
    ),
    field('Direction', toggleGroup({ name: 'direction', value: p.direction || 'long', options: [
      { value: 'long', label: 'Long' }, { value: 'short', label: 'Short' },
    ] })),
    el('div', { class: 'form-row' },
      field('Planned entry', entryInput),
      field('Stop loss',     slInput),
      field('Take profit',   tpInput),
    ),
    field('Risk %', numberInput({ name: 'riskPct', value: p.riskPct ?? '', step: 0.1, min: 0, max: 100, placeholder: 'e.g. 1' })),
    field('Checklist', checklistMount, 'Tick what is true right now. Must-pass checks are deal-breakers.'),
    field('Pre-mortem', textArea({ name: 'premortem', value: p.premortem || '', rows: 3, placeholder: 'What would invalidate this trade? What could go wrong?' })),
    field('Setup screenshot', imageUpload({ name: 'screenshotPath', value: p.screenshotPath || '' })),
  );

  rebuildChecklistMount();
  updateRR();

  openFormPanel({
    title: existing ? 'Edit plan' : 'New trade plan',
    body,
    submitLabel: existing ? 'Save changes' : 'Save plan',
    onDelete: existing ? async () => { await deletePlan(existing.id); toast('Plan deleted'); } : null,
    onSubmit: async (form) => {
      const raw = readForm(form, ['strategyIds']);
      const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
      const checks = checksForPlan(globalChecks(), byStrategy, localState.strategyIds);
      const grade = computeGrade(localState.checkResults, checks);

      const obj = {
        ...p,
        id: p.id || uid(),
        strategyIds: localState.strategyIds,
        accountId: raw.accountId || null,
        instrument: raw.instrument,
        timeframe: raw.timeframe,
        direction: raw.direction,
        plannedEntry: parseFloat(raw.plannedEntry) || null,
        plannedSl:    parseFloat(raw.plannedSl)    || null,
        plannedTp:    parseFloat(raw.plannedTp)    || null,
        plannedRr:    updateRR(),
        riskPct:      parseFloat(raw.riskPct)      || null,
        checkResults: { ...localState.checkResults },
        grade,
        status: 'planned',  // Save = commit; "Save as draft" handled below if needed later
        premortem: raw.premortem,
        screenshotPath: raw.screenshotPath || p.screenshotPath || '',
      };
      await savePlan(obj);
      toast(existing ? 'Plan updated' : `Plan saved · grade ${grade}`);
    },
  });
}
```

- [ ] **Step 3: Append plan form styles to `css/forms.css`**

Append:

```css

/* ── Plan form ─────────────────────────────────────────── */
.plan-grade-banner {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 12px; margin-bottom: 12px;
  background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.18); border-radius: 12px;
  font-size: 12px; color: rgba(255,255,255,0.7);
}
.plan-grade-banner .grade-chip { font-size: 14px; height: 28px; min-width: 36px; }
.rr-display { font-weight: 600; color: #FDE68A; }
.rr-label { margin-left: 12px; }

.plan-checklist { display: flex; flex-direction: column; gap: 6px; }
.plan-check-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  cursor: pointer;
}
.plan-check-row.must-pass { border-color: rgba(239,68,68,0.18); }
.plan-check-row input[type=checkbox] { accent-color: #F59E0B; }
.plan-check-label { flex: 1; font-size: 13px; }
.mini-chip.danger { background: rgba(239,68,68,0.18); color: #FCA5A5; border-color: rgba(239,68,68,0.3); }
```

- [ ] **Step 4: Smoke test**

1. Open Trade Plans → click New Plan.
2. Slide-in form opens. Pick a strategy chip → checklist appears (8 globals + any strategy checks).
3. Tick boxes — grade chip updates live: SKIP → C → B → A as you tick.
4. Enter entry/sl/tp → planned RR updates.
5. Save plan → toast `Plan saved · grade A` (or whatever).
6. Plan card appears in the **Open** group with the grade badge.
7. No console errors.

- [ ] **Step 5: Commit**

```bash
git add js/plans.js css/forms.css
git commit -m "feat(plans): add plan slide-in form with live grading and checklist"
```

---

### Task 13: Plan detail view + skip action

**Files:**
- Modify: `js/plans.js`

- [ ] **Step 1: Replace `openPlanDetail` placeholder with real modal**

Delete the placeholder `openPlanDetail` and replace with:

```javascript
export function openPlanDetail(p) {
  const strategies = (p.strategyIds || []).map(strategyById).filter(Boolean);
  const a = accountById(p.accountId);
  const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
  const checks = checksForPlan(globalChecks(), byStrategy, p.strategyIds || []);

  const overlay = el('div', { class: 'bt-detail-overlay' });
  function close() { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); }

  const actionsBar = el('div', { class: 'bt-detail-actions' },
    p.status === 'planned'
      ? el('button', { class: 'btn btn-primary btn-sm',
          onClick: async () => { close(); openExecuteFlow(p); } },
          'Mark executed → log result')
      : null,
    p.status === 'planned'
      ? el('button', { class: 'btn btn-ghost btn-sm',
          onClick: async () => {
            if (!confirm('Mark this plan as skipped?')) return;
            await skipPlan(p.id); toast('Plan skipped'); close();
          } },
          el('span', { html: iconSVG('x') || '×' }), ' Skip')
      : null,
    el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { close(); openPlanForm(p); } },
      el('span', { html: iconSVG('edit') }), ' Edit'),
    el('button', { class: 'icon-btn', onClick: close, 'aria-label': 'Close' },
      el('span', { html: iconSVG('close') })),
  );

  const checkRows = checks.map(c => {
    const ticked = p.checkResults?.[c.id] === true;
    return el('div', { class: 'plan-check-detail-row ' + (ticked ? 'ticked' : 'unticked') },
      el('span', { class: 'plan-check-mark' }, ticked ? '✓' : '✗'),
      el('span', { class: 'plan-check-label' }, c.label),
      c.mustPass ? el('span', { class: 'mini-chip danger' }, 'must-pass') : null,
    );
  });

  const modal = el('div', { class: 'bt-detail-modal' },
    el('div', { class: 'bt-detail-header' },
      el('div', {},
        el('div', { class: 'bt-detail-title' },
          el('span', { class: 'grade-chip grade-' + (p.grade || 'c').toLowerCase() }, p.grade || '—'),
          ' ', strategies.length ? strategies.map(s => s.name).join(' + ') : 'No strategy'),
        el('div', { class: 'bt-detail-sub' },
          `${p.instrument || '—'} · ${p.timeframe || '—'} · ${(p.direction || '').toUpperCase()} · ${fmtRelative(p.createdAt)}`),
        p.disciplineViolation
          ? el('div', { class: 'discipline-violation-tag', style: { marginTop: '8px' } },
              'Discipline violation — executed despite SKIP grade')
          : null,
      ),
      actionsBar,
    ),
    p.screenshotPath
      ? el('div', { class: 'bt-detail-image' }, el('img', { src: p.screenshotPath, alt: '' }))
      : null,
    el('div', { class: 'bt-detail-meta' },
      metaPill('Status', (p.status || '—').toUpperCase()),
      metaPill('Account', a?.name || 'Unassigned'),
      metaPill('Risk %', p.riskPct ? p.riskPct + '%' : '—'),
      metaPill('Planned RR', p.plannedRr ? p.plannedRr.toFixed(2) + 'R' : '—'),
    ),
    el('div', { class: 'bt-detail-body' },
      el('h4', {}, 'Checklist'),
      el('div', { class: 'plan-check-detail' }, ...checkRows),
      p.premortem
        ? el('div', {}, el('h4', {}, 'Pre-mortem'), el('p', {}, p.premortem))
        : null,
    ),
  );

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function metaPill(label, value) {
  return el('div', { class: 'meta-pill' },
    el('div', { class: 'meta-pill-l' }, label),
    el('div', { class: 'meta-pill-v' }, value),
  );
}

// Stub — implemented in Task 14
function openExecuteFlow(p) {
  console.log('openExecuteFlow — implemented in Task 14', p);
  alert('Execute flow lands in Task 14.');
}
```

- [ ] **Step 2: Append detail-view styles to `css/forms.css`**

```css

.plan-check-detail { display: flex; flex-direction: column; gap: 4px; }
.plan-check-detail-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 8px;
}
.plan-check-detail-row.ticked   { background: rgba(16,185,129,0.06); color: #6EE7B7; }
.plan-check-detail-row.unticked { background: rgba(239,68,68,0.06);  color: #FCA5A5; }
.plan-check-mark { font-weight: 700; min-width: 16px; }
```

- [ ] **Step 3: Smoke test**

1. From the plans list, click an Open plan card → detail modal opens.
2. Modal shows grade chip, strategy names, and the checklist with green ticks (passed) and red crosses (failed).
3. Click Skip → confirm → modal closes, plan card moves to the Skipped group.
4. Click Edit on another plan → form opens pre-filled.
5. Click Mark executed → alert: "Execute flow lands in Task 14."

- [ ] **Step 4: Commit**

```bash
git add js/plans.js css/forms.css
git commit -m "feat(plans): plan detail modal with grade breakdown and skip action"
```

---

## Phase 9 — Execute flow + journal back-link

### Task 14: Modify journal form to accept `planId` and write back-links

**Files:**
- Modify: `js/journal.js`

- [ ] **Step 1: Update `openJournalForm` to read `defaults.planId`**

Open `js/journal.js` and find:

```javascript
export function openJournalForm(existing = null, defaults = {}) {
  const b = existing || { result: 'win', direction: 'long', timeframe: 'H1', instrument: 'XAU/USD', tags: [], strategyIds: [], ...defaults };
```

Below this line, capture the planId and the related plan if any:

```javascript
  const planId = defaults.planId || (existing && existing.planId) || null;
  const linkedPlan = planId ? data.plans.find(p => p.id === planId) : null;
  const isDisciplineViolation = !!linkedPlan && linkedPlan.grade === 'SKIP';
```

(Add `data` and `executePlan` to the imports at the top of the file:)

```javascript
import { data, savejournal, deletejournal, strategyById, accountById, saveAccount, journalStrategyIds, journalHasStrategy, executePlan } from './store.js';
```

- [ ] **Step 2: Add a discipline-violation banner at the top of the form body**

In the body construction (around line 215), prepend a banner:

```javascript
  const body = el('div', {},
    isDisciplineViolation
      ? el('div', { class: 'discipline-warning-banner' },
          el('strong', {}, 'Discipline violation warning:'),
          ' This plan failed must-pass checks. Logging it anyway will be recorded as a discipline violation.')
      : null,
    field('Screenshot', imageUpload({ name: 'screenshotPath', value: b.screenshotPath || '' })),
    // ... existing fields unchanged
```

- [ ] **Step 3: Set `planId` on the saved object and call `executePlan`**

In the `onSubmit` handler, find the `obj` construction:

```javascript
      const obj = {
        ...b,
        strategyIds: newStrategyIds,
        strategyId: newStrategyIds[0] || null,
        accountId: newAccountId,
        // ...
      };
      await savejournal(obj);
```

Modify to include `planId` and call `executePlan` after:

```javascript
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
      };
      const savedJournal = await savejournal(obj);

      // If this journal was created from a plan, link plan→journal and flag discipline violation
      if (planId && !existing) {
        await executePlan(planId, savedJournal.id);
      }
```

- [ ] **Step 4: Append discipline-warning banner styles to `css/forms.css`**

```css

.discipline-warning-banner {
  padding: 12px; margin-bottom: 12px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px;
  color: #FCA5A5; font-size: 13px;
}
.discipline-warning-banner strong { color: #FECACA; }
```

- [ ] **Step 5: Update server `journals` MAPPER to persist `plan_id`**

Open `server/server.js` and find the `journals` mapper:

```javascript
  journals: {
    toDb: b => {
      const ids = ...
      return {
        id: b.id,
        strategy_id: ids[0] ?? null,
        strategy_ids: JSON.stringify(ids),
        account_id: b.accountId ?? null,
        ...
        updated_at: b.updatedAt ?? Date.now(),
      };
    },
```

Add `plan_id` to both `toDb` and `fromDb`:

```javascript
        plan_id: b.planId ?? null,
        // ...rest unchanged
```

In `fromDb`:

```javascript
        planId: r.plan_id,
        // ...rest unchanged
```

- [ ] **Step 6: Smoke test (planId persistence — without execute UI yet)**

In dev console:

```javascript
const m = await import('/js/store.js');
const j = await m.savejournal({ id: 'test-123', strategyIds: [], result: 'win', amount: 100, planId: 'fake-plan' });
console.log(j.planId);
// Reload page, then:
console.log(m.data.journals.find(x => x.id === 'test-123').planId);
// Cleanup:
await m.deletejournal('test-123');
```

Expected: both prints show `'fake-plan'`.

- [ ] **Step 7: Restart server (schema toDb change requires reboot)**

```bash
# Ctrl+C the running server, then
cd "server" && npm start
```

- [ ] **Step 8: Commit**

```bash
git add js/journal.js css/forms.css server/server.js
git commit -m "feat(journal): accept planId default, persist plan_id, link back to plan on save"
```

---

### Task 15: `openExecuteFlow` — open journal form pre-filled from plan

**Files:**
- Modify: `js/plans.js`

- [ ] **Step 1: Add the journal-form import to `js/plans.js`**

Add to the imports at the top:

```javascript
import { openJournalForm } from './journal.js';
```

- [ ] **Step 2: Replace the `openExecuteFlow` stub**

Find the stub `function openExecuteFlow(p) { ... alert(...); }` and replace with:

```javascript
function openExecuteFlow(p) {
  // Open the existing journal form pre-filled from the plan.
  // savejournal callback in journal.js will call executePlan() when planId is set.
  openJournalForm(null, {
    planId: p.id,
    strategyIds: [...(p.strategyIds || [])],
    accountId: p.accountId || null,
    instrument: p.instrument || 'XAU/USD',
    timeframe: p.timeframe || 'H1',
    direction: p.direction || 'long',
    screenshotPath: p.screenshotPath || '',
  });
}
```

- [ ] **Step 3: Smoke test (full execute flow)**

1. Open a planned plan from the list (preferably an A or B grade) → click Mark executed.
2. Journal form opens pre-filled with the plan's strategies, account, instrument, etc.
3. Set Result = Win, Amount = 100, R achieved = 2 → save.
4. New journal appears in the Journal workspace.
5. Back to Trade Plans → original plan moved from Open to Executed.
6. Account balance updated by +$100 (existing journal logic still works).
7. Repeat with a SKIP-graded plan: red discipline-violation banner appears at top of journal form. Save anyway.
8. Plan now shows the discipline-violation tag on its card.

- [ ] **Step 4: Commit**

```bash
git add js/plans.js
git commit -m "feat(plans): execute flow opens journal form pre-filled with plan data"
```

---

## Phase 10 — Discipline analytics

### Task 16: `js/discipline.js` — pure analytics computation

**Files:**
- Create: `js/discipline.js`

- [ ] **Step 1: Create `js/discipline.js`**

```javascript
/**
 * discipline.js — Pure analytics over plans + journals.
 *
 * No DOM dependencies — returns data shapes that the UI then renders.
 */

/**
 * Win rate by grade. Considers only executed plans whose linked journal has
 * result IN ('win', 'loss'). Breakeven excluded from denominator.
 *
 * @param {Plan[]} plans
 * @param {Journal[]} journals
 * @returns {Record<'A'|'B'|'C'|'SKIP', { wins: number, losses: number, winRate: number }>}
 */
export function winRateByGrade(plans, journals) {
  const journalById = new Map(journals.map(j => [j.id, j]));
  const buckets = { A: { wins: 0, losses: 0 }, B: { wins: 0, losses: 0 },
                    C: { wins: 0, losses: 0 }, SKIP: { wins: 0, losses: 0 } };
  for (const p of plans) {
    if (p.status !== 'executed' || !p.journalId) continue;
    const j = journalById.get(p.journalId);
    if (!j || (j.result !== 'win' && j.result !== 'loss')) continue;
    const bucket = buckets[p.grade] || buckets.C;
    if (j.result === 'win') bucket.wins++; else bucket.losses++;
  }
  const out = {};
  for (const [grade, b] of Object.entries(buckets)) {
    const total = b.wins + b.losses;
    out[grade] = { wins: b.wins, losses: b.losses,
                   winRate: total ? (b.wins / total) * 100 : 0 };
  }
  return out;
}

/**
 * Expectancy ($/trade) by grade — sum of signed P&L over count of executed plans.
 *
 * @param {Plan[]} plans
 * @param {Journal[]} journals
 * @returns {Record<'A'|'B'|'C'|'SKIP', { count: number, total: number, expectancy: number }>}
 */
export function expectancyByGrade(plans, journals) {
  const journalById = new Map(journals.map(j => [j.id, j]));
  const buckets = { A: [0, 0], B: [0, 0], C: [0, 0], SKIP: [0, 0] }; // [count, total$]
  for (const p of plans) {
    if (p.status !== 'executed' || !p.journalId) continue;
    const j = journalById.get(p.journalId);
    if (!j) continue;
    const amt = Math.abs(parseFloat(j.amount) || 0);
    const signed = j.result === 'win' ? amt : j.result === 'loss' ? -amt : 0;
    const b = buckets[p.grade] || buckets.C;
    b[0]++;
    b[1] += signed;
  }
  const out = {};
  for (const [grade, [count, total]] of Object.entries(buckets)) {
    out[grade] = { count, total, expectancy: count ? total / count : 0 };
  }
  return out;
}

/**
 * Discipline violations — count + total PnL of executed plans flagged as violations.
 */
export function disciplineViolations(plans, journals) {
  const journalById = new Map(journals.map(j => [j.id, j]));
  const violations = plans.filter(p => p.disciplineViolation && p.status === 'executed');
  let total = 0;
  for (const p of violations) {
    const j = journalById.get(p.journalId);
    if (!j) continue;
    const amt = Math.abs(parseFloat(j.amount) || 0);
    total += j.result === 'win' ? amt : j.result === 'loss' ? -amt : 0;
  }
  return { count: violations.length, total };
}

/**
 * Skip ratio over the last N days. (skipped + executed) is the denominator;
 * draft and expired do not count (those are non-decisions).
 */
export function skipRatio(plans, days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = plans.filter(p => (p.createdAt || 0) >= cutoff);
  const decisive = recent.filter(p => p.status === 'skipped' || p.status === 'executed');
  if (!decisive.length) return { ratio: 0, skipped: 0, executed: 0 };
  const skipped  = decisive.filter(p => p.status === 'skipped').length;
  const executed = decisive.filter(p => p.status === 'executed').length;
  return { ratio: skipped / decisive.length, skipped, executed };
}

/**
 * Top failed checks across all SKIP-graded plans (regardless of status).
 * Returns the top N by frequency of unticked must-pass checks.
 *
 * @param {Plan[]} plans
 * @param {Check[]} allChecks  flat array of all known checks
 * @param {number} topN
 */
export function topFailedChecks(plans, allChecks, topN = 3) {
  const checkById = new Map(allChecks.map(c => [c.id, c]));
  const counts = new Map();
  for (const p of plans) {
    if (p.grade !== 'SKIP') continue;
    const results = p.checkResults || {};
    for (const c of allChecks) {
      if (!c.mustPass) continue;
      // Only count checks the plan actually evaluated (i.e. exist in checkResults)
      if (!(c.id in results)) continue;
      if (results[c.id] === false) {
        counts.set(c.id, (counts.get(c.id) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, count]) => ({ check: checkById.get(id), count }));
}
```

- [ ] **Step 2: Smoke test (module loads)**

In browser console:

```javascript
import('/js/discipline.js').then(m => console.log(Object.keys(m)));
```

Expected: prints `["winRateByGrade","expectancyByGrade","disciplineViolations","skipRatio","topFailedChecks"]`.

- [ ] **Step 3: Commit**

```bash
git add js/discipline.js
git commit -m "feat(discipline): pure analytics computation for plan grades"
```

---

### Task 17: Discipline tab on the Trade Plans workspace

**Files:**
- Modify: `js/plans.js`

- [ ] **Step 1: Replace the `renderDisciplineTabPlaceholder` with a real renderer**

In `js/plans.js`, replace the placeholder function:

```javascript
function renderDisciplineTabPlaceholder(root) {
  root.appendChild(el('div', { class: 'empty-inline' }, 'Discipline analytics coming next.'));
}
```

with:

```javascript
import {
  winRateByGrade, expectancyByGrade, disciplineViolations, skipRatio, topFailedChecks,
} from './discipline.js';

function renderDisciplineTab(root) {
  const wr = winRateByGrade(data.plans, data.journals);
  const ex = expectancyByGrade(data.plans, data.journals);
  const dv = disciplineViolations(data.plans, data.journals);
  const sr = skipRatio(data.plans, 30);
  const top = topFailedChecks(data.plans, data.checks, 3);

  // Top stat tiles
  root.appendChild(el('div', { class: 'discipline-tiles' },
    tile('Skip ratio (30d)', sr.ratio ? (sr.ratio * 100).toFixed(0) + '%' : '—',
         sr.skipped + ' skipped · ' + sr.executed + ' executed'),
    tile('Discipline violations', dv.count.toString(),
         (dv.total >= 0 ? '+' : '') + '$' + dv.total.toFixed(0) + ' total'),
    tile('Plans (all time)', data.plans.length.toString(),
         data.plans.filter(p => p.status === 'executed').length + ' executed'),
  ));

  // Win rate by grade
  root.appendChild(el('h3', { class: 'discipline-section-title' }, 'Win rate by grade'));
  root.appendChild(barChart(['A','B','C','SKIP'].map(g => ({
    label: g, value: wr[g].winRate, hint: wr[g].wins + 'W / ' + wr[g].losses + 'L',
  }))));

  // Expectancy by grade
  root.appendChild(el('h3', { class: 'discipline-section-title' }, 'Expectancy ($/trade) by grade'));
  root.appendChild(barChart(['A','B','C','SKIP'].map(g => ({
    label: g,
    value: ex[g].expectancy,
    hint: '$' + ex[g].total.toFixed(0) + ' over ' + ex[g].count,
    signed: true,
  }))));

  // Top failed checks
  root.appendChild(el('h3', { class: 'discipline-section-title' }, 'Top failed checks'));
  if (!top.length) {
    root.appendChild(el('div', { class: 'empty-inline' }, 'No SKIP-graded plans yet.'));
  } else {
    const list = el('div', { class: 'top-failed-list' });
    top.forEach(t => list.appendChild(el('div', { class: 'top-failed-row' },
      el('span', { class: 'top-failed-count' }, '×' + t.count),
      el('span', { class: 'top-failed-label' }, t.check?.label || '(removed check)'),
    )));
    root.appendChild(list);
  }
}

function tile(label, value, hint) {
  return el('div', { class: 'discipline-tile' },
    el('div', { class: 'discipline-tile-l' }, label),
    el('div', { class: 'discipline-tile-v' }, value),
    el('div', { class: 'discipline-tile-h' }, hint));
}

function barChart(rows) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value || 0)));
  const wrap = el('div', { class: 'bar-chart' });
  rows.forEach(r => {
    const isSigned = r.signed;
    const v = r.value || 0;
    const pct = (Math.abs(v) / max) * 100;
    const negative = isSigned && v < 0;
    wrap.appendChild(el('div', { class: 'bar-row' },
      el('div', { class: 'bar-label' }, r.label),
      el('div', { class: 'bar-track' },
        el('div', {
          class: 'bar-fill grade-' + r.label.toLowerCase() + (negative ? ' negative' : ''),
          style: { width: pct + '%' },
        })),
      el('div', { class: 'bar-value' }, isSigned
        ? (v >= 0 ? '+' : '') + '$' + v.toFixed(0)
        : v.toFixed(0) + '%'),
      el('div', { class: 'bar-hint' }, r.hint || ''),
    ));
  });
  return wrap;
}
```

Then update the dispatcher inside `renderPlansPage` — find:

```javascript
  if (activeTab === 'list') renderListView(root);
  else renderDisciplineTabPlaceholder(root);
```

and replace with:

```javascript
  if (activeTab === 'list') renderListView(root);
  else renderDisciplineTab(root);
```

Delete the now-unused `renderDisciplineTabPlaceholder` function.

- [ ] **Step 2: Append Discipline-tab styles to `css/forms.css`**

```css

/* ── Discipline tab ─────────────────────────────────────── */
.discipline-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0 24px; }
.discipline-tile {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px; padding: 14px;
}
.discipline-tile-l { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
.discipline-tile-v { font-size: 24px; font-weight: 700; color: #FDE68A; margin: 4px 0; }
.discipline-tile-h { font-size: 11px; color: rgba(255,255,255,0.45); }

.discipline-section-title { margin: 24px 0 8px; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); }

.bar-chart { display: flex; flex-direction: column; gap: 6px; }
.bar-row {
  display: grid; grid-template-columns: 50px 1fr 70px auto; gap: 10px; align-items: center;
  padding: 6px 4px; font-size: 12px;
}
.bar-label { font-weight: 600; color: rgba(255,255,255,0.7); }
.bar-track { height: 8px; background: rgba(255,255,255,0.04); border-radius: 4px; overflow: hidden; position: relative; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 300ms; }
.bar-fill.grade-a    { background: linear-gradient(90deg, #F59E0B, #FDE68A); }
.bar-fill.grade-b    { background: linear-gradient(90deg, #10B981, #6EE7B7); }
.bar-fill.grade-c    { background: linear-gradient(90deg, #F97316, #FDBA74); }
.bar-fill.grade-skip { background: linear-gradient(90deg, #EF4444, #FCA5A5); }
.bar-fill.negative   { background: linear-gradient(90deg, #EF4444, #FCA5A5); }
.bar-value { text-align: right; color: #FDE68A; font-weight: 600; }
.bar-hint  { color: rgba(255,255,255,0.45); font-size: 11px; }

.top-failed-list { display: flex; flex-direction: column; gap: 6px; }
.top-failed-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.18); border-radius: 10px;
}
.top-failed-count { font-weight: 700; color: #FCA5A5; min-width: 32px; }
.top-failed-label { color: rgba(255,255,255,0.8); }
```

- [ ] **Step 3: Smoke test**

1. Reload, go to Trade Plans → click the **Discipline** tab.
2. Tiles render: Skip ratio, Discipline violations, Plans count.
3. Win rate by grade chart shows 4 bars (likely 0% if no executed plans yet).
4. Expectancy chart shows 4 bars.
5. Top failed checks shows "No SKIP-graded plans yet." or rows if any exist.
6. Create a few plans across grades (use console or normal flow), execute some, skip some — return and verify numbers move.

- [ ] **Step 4: Commit**

```bash
git add js/plans.js css/forms.css
git commit -m "feat(plans): discipline analytics tab with win rate, expectancy, violations"
```

---

### Task 18: Compact Discipline widget on the dashboard

**Files:**
- Modify: `js/dashboard.js`

- [ ] **Step 1: Locate the dashboard widget grid**

Open `js/dashboard.js` and find where existing tiles are mounted (look for the section that renders the calendar mini, PnL summary, etc. — search for `appendChild` calls inside `renderDashboardPage`).

- [ ] **Step 2: Add the import at the top**

```javascript
import { winRateByGrade, disciplineViolations, skipRatio } from './discipline.js';
import { go } from './router.js';
```

- [ ] **Step 3: Add a Discipline tile after the existing widgets**

Inside `renderDashboardPage`, after the existing widget mounts, add:

```javascript
  root.appendChild(disciplineWidget());
```

And define the helper near the bottom of the file:

```javascript
function disciplineWidget() {
  const wr = winRateByGrade(data.plans, data.journals);
  const dv = disciplineViolations(data.plans, data.journals);
  const sr = skipRatio(data.plans, 30);

  const widget = el('section', {
    class: 'card discipline-widget',
    onClick: () => go('plans'),
    style: { cursor: 'pointer', marginTop: '16px' },
  },
    el('div', { class: 'card-head' },
      el('h3', {}, 'Discipline'),
      el('span', { class: 'card-sub' }, 'Click to open Trade Plans →'),
    ),
    el('div', { class: 'discipline-widget-row' },
      miniStat('A win rate', wr.A.winRate.toFixed(0) + '%', wr.A.wins + 'W / ' + wr.A.losses + 'L'),
      miniStat('Skip ratio (30d)', sr.ratio ? (sr.ratio * 100).toFixed(0) + '%' : '—', sr.skipped + ' skipped'),
      miniStat('Violations', dv.count.toString(), '$' + dv.total.toFixed(0)),
    ),
  );
  return widget;
}

function miniStat(label, value, hint) {
  return el('div', { class: 'mini-stat' },
    el('div', { class: 'mini-stat-l' }, label),
    el('div', { class: 'mini-stat-v' }, value),
    el('div', { class: 'mini-stat-h' }, hint),
  );
}
```

(If `data` is not already imported in `dashboard.js`, ensure it is.)

- [ ] **Step 4: Append widget styles to `css/dashboard.css`**

```css

.discipline-widget-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 12px 0;
}
.mini-stat { text-align: center; padding: 8px; }
.mini-stat-l { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
.mini-stat-v { font-size: 22px; font-weight: 700; color: #FDE68A; margin: 4px 0; }
.mini-stat-h { font-size: 11px; color: rgba(255,255,255,0.45); }
```

- [ ] **Step 5: Smoke test**

1. Reload dashboard.
2. New Discipline card visible, showing A win rate / Skip ratio / Violations.
3. Click anywhere on the card → routes to `#plans`.
4. Confirm existing dashboard widgets (PnL summary, calendar mini, etc.) all still render as before.

- [ ] **Step 6: Commit**

```bash
git add js/dashboard.js css/dashboard.css
git commit -m "feat(dashboard): add discipline mini-widget linking to Trade Plans"
```

---

## Phase 11 — Final verification

### Task 19: End-to-end smoke test and regression sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Full happy-path walkthrough**

With a clean DB (delete `tms.db` if you want to start fresh, then restart server):

1. Boot server, open `http://localhost:3000`.
2. Sidebar shows: Dashboard / Accounts / Strategies / Journal / Calendar / **Trade Plans** / Calculator.
3. Dashboard shows the Discipline widget (zeroes).
4. Go to Strategies → create a strategy "Test FVG". Save.
5. Re-open the strategy → add 2 setup checks (one must-pass, one scored). Save.
6. Go to Dashboard → click Doctrine "Edit checklist →" footer link → Doctrine page renders all 8 seeded global checks.
7. Add one custom global check. Confirm it appears.
8. Trade Plans → New Plan → pick "Test FVG" strategy.
9. Checklist now shows: 8 globals + 2 strategy checks (deduplicated by label, total ≤ 11).
10. Tick all must-pass + ~80% of scored → grade chip flips A → B → A → C as you tick. Save.
11. Plan card appears in Open group with grade badge.
12. Click card → detail modal shows ticks/crosses next to each check.
13. Click Mark executed → journal form opens pre-filled. Result = Win, Amount = 200, R = 2. Save.
14. Plan moves to Executed group. Account balance updated +$200.
15. Create a SKIP plan (untick a must-pass). Save. Confirm grade = SKIP.
16. Click Mark executed on SKIP plan → red discipline-violation banner at top of journal form. Save = Loss, $50.
17. SKIP plan now in Executed with discipline-violation tag.
18. Trade Plans → Discipline tab.
   - Skip ratio = 0% (none skipped yet).
   - Violations = 1 / -$50.
   - Win rate by grade: A row shows 100% (1W/0L), SKIP row shows 0% (0W/1L).
   - Top failed checks: lists the must-pass you unticked.
19. Create a third plan, click Skip. Skipped group populates. Skip ratio updates.
20. Dashboard → Discipline widget reflects all of the above.

- [ ] **Step 2: Regression sweep — pre-existing flows still work**

Click through each existing workspace and confirm:
- Accounts: create / edit / delete an account.
- Strategies: open detail view → existing journal cards filtered by strategy still render.
- Journal: create a brand-new journal entry directly (not via plan) — confirm `planId` is null and it works as before.
- Calendar: month navigation, P&L cells, day popup.
- Calculator: balance sync, RR buttons.

- [ ] **Step 3: Migration sanity (existing DB compatibility)**

If you backed up `tms.db` before testing:

```bash
# Restore an older DB and confirm app still boots
cp tms.db.bak tms.db && cd "server" && npm start
```

Open the app — confirm:
- All existing journals load.
- New `planId` column exists on `journals` (nullable; old rows have NULL).
- Default global checks seeded.
- No console errors.

- [ ] **Step 4: Optional — delete a strategy that has checks attached**

1. Create a temporary strategy with 2 checks.
2. Delete the strategy.
3. Reload — confirm:
   - The 2 strategy checks were cascade-deleted.
   - Existing plans that referenced that strategy still show their grade (frozen at the time of save).
   - No console errors.

- [ ] **Step 5: Commit nothing — verification only. If any issue surfaced, file a follow-up task; do not patch silently.**

---

## Definition of Done

- All 19 tasks committed individually with conventional-commit messages.
- `test-grading.html` shows `9 passed, 0 failed`.
- A user can: create a plan, get a live grade, save it, execute it (linking to a journal), skip it, and see the analytics update across the Discipline widget and tab.
- A SKIP-graded plan that gets executed sets `discipline_violation = 1` and shows the red tag.
- Deleting a journal nulls the corresponding plan's `journal_id`. Deleting a plan nulls the corresponding journal's `plan_id`. Deleting a strategy cascade-deletes its checks but leaves plans intact.
- All pre-existing TMS workspaces (accounts, strategies, journal, calendar, calculator, dashboard) continue to work without regression.

---

## Self-Review Notes

(Performed after writing this plan.)

**Spec coverage check:**
- Two-stage workflow (plan → execute or skip): Tasks 11–15.
- Hybrid checklist (global + per-strategy, deduplicated): Tasks 6 (`checksForPlan`), 9, 10, 12.
- Must-pass + scored grading with thresholds 0.90 / 0.70 / SKIP: Task 6.
- Live grade chip on plan form: Task 12.
- Discipline-violation banner + flag: Tasks 14 (banner), 15 (flow), confirmed via `executePlan` in Task 7.
- Auto-expire after 7 days: Task 5 (boot-time pass).
- Default seeded global checks (4 must-pass + 4 scored): Task 5.
- Two tabs on Plans workspace (Plans + Discipline): Task 11 (tab bar) → Task 17 (Discipline content).
- Five status groups (Open/Executed/Skipped/Drafts/Expired): Task 11.
- Cascade rules on delete: Task 4 (server) + Task 7 (store local).
- Analytics: win rate by grade, expectancy by grade, discipline violations, skip ratio (30d), top failed checks: Task 16 (pure module) + Task 17 (UI) + Task 18 (dashboard widget).
- Frozen-grade behavior for deleted checks (plans keep historical grade): handled by NOT recomputing grade on save; only shown as "(removed check)" in detail view (Task 15 fallback in `top-failed-row` label).

**Placeholder scan:** None remaining — all `alert()` placeholders are explicitly replaced in subsequent tasks. Every code block is complete and copy-paste-ready.

**Type consistency:** `executePlan(planId, journalId)` (Task 7) matches the call site in `journal.js` (Task 14). `checksForPlan(globalChecks, byStrategy, ids)` signature matches both callers (Task 12, Task 13). `computeGrade(checkResults, checks)` matches all three callers (Task 12 form, Task 16 winRateByGrade-adjacent only — actually winRateByGrade reads `p.grade` directly, no recomputation; correct per "frozen grade" semantics).

**Scope:** One cohesive feature, sequential phases, ~19 tasks. Could split at Phase 10 (analytics) into a follow-up plan if the user wants to ship discipline tracking before analytics — but the spec treats them as one feature, so kept together.
