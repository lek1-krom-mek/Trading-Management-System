# Pre-Trade Checklist & Setup Grading — Design Spec

**Date:** 2026-05-02
**Project:** Trading Management System
**Status:** Approved for implementation planning

---

## Goal

Add a pre-trade discipline gate to TMS. Before placing a trade, the user creates a **Trade Plan** that requires them to tick a checklist of conditions. The plan receives an automatic letter grade (A / B / C / SKIP) based on which checks pass. Plans link to Journal entries on execution. The system surfaces analytics that answer the central question: *does setup grade actually correlate with outcomes for this trader?*

The win-rate hypothesis: if the user only takes A-grade setups and skips C-grades, their win rate and expectancy improve measurably. The data either proves or disproves it; either way, behavior is observable.

---

## Concept

A **Trade Plan** is a first-class record separate from a Journal entry. It represents *intent to trade*, captured before entry. Once the trade is taken, the plan is marked `executed` and a Journal entry is created and linked back. Skipped plans (passed setups) are kept — they are half the analytical value.

Two-stage workflow:

```
[Idea]  →  Create Trade Plan  →  Tick checklist  →  Grade computed
            │                                            │
            ├── Skip → status: skipped                   │
            │                                            │
            └── Execute → opens Journal form pre-filled, links journal_id
                          → status: executed
```

---

## Data Model

### New table: `trade_plans`

```sql
CREATE TABLE trade_plans (
  id              TEXT PRIMARY KEY,
  strategy_ids    TEXT,                 -- JSON array, multi-strategy
  account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  instrument      TEXT,
  timeframe       TEXT,
  direction       TEXT,                 -- 'long' | 'short'
  planned_entry   REAL,
  planned_sl      REAL,
  planned_tp      REAL,
  planned_rr      REAL,                 -- auto-computed from entry/sl/tp
  risk_pct        REAL,                 -- intended account risk %
  check_results   TEXT,                 -- JSON: { "<checkId>": true | false }
  grade           TEXT,                 -- 'A' | 'B' | 'C' | 'SKIP'
  status          TEXT,                 -- 'draft' | 'planned' | 'executed' | 'skipped' | 'expired'
  journal_id      TEXT REFERENCES journals(id) ON DELETE SET NULL,
  premortem       TEXT,                 -- free-text "what could go wrong"
  screenshot_path TEXT,
  discipline_violation INTEGER DEFAULT 0,  -- 1 if executed despite SKIP grade
  created_at      INTEGER,
  updated_at      INTEGER,
  executed_at     INTEGER
);
```

### New table: `checks`

```sql
CREATE TABLE checks (
  id           TEXT PRIMARY KEY,
  scope        TEXT,                       -- 'global' | 'strategy'
  strategy_id  TEXT REFERENCES strategies(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  description  TEXT,                       -- tooltip / hover hint
  must_pass    INTEGER DEFAULT 0,          -- 0 | 1
  position     INTEGER DEFAULT 0,          -- ordering within scope
  created_at   INTEGER,
  updated_at   INTEGER
);
```

### Journals migration

Add one column:

```sql
ALTER TABLE journals ADD COLUMN plan_id TEXT REFERENCES trade_plans(id) ON DELETE SET NULL;
```

Migration runs at server boot, matching the pattern already used for `starting_capital` and `strategy_ids` backfills.

### Why two tables, not extending journals

- Skipped plans must persist without a journal — they're a critical analytical signal.
- Legacy journals (no plan recorded) keep working unchanged.
- Schemas are conceptually different: plans are forward-looking intent; journals are backward-looking outcomes.
- Joins on `plan_id` reconnect them when both exist.

---

## UX Flow

### Sidebar

New item: **Trade Plans** (icon: clipboard-check). Sits between Strategies and Journal.

### Trade Plans workspace

Two top-level tabs:

1. **Plans** — grouped list view (default).
2. **Discipline** — analytics view (see Analytics Surface below).

Plans list groupings:

- **Open** — `status='planned'`, no `journal_id`. Active candidates.
- **Executed** — `status='executed'`. Linked to a journal. Includes plans that were SKIP-graded but executed anyway (flagged via `discipline_violation`).
- **Skipped** — `status='skipped'`. Passed setups (any grade).
- **Drafts** — `status='draft'`. Incomplete forms.
- **Expired** — `status='expired'`. Auto-flipped from `planned` after 7 days of inactivity.

Each card: instrument · direction · grade chip (A/B/C/SKIP, color-coded) · strategy chips · planned R · created-at relative time.

### Create Plan flow

1. Click **New Plan** → slide-in form (reuses `openFormPanel` from `forms.js`).
2. Multi-strategy chip selector (reuses `multiChips`).
3. Account (defaults to the active account from `localStorage`, matching the existing journal pattern), instrument, timeframe, direction (toggle group).
4. Numeric inputs: planned entry, SL, TP. `planned_rr` auto-computes as `|entry - tp| / |entry - sl|` and renders read-only.
5. Risk %.
6. **Checklist section** renders below — global checks first, then per-strategy sections (one per selected strategy). De-duplicated by case-insensitive label across all sources.
7. Live grade chip updates above the checklist as boxes are ticked.
8. Optional pre-mortem textarea: "What could invalidate this trade?"
9. Optional screenshot (reuses `imageUpload`).
10. Save buttons: **Save as draft** (status='draft', grade not finalized) or **Save plan** (status='planned', grade locked).

### Execute flow

From plan card or detail view: button **"Mark executed → log result"**.

- Opens existing `openJournalForm` with `defaults = { strategyIds, accountId, instrument, timeframe, direction, screenshotPath }` pre-filled from the plan.
- Form receives a hidden `planId` reference.
- On journal save:
  - Set `journals.plan_id = <planId>`.
  - Set `trade_plans.journal_id = <journalId>`, `status = 'executed'`, `executed_at = now`.
  - If plan grade was `SKIP`, set `discipline_violation = 1`.
- Existing journal balance/PnL reconciliation logic remains unchanged.

### Skip flow

Button **"Skip this setup"** on plan → confirmation toast → `status='skipped'`. No journal created. Counts toward Skip Ratio analytics.

### Discipline-violation banner

When the user clicks "Mark executed" on a SKIP-graded plan, the journal form shows a red banner:

> *This plan failed must-pass checks. Logging it anyway will be recorded as a discipline violation.*

User can still proceed. The violation flag drives the Discipline analytics tile.

---

## Checklist Editor

Two surfaces, same row component.

### Global checks — Doctrine page

New route: `#doctrine/checklist`. Reachable from the existing Doctrine footer on the dashboard.

```
[+] Add global check

  ☑ must-pass    Risk on this trade is ≤ 1% of account     [edit] [×]
  ☑ must-pass    No high-impact news within 30 minutes     [edit] [×]
  ☑ must-pass    Not currently revenge-trading             [edit] [×]
  ☐ must-pass    In London or NY session                   [edit] [×]
```

Drag-to-reorder updates `position`. Each check stores `label`, optional `description` (hover tooltip), `must_pass` toggle.

### Per-strategy checks — Strategy form

New section in the existing strategy slide-in form, below "Notes":

```
Setup checklist
[+] Add check

  ☑ must-pass    Price tagged daily FVG before entry
  ☐ must-pass    H4 trend agrees with direction
  ☐ must-pass    RR ≥ preferred (2.0)
```

Stored with `scope='strategy', strategy_id=<this id>`.

### De-duplication on plan form

When a plan selects multiple strategies, all their per-strategy checks are unioned. Duplicates by case-insensitive label collapse to one row. Global checks always render first, regardless.

### Shipped defaults (seeded on first run if `checks` table is empty)

**Global must-pass:**
- Risk on this trade is ≤ 1% of account
- No high-impact news within 30 minutes of entry
- Not revenge-trading or tilted
- Plan written *before* clicking buy/sell (not after)

**Global scored:**
- In a high-quality session (London/NY for FX, US open for indices)
- Daily loss limit not breached
- RR ≥ 2.0
- Setup screenshot captured

**Per-strategy:** none — user fills as they design strategies.

---

## Grading Rules

Pure function in new module `js/grading.js`:

```javascript
// Pseudocode
function computeGrade(checkResults, checks) {
  const ticked = id => checkResults[id] === true;
  const mustPass = checks.filter(c => c.mustPass);
  const scored   = checks.filter(c => !c.mustPass);

  // 1. Any must-pass unticked → SKIP
  if (mustPass.some(c => !ticked(c.id))) return 'SKIP';

  // 2. No scored checks → all must-pass passed → A
  if (scored.length === 0) return 'A';

  // 3. Threshold on scored ratio
  const ratio = scored.filter(c => ticked(c.id)).length / scored.length;
  if (ratio >= 0.90) return 'A';
  if (ratio >= 0.70) return 'B';
  return 'C';
}
```

Grade chip on the plan form re-renders on every checkbox change.

---

## Analytics Surface

### Dashboard widget: "Discipline"

Compact tile near the existing PnL/calendar widgets. Shows:

- **Win rate by grade** — bar chart: A / B / C win % side-by-side. Computed only over `executed` plans whose linked journal has `result IN ('win', 'loss')` (breakeven excluded from win-rate denominator).
- **Discipline violations** — count + total PnL of `executed` plans with `discipline_violation=1`.
- **Skip ratio (30d)** — `skipped / (skipped + executed)` over last 30 days.

Click-through opens the full Discipline tab on the Trade Plans workspace.

### Trade Plans → Discipline tab

Full breakdown:

- Win rate by grade (bars).
- **Expectancy ($/trade) by grade** — sum of journal `signedDelta(result, amount)` divided by count of executed plans, per grade.
- Discipline violations: list view of every `discipline_violation=1` plan with its journal PnL.
- **Top failed checks** — across all plans where `grade='SKIP'` (regardless of `status`), count which must-pass checks were unticked. Surface the top 3. This isolates the user's most frequent discipline leak.

All charts use the existing native `<canvas>` pattern (see `utils.js` `sparkline`). No chart library added.

---

## Integration & Error Handling

### Server (`server/server.js`)

- Add `trade_plans` and `checks` to the `MAPPERS` table with `toDb` / `fromDb` for snake_case ↔ camelCase and JSON encoding of `strategy_ids` and `check_results`.
- Auto-migration adds `plan_id` to `journals` and creates the new tables.
- `DELETE /api/trade_plans/:id`:
  - If `journal_id` is set, null out `journals.plan_id` for that row (do **not** delete the journal).
  - Delete the plan row.
  - Unlink its screenshot file if local.
- `DELETE /api/journals/:id` (existing endpoint): also null out `trade_plans.journal_id` for any row referencing this journal.
- `DELETE /api/strategies/:id`: cascades `checks` rows where `strategy_id` matches (via `ON DELETE CASCADE`). Plans referencing the strategy keep their `strategy_ids` JSON array unchanged (analytics will show the strategy id as "(deleted)").

### Frontend modules

| New module | Purpose |
|-----------|---------|
| `js/plans.js` | Trade Plans workspace, plan form, plan detail |
| `js/checklist.js` | Reusable checklist editor (Doctrine + Strategy form) |
| `js/grading.js` | Pure `computeGrade()` |
| `js/discipline.js` | Analytics widget + Discipline tab rendering |

### Modified modules

| Module | Change |
|--------|--------|
| `js/store.js` | Add `data.plans`, `data.checks`. New writers: `savePlan`, `deletePlan`, `executePlan`, `saveCheck`, `deleteCheck`. Helper: `checksForPlan(plan)` returning the union resolved & deduped. |
| `js/main.js` | Register `#plans`, `#plans/:id`, `#doctrine/checklist` routes. Add sidebar entry. |
| `js/dashboard.js` | Mount Discipline widget. |
| `js/journal.js` | Accept `defaults.planId`; on save, write back-link to plan; show discipline-violation banner when relevant. |
| `js/strategies.js` | Embed checklist editor in the strategy form. |
| `index.html` | Add `<section data-page="plans">`, `<section data-page="doctrine-checklist">`. |

### Error handling

- Optimistic save fails → toast + reload from server (matches existing store pattern).
- Plan execute action: if the journal save fails, plan stays in `planned` status with no `journal_id`. Toast surfaces the error. User can retry.
- Check deletion when historical plans reference its id: keep the entry in the plan's `check_results` JSON. Plan detail view renders the row as "(removed check)" rather than breaking. The plan's grade is **not** recomputed retroactively — the original grade is the historical record.
- All inputs validated at form submit (parse numerics, fall back to 0; trim strings; reject empty labels).

### Auto-expire

Server boot scans `trade_plans WHERE status='planned' AND created_at < now - 7 days` and flips them to `expired`. Cheap one-time pass per restart; runs on the same migration hook.

---

## Testing

The project has no existing test runner. Adding one is out of scope for v1.

**Approach:**

- `js/grading.js` is pure — `computeGrade()` is testable in isolation. Add a small `test-grading.html` page that runs a fixed table of cases (all-pass → A, missing must-pass → SKIP, 80% scored → B, etc.) and renders pass/fail in the page. Link it from a hidden footer in dev mode.
- Manual smoke test path documented in the implementation plan: seed defaults → create strategy with checks → create plan → tick boxes → verify live grade → execute → confirm journal linked with `plan_id` → mark another plan as skip → verify Discipline widget updates.
- Verify auto-migration: delete `tms.db`, restart server, confirm new tables and `journals.plan_id` column exist; restart again, confirm idempotent.

---

## Out of Scope (v1)

- Real-time news feed integration (the "no high-impact news" check is self-attested).
- Position-size calculator embedded in the plan form (the existing Calculator workspace handles this; user references it manually).
- Plan templates / cloning.
- Plan sharing / export.
- Mobile-specific layouts beyond what the existing responsive design already provides.
- Notifications / alerts on expired plans.

---

## Success Criteria

- Plans can be created, graded live, executed, skipped, and deleted without console errors.
- A skipped plan persists and counts in analytics.
- An executed plan links bidirectionally to a journal entry. Deleting either side nulls the link without deleting the other.
- Win rate by grade renders with at least one bar after 5+ executed plans across grades.
- Discipline violation count increments when a SKIP plan is executed.
- All existing journal / strategy / dashboard / calendar flows continue to work unchanged.
