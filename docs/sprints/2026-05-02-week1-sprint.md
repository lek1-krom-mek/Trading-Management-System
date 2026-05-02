# Tyche Capital — Week 1 Sprint: SOP Checklist + Daily Cap Warning

> **Stack note:** Original draft of this brief was written for a Python/SQLAlchemy/FastAPI/React stack. This file is the version translated to the actual Tyche Capital Command Center stack (vanilla JS ES modules + Node/Express + `better-sqlite3`). All schema, API, and frontend conventions below match [.claude/CLAUDE.md](../../.claude/CLAUDE.md).
>
> **Read before starting:** [.claude/CLAUDE.md](../../.claude/CLAUDE.md), [server/schema.sql](../../server/schema.sql), [server/server.js](../../server/server.js), [js/grading.js](../../js/grading.js), [js/discipline.js](../../js/discipline.js).
>
> **Do not** refactor unrelated code. **Do not** add new dependencies (no SQLAlchemy, no Alembic, no Tailwind, no React, no Zustand).

## Sprint goal

Ship two features in parallel that close the two highest-priority gaps:

1. **SOP Checklist on Journal Entry** — gate every journal entry behind the 8-rule "ស្មារតីអង្គភាព" SOP and auto-grade each trade A/B/C/Off-SOP at log-time.
2. **Daily Cap Warning** — surface real-time daily P&L vs personal 3% cap and firm 5% cap on the Dashboard.

Build in two branches. Merge SOP Checklist first, Daily Cap Warning second.

---

## Existing-system overlap (read this first)

The codebase already has a *plan-time* grading system that this sprint does **not** replace:

| Concern | Existing | This sprint |
| --- | --- | --- |
| `trade_plans.grade` (A/B/C/**SKIP**) | computed pre-trade by [js/grading.js](../../js/grading.js) from must-pass + scored ratio over `checks` table | unchanged |
| `checks` table (global / per-strategy) | user-editable on Doctrine + Strategy pages via [js/checklist.js](../../js/checklist.js) | unchanged |
| `journals.grade` (A/B/C/**Off-SOP**) | does not exist | **new this sprint** — post-trade SOP audit |

**Why the two are distinct, not unified:**

- Plan grade answers "should I take this trade?" (pre-trade abort decision, A/B/C/SKIP).
- Journal grade answers "did I follow the unit doctrine on this trade?" (post-trade audit, A/B/C/Off-SOP).
- The 8 SOP rules are a **fixed doctrine constant**, not user-editable like `checks`. They live in code, not the DB.

Keep the vocabulary distinct — "SKIP" stays for plans, "Off-SOP" is new for journals. Do not rename either to match the other.

---

## Feature 1: SOP Checklist on Journal Entry

### The 8 SOP rules (fixed, not editable)

Add to a new file `js/sop-rules.js`:

```js
// 8-rule "ស្មារតីអង្គភាព" doctrine. Order and labels are canonical — do not edit
// without updating the SOP document in obsidian.
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
```

### Grading function

Add to `js/grading.js` (new export, do not modify existing `computeGrade`):

```js
/**
 * Post-trade SOP grade. Counts confirmed rules out of 8.
 *   ≥7 → A, ≥5 → B, ≥3 → C, else Off-SOP.
 * @param {Record<string, { confirmed: boolean, note?: string }>} sopChecks
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

Compute this in `server/server.js` on the journals upsert path (so the DB is the source of truth) **and** mirror it client-side for the live preview.

### Schema changes

There is no migration framework. Edit [server/schema.sql](../../server/schema.sql) directly **and** add idempotent `ALTER TABLE` statements that run on server boot (mirrors the pattern already in `server.js` for any prior column additions — if no such pattern exists, add a one-time `ensureSchema()` helper that runs once at startup using `PRAGMA table_info` to detect missing columns).

```sql
-- Append to journals table
ALTER TABLE journals ADD COLUMN sop_checks TEXT;       -- JSON: { rule_1: { confirmed, note }, ... }
ALTER TABLE journals ADD COLUMN grade TEXT;            -- 'A' | 'B' | 'C' | 'Off-SOP' | NULL
ALTER TABLE journals ADD COLUMN confluence_count INTEGER;  -- 0–8 or NULL
ALTER TABLE journals ADD COLUMN pre_grading INTEGER DEFAULT 0;  -- 1 for legacy entries
```

**Backfill behavior:** on first server boot after the migration, run a one-shot `UPDATE journals SET pre_grading = 1 WHERE sop_checks IS NULL`. Do **not** retroactively grade them. Use `created_at` predicate or check column null-ness — pick whichever is idempotent on repeated runs.

### Server-side mapper

In `server/server.js`, extend the journals `MAPPERS` (`toDb` / `fromDb`):

- `toDb`: serialize `sopChecks` → JSON string in `sop_checks` column. Compute `grade` + `confluence_count` from `sopChecks` server-side via the same algorithm as `computeJournalGrade`. Reject the request with HTTP 400 if `sopChecks` is present but does not contain all 8 rule keys (`rule_1` through `rule_8`). For legacy clients sending no `sopChecks`, accept and set `pre_grading = 1`.
- `fromDb`: parse `sop_checks` JSON to object, expose `grade`, `confluenceCount`, `preGrading` (camelCase) to clients.

### API behavior

The existing route is `PUT /api/journals` (upsert), not `POST /api/trades`. Do not introduce a new route.

- `PUT /api/journals` — accepts `sopChecks` (object with 8 keys) on the body. Server validates, computes grade, persists.
- `GET /api/journals` — response includes `grade`, `confluenceCount`, `preGrading` for every entry.
- `GET /api/journals?grade=A,B,C,Off-SOP,Pre-grading` — **add this filter param.** Comma-separated. `Pre-grading` matches `pre_grading = 1`. Implement as a parameterized `WHERE grade IN (...)` plus an `OR pre_grading = 1` if `Pre-grading` is in the list.

### Frontend changes

All edits in [js/journal.js](../../js/journal.js) unless noted. New components live in `js/sop-checklist.js`.

**1. New section in the journal entry side panel.** In `openJournalForm()`, between the existing "Strategies" field and the "Account" field, insert a new section:

- Section header (uppercase, matches existing `sectionHeader()` style): `SOP CHECKLIST`
- 8 rows — each row: checkbox on the left, rule label in the middle, optional note input on the right (`placeholder: "Optional note"`). Build via a new `sopChecklistField({ name, value })` helper in `js/sop-checklist.js` that returns a DOM node and registers a hidden `<input>` named `sopChecks` whose value is the JSON-serialized state, so `readForm()` (in `js/forms.js`) picks it up unchanged.
- Live grade preview below the 8 rows: `GRADE: <pill> · <n>/8 confirmed` — the pill uses the same DOM/CSS shape as existing result pills.

**2. `touched` state.** Each checkbox starts `touched = false`. Toggling it (in either direction) flips `touched = true`. The form submit button stays disabled and shows "Review all 8 SOP rules before saving." until all 8 are touched. (Editing an existing entry that already has `sopChecks` saved → all 8 start touched.)

**3. Pill colors.** Add CSS classes `grade-pill grade-pill--a|--b|--c|--off-sop|--pre-grading` to [css/journal.css](../../css/journal.css) (or wherever journal pill styles live). Reuse existing color tokens — do not introduce new ones:

| Grade | Color | Reuse from |
| --- | --- | --- |
| A | green | existing WIN pill |
| B | gold | existing active-account gold (`#F59E0B`) |
| C | orange | new utility tone, derive from gold by reducing saturation |
| Off-SOP | red | existing LOSS pill |
| Pre-grading | muted grey | existing `mini-chip` neutral |

**4. Journal cards.** In `journalCard()`, add the grade pill to the top-right of each card next to the existing result badge. For entries with `preGrading: true`, show "Pre-grading" pill instead.

**5. Filter bar.** Add a fifth `filterSelect` in `renderJournalPage()` for `Grade`, with options: `All grades / A / B / C / Off-SOP / Pre-grading`. Wire to `filters.grade` and apply in the existing `data.journals.filter(...)` chain. When the server-side `?grade=` filter is wired through `db.js`/`store.js`, prefer server-side filtering; otherwise filter client-side from the cache.

### Acceptance criteria

- [ ] New journal entry cannot be saved until all 8 checkboxes have been interacted with at least once
- [ ] Grade is computed server-side from `sop_checks` and persisted (verify by reading directly from `tms.db`)
- [ ] All existing journal entries display "Pre-grading" pill instead of a grade
- [ ] Grade filter on journal grid works (both All / individual grades / Pre-grading)
- [ ] Grade pill is visible on each journal card, top-right next to result badge
- [ ] Live grade preview updates immediately as checkboxes toggle, before save

### Out of scope this sprint

- Editing grades / SOP checks on existing entries (defer)
- Backfilling old entries with grades (defer)
- Per-rule analytics ("which rule do I violate most") — week-2 dashboard widget

---

## Feature 2: Daily Cap Warning on Dashboard

### Schema changes

Edit [server/schema.sql](../../server/schema.sql) and add idempotent `ALTER`s:

```sql
ALTER TABLE accounts ADD COLUMN personal_daily_cap_pct REAL DEFAULT 3.0;
ALTER TABLE accounts ADD COLUMN firm_daily_cap_pct     REAL DEFAULT 5.0;
```

The current `accounts.rules` JSON column may already store a `dailyLossCap` value — **leave it alone**. The two new columns are first-class so we can sort/query without unpacking JSON.

Backfill: `UPDATE accounts SET personal_daily_cap_pct = 3.0 WHERE personal_daily_cap_pct IS NULL`, same for `firm_daily_cap_pct = 5.0`.

`daily_pnl_today` is **not** a column. Compute it server-side in the response.

### Server-side computation

In `server/server.js`, extend the accounts `fromDb` mapper / `GET /api/accounts/:id` handler to attach a computed block. Use SQL to aggregate today's signed P&L from journals on the active account:

```sql
SELECT
  COALESCE(SUM(CASE
    WHEN result = 'win'  THEN amount
    WHEN result = 'loss' THEN -amount
    ELSE 0
  END), 0) AS daily_pnl_today
FROM journals
WHERE account_id = ?
  AND entry_date >= ?    -- start-of-day epoch ms in trader timezone
  AND entry_date <  ?;   -- start-of-tomorrow epoch ms
```

Compute `personal_cap_dollars`, `firm_cap_dollars` as percentages of `starting_capital` (fall back to `capital` if `starting_capital` is null — existing behavior). Compute `personal_cap_pct_used` and `firm_cap_pct_used` as `(-daily_pnl_today / cap_dollars) * 100`, clamped at 0 when P&L is positive.

**Timezone:** the trader is GMT+7 (Cambodia). Add a constant `TRADER_TZ_OFFSET_MINUTES = 420` at the top of `server.js` and use it to compute the day boundary. Document the constant. Frontend does not need to send timezone for this sprint; this is a single-trader app.

`cap_state` enum (server-computed):

| State | Trigger |
| --- | --- |
| `safe` | `personal_cap_pct_used < 40` |
| `caution` | `40 ≤ personal_cap_pct_used < 70` |
| `warning` | `70 ≤ personal_cap_pct_used < 90` |
| `breach_imminent` | `90 ≤ personal_cap_pct_used < 100` |
| `personal_breached` | `personal_cap_pct_used ≥ 100` and `firm_cap_pct_used < 100` |
| `firm_breached` | `firm_cap_pct_used ≥ 100` |

### API response

`GET /api/accounts/:id` adds:

```json
{
  "...existing fields...": "...",
  "personalDailyCapPct": 3.0,
  "firmDailyCapPct": 5.0,
  "dailyPnlToday": -42.50,
  "personalCapDollars": -59.55,
  "firmCapDollars": -99.25,
  "personalCapPctUsed": 71.4,
  "firmCapPctUsed": 42.8,
  "capState": "warning"
}
```

`GET /api/accounts` (list) attaches the same fields per account so the dashboard can switch active account without a second round-trip.

### Frontend changes

**1. New module** `js/daily-cap-band.js` exports `dailyCapBand(account)` which returns a DOM node or `null` (when `capState === 'safe'`).

**2. Dashboard placement.** In [js/dashboard.js](../../js/dashboard.js), insert the band's parent slot between the KPI row (Accounts / Strategies / Journal Entries / Total Profit) and the "Portfolio Accounts" section. Subscribe to store changes so the band re-renders when the active account's journals change.

**3. Layout (single full-width card).**

```
┌────────────────────────────────────────────────────────────────────┐
│  TODAY · ACTIVE ACCOUNT                                            │
│  -$42.50 of -$59.55 personal cap (71% used)                        │
│  ████████████████████░░░░░░░░  Personal 3%                         │
│  ████████████░░░░░░░░░░░░░░░░  Firm 5%                             │
│                                                                    │
│  ⚠ Approaching personal daily cap. Consider stopping for the day.  │
└────────────────────────────────────────────────────────────────────┘
```

**4. Color states.** Add CSS classes in [css/dashboard.css](../../css/dashboard.css):

- `daily-cap-band` (base)
- `daily-cap-band--caution` — soft yellow border, no fill
- `daily-cap-band--warning` — orange border, soft orange fill
- `daily-cap-band--breach-imminent` — red border, soft red fill, 2s pulse animation (subtle, accessibility-respecting via `prefers-reduced-motion`)
- `daily-cap-band--personal-breached` — red fill, copy: "Personal cap reached. SOP Rule 5: stop trading."
- `daily-cap-band--firm-breached` — red fill with double border, copy: "FIRM CAP BREACHED. Account at risk."

The band is hidden entirely when `capState === 'safe'`. Reuse existing dark-gold aesthetic — no new color tokens.

**5. Active-account selection.** The active account id lives in `localStorage` under `tms-active-account`. The band reads only the active account's data. If multiple accounts have entries today, only the active account is shown. Multi-account aggregated view is out of scope.

**6. Risk Calculator inline indicator.** On the Risk Calculator page (likely [js/calc.js](../../js/calc.js)), next to the existing "DAILY LIMIT (5%)" line, add a smaller persistent inline indicator: `Today: <pct>% of personal cap used`. Color it neutral when safe, orange at warning, red at breach. This is always visible (not hidden when safe).

### Acceptance criteria

- [ ] Daily P&L matches manual sum of today's journals on the active account
- [ ] Both personal (3%) and firm (5%) caps render as separate progress bars
- [ ] State transitions happen at correct thresholds (write tests for boundaries: 39.9 / 40.0 / 69.9 / 70.0 / 89.9 / 90.0 / 99.9 / 100.0)
- [ ] Band is hidden when `capState === 'safe'`
- [ ] Personal cap is the primary trigger; firm cap is the secondary visual
- [ ] Risk Calculator inline indicator renders correctly in all states
- [ ] When the active account is switched (via header / sidebar), band re-renders to that account
- [ ] When a new journal is logged, the band updates without a page reload (via `store.js` notify)

### Out of scope this sprint

- Multi-account aggregated daily view
- Push / browser notifications when crossing thresholds
- Historical "days approaching cap" report

---

## Build sequence

### Day 1 — Schema + backend (both features)

- Add `ALTER TABLE` migrations to `server/schema.sql` and run them idempotently on boot
- Backfill `personal_daily_cap_pct = 3.0`, `firm_daily_cap_pct = 5.0`
- Backfill `journals.pre_grading = 1` for all existing entries
- Implement `computeJournalGrade()` in `js/grading.js` (importable both client and server)
- Wire grade computation into `MAPPERS.journals.toDb` in `server.js`
- Implement `dailyPnlToday` + `capState` block on `GET /api/accounts` and `GET /api/accounts/:id`

### Day 2 — Tests

The codebase has no test framework today. Add a minimal Node test runner using **Node's built-in `node:test`** (no new deps). Place tests under `tests/`:

- `tests/grading.test.js` — `computeJournalGrade` boundaries: 0/1/2/3 → Off-SOP/Off-SOP/Off-SOP/C, 4 → C, 5/6 → B, 7/8 → A
- `tests/cap-state.test.js` — all six states across the boundaries listed in acceptance criteria
- `tests/journal-api.test.js` — integration: PUT `/api/journals` with `sopChecks` → row in `tms.db` has correct `grade` and `confluence_count`
- `tests/account-api.test.js` — seed an account + a journal at -$42 today → GET returns `capState: 'warning'`
- Edge case: account with no entries today → `dailyPnlToday: 0`, `capState: 'safe'`

Run via `npm test` script in `server/package.json` (add it).

### Day 3 — Frontend: SOP Checklist

- Build `js/sop-checklist.js` with `sopChecklistField()` and live-preview component
- Integrate into `js/journal.js` `openJournalForm()` (between Strategies and Account fields)
- Form-validation block on submit until all 8 touched
- Grade pill component in `js/journal.js` `journalCard()` and `openJournalDetail()`
- Add Grade filter to journal filter bar
- Wire `?grade=` query through `js/db.js` and `js/store.js` (or filter client-side if simpler)

### Day 4 — Frontend: Daily Cap Band

- Build `js/daily-cap-band.js`
- Two stacked progress bars (personal + firm)
- Wire color states + hide-when-safe
- Insert into dashboard layout in `js/dashboard.js`
- Subscribe to store changes for live updates
- Add inline daily-used indicator to Risk Calculator page

### Day 5 — Polish + integration

- Visual QA: dark-gold aesthetic match against existing dashboard / accounts / journal panels
- Mobile responsive check (dashboard band stays readable < 600px)
- End-to-end manual test: log a real trade with SOP checklist → verify grade displays → verify daily band updates without reload
- Edge cases: pre-grading entries, breach states, account switch

### Day 6 — Use it on a real session

- Trade the NY session with the new tooling
- Note friction (slow checklist? wrong threshold? missing affordance?)
- File issues; do not fix in-sprint unless blocking

### Day 7 — Patch friction, ship

- Address P0 issues only from Day 6
- Merge SOP Checklist branch first
- Merge Daily Cap Warning branch second
- Tag release `v0.2-week1-sprint`

---

## Constraints and conventions (Tyche stack)

- **No new dependencies.** Use `better-sqlite3`, `express`, `multer`, `cors` as already present in `server/package.json`. Tests use `node:test` (built-in).
- **No build step.** Frontend is plain ES modules, no Tailwind, no React, no JSX, no Zustand.
- **Field-name convention:** snake_case in DB, camelCase in JS, conversion in `MAPPERS` per [server/server.js](../../server/server.js).
- **Routing:** hash-based SPA. Do not add new top-level routes for this sprint — both features live inside existing `#dashboard` and `#journal` pages.
- **Data flow:** page modules read/write through `js/store.js` only. Never call `js/db.js` directly from a page module. After every write, `store.js` calls `notify()` so subscribed views re-render.
- **DOM building:** use `el()` from `js/utils.js`. No `innerHTML` with user-supplied data.
- **Immutability:** spread into new objects; never mutate `data.*` arrays.
- **File size:** keep new modules under 400 lines.
- **Comments:** no comments unless the WHY is non-obvious.
- **Times:** stored in epoch ms (UTC). "Today" boundary is computed in trader timezone (GMT+7) per the constant in `server.js`.

---

## What NOT to do

- Do not refactor unrelated code (Strategies, Calendar, Plans pages, etc.)
- Do not add a new database; SQLite stays
- Do not introduce React / Zustand / Tailwind / Alembic / SQLAlchemy / FastAPI — wrong stack
- Do not change the visual style of existing components beyond what these features require
- Do not unify `journals.grade` with `trade_plans.grade` — they are deliberately distinct
- Do not edit the 8 SOP rule labels (they are canonical doctrine)
- Do not add authentication, news feed, correlation features, backtest — later sprints

---

## Definition of done

Both features merged to `main`. The user can:

1. Create a new journal entry, complete the 8-rule SOP checklist, see the grade computed live, save the trade with grade persisted in `tms.db`
2. Filter the journal grid by grade (A / B / C / Off-SOP / Pre-grading / All)
3. See the daily cap band on the dashboard during a caution-or-worse trading day, with correct copy and color
4. See the inline daily-used indicator on the Risk Calculator at all times
5. See all existing journal entries continue to display correctly with the "Pre-grading" pill

When all five are true, the sprint is done.

---

## Final note

If you discover a blocking ambiguity during the build, **stop and ask before proceeding**. Do not make architectural decisions unilaterally — this is a personal trading tool with real money downstream of every bug.
