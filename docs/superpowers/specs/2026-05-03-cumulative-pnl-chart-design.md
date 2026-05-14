# Cumulative PnL Chart — Design Spec

**Date:** 2026-05-03
**Status:** Approved
**Approach:** Pure SVG (no dependencies)

---

## Overview

A cumulative dollar PnL chart that visualizes trading performance over time. Appears as a compact widget on the dashboard and expands to a full-screen overlay on click. Aggregates journal entries across all accounts by default, with optional account/strategy filters.

---

## Decisions

| Decision | Choice |
|----------|--------|
| Metric | Dollar PnL (not R-multiples) |
| Scope | All accounts aggregated in one line |
| Placement | Dashboard compact + full-screen expand overlay |
| Time ranges | 7D / 30D / 90D / YTD / All (default: All) |
| Filters | Optional account and strategy dropdowns |
| Chart style | Dual-tone area chart (green above $0, red below) |
| Interaction | Gold crosshair tooltip on hover (value + date) |
| Stats row | Current PnL, ATH, max DD, trades, win rate, avg win, avg loss, profit factor |
| Rendering | Pure SVG via `el()` helper |
| Dependencies | None — extends existing patterns |

---

## Files

### New files

| File | Purpose |
|------|---------|
| `js/pnl-chart.js` | Chart component: data computation, SVG rendering, interaction |
| `css/pnl-chart.css` | Chart card, overlay, stats strip, tooltip, responsive styles |

### Modified files

| File | Change |
|------|--------|
| `index.html` | Link `css/pnl-chart.css` stylesheet |
| `js/dashboard.js` | Import and render compact chart in `renderDashboardPage()` |

---

## Data Flow

### Input

Journal entries from `data.journals` (via `store.js`). Each entry provides:

- `entryDate` (integer, unix ms) — X-axis position
- `result` ('win' \| 'loss' \| 'be') — determines sign of delta
- `amount` (number, always positive) — dollar magnitude
- `accountId` (string) — for account filtering
- `strategyIds` (array of strings) — for strategy filtering

### Computation pipeline

```
data.journals
  → filter by account/strategy (if selected)
  → filter by time range
  → sort by entryDate ASC
  → accumulate signed PnL per entry
  → produce { points[], stats{} }
```

#### Point structure

```js
{ date: 1714500000000, cumPnl: 542.0, delta: 120.0, result: 'win' }
```

#### Stats structure

```js
{
  currentPnl: 780.0,
  ath: 812.0,
  maxDd: -245.0,
  totalTrades: 42,
  winRate: 64.3,
  avgWin: 85.5,
  avgLoss: -52.3,
  profitFactor: 1.82
}
```

#### Accumulation logic

```
for each journal (sorted by entryDate ASC):
  if result === 'win':  cumPnl += amount
  if result === 'loss': cumPnl -= amount
  if result === 'be':   cumPnl += 0
  track running max (ATH)
  track max drawdown (cumPnl - runningMax)
  accumulate win/loss counts and totals for stats
```

---

## Rendering

### Compact widget (dashboard)

Inserted in `renderDashboardPage()` after the strategy grid section, before the journal history section.

```
┌─────────────────────────────────────────────────────┐
│ Cumulative PnL                          [⤢ Expand]  │
│                                                      │
│ +$780  │  ATH +$812  │  Max DD -$245  │  42 trades  │
│ 64% WR │  Avg W $86  │  Avg L -$52   │  PF 1.82    │
│                                                      │
│  [7D] [30D] [90D] [YTD] [All]                       │
│  Account: [All ▾]   Strategy: [All ▾]               │
│                                                      │
│  $800 ┤                                              │
│  $400 ┤            ╱──╲    ╱──────                   │
│    $0 ┤───╲──╱────╱    ╲──╱                          │
│ -$200 ┤    ╲╱                                        │
│        Jan     Feb     Mar     Apr                   │
│                    ┊                                 │
│               +$542 · Mar 15  (crosshair on hover)   │
└─────────────────────────────────────────────────────┘
```

- Card: `section.card.pnl-chart-card`
- Chart SVG height: 280px, responsive width via `viewBox`
- Stats: two rows of 4 `mini-stat` items each

### Full-screen overlay

Triggered by the expand button. Fixed-position overlay covering the entire viewport.

```
┌──────────────────────────────────────────────────────────┐
│ Cumulative PnL                                    [✕]    │
│                                                          │
│ +$780  │  ATH +$812  │  Max DD -$245  │  42 trades      │
│ 64% WR │  Avg W $86  │  Avg L -$52   │  PF 1.82        │
│                                                          │
│  [7D] [30D] [90D] [YTD] [All]                           │
│  Account: [All ▾]   Strategy: [All ▾]                   │
│                                                          │
│  (chart at ~500px height, more Y-axis labels,            │
│   wider X-axis date spacing, same interaction)           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Overlay: `div.pnl-chart-overlay` with `position: fixed; inset: 0; z-index: 1000`
- Background: `rgba(7, 9, 15, 0.95)` (near-opaque page background)
- Close: button top-right, also closes on Escape key
- Chart SVG height: 500px

### SVG structure

```
<svg viewBox="0 0 {width} {height}">
  <!-- Horizontal grid lines (4-5 lines, labeled with $ values) -->
  <!-- Zero line (dashed, slightly brighter) -->

  <!-- clipPath for green area (above $0) -->
  <!-- clipPath for red area (below $0) -->

  <!-- Area fill path (clipped green above, red below) -->
  <!-- Line path (same clipping for dual-tone) -->

  <!-- X-axis date labels -->
  <!-- Y-axis dollar labels -->
</svg>

<!-- Tooltip div (positioned absolutely, shown on hover) -->
<!-- Crosshair line (vertical dashed gold, positioned on hover) -->
```

### Crosshair tooltip interaction

1. Listen to `mousemove` on the SVG container
2. Map mouse X to the nearest data point index (binary search or linear scan)
3. Position a vertical dashed gold line at that X coordinate
4. Show a gold circle at the data point's Y coordinate
5. Display a floating tooltip div near the cursor: `+$542.00 · Mar 15, 2026`
6. On `mouseleave`, hide crosshair and tooltip
7. On touch devices: `touchstart` shows, `touchend` hides (no hover)

---

## Time Range Logic

| Button | Filter |
|--------|--------|
| 7D | `entryDate >= now - 7 days` |
| 30D | `entryDate >= now - 30 days` |
| 90D | `entryDate >= now - 90 days` |
| YTD | `entryDate >= Jan 1 of current year` |
| All | No date filter |

Default selection: **All**. Active button gets gold highlight styling consistent with existing toggle patterns.

---

## Filter Controls

Two `<select>` dropdowns placed below the time range buttons:

- **Account:** "All accounts" + list from `data.accounts` (showing `account.name`)
- **Strategy:** "All strategies" + list from `data.strategies` (showing `strategy.name`). A journal matches if any of its `strategyIds` includes the selected strategy (using the existing `journalHasStrategy()` helper).

Changing either filter recomputes the data and re-renders the chart SVG + stats. Filter state is local to the component (not URL-persisted, not stored in localStorage).

---

## Stats Row

Two rows of 4 stats each, using a pattern similar to the discipline widget's `mini-stat`:

**Row 1:**
| Stat | Format | Color |
|------|--------|-------|
| Current PnL | `+$780` or `-$120` | Green if positive, red if negative |
| All-Time High | `+$812` | Gold |
| Max Drawdown | `-$245` | Red |
| Total Trades | `42` | Default (white) |

**Row 2:**
| Stat | Format | Color |
|------|--------|-------|
| Win Rate | `64%` | Green if >= 50%, red if < 50% |
| Avg Win | `$86` | Green |
| Avg Loss | `-$52` | Red |
| Profit Factor | `1.82` | Green if >= 1.0, red if < 1.0 |

---

## Empty State

When no journal entries match the current filters/time range:

- Stats row shows all dashes (`—`)
- SVG shows only the $0 dashed line and a centered text: "No trades in this period"
- Muted opacity on the entire card

---

## Responsive Behavior

| Breakpoint | Adaptation |
|------------|------------|
| Desktop (> 860px) | Full layout as described |
| Mobile (≤ 860px) | Y-axis labels hidden, stats strip scrolls horizontally, chart height 200px, filter dropdowns stack vertically |

The expand overlay is always full-screen regardless of breakpoint.

---

## CSS Tokens

Follows existing design system from `css/base.css`:

| Element | Token |
|---------|-------|
| Card background | `rgba(255,255,255,0.04)` |
| Card border radius | `16px` |
| Card hover border | `rgba(249,168,37,0.3)` |
| Green (profit) | `#10B981` |
| Red (loss) | `#EF4444` |
| Gold (accent/crosshair) | `#F59E0B` |
| Grid lines | `rgba(255,255,255,0.05)` |
| Zero line | `rgba(255,255,255,0.15)` dashed |
| Axis labels | `rgba(255,255,255,0.25)` monospace |
| Tooltip background | `rgba(15,20,30,0.95)` |
| Tooltip border | `rgba(245,158,11,0.3)` |

---

## Integration Points

- **Dashboard render order:** KPI strip → daily cap band → account strip → strategy grid → **PnL chart** → journal history → mini calendar → discipline widget → doctrine footer
- **Store subscription:** Chart re-renders on `notify('journals')` and `notify('accounts')` events
- **No new API endpoints:** All data comes from the existing `journals` store in memory
