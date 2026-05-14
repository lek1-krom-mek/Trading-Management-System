# Cumulative PnL Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the `/ui-ux-pro-max` skill for CSS/visual work in Task 3 and Task 6.

**Goal:** Add a cumulative dollar PnL chart to the TMS dashboard — compact widget that expands to full-screen overlay, with time range presets and account/strategy filters.

**Architecture:** Pure SVG rendered via the existing `el()` helper. New module `js/pnl-chart.js` handles data computation, SVG generation, and crosshair interaction. New stylesheet `css/pnl-chart.css` for card, overlay, stats, and responsive layout. Dashboard imports and mounts the widget between the strategy grid and journal history sections.

**Tech Stack:** Vanilla JS (ES modules), SVG, CSS — no dependencies.

**Design spec:** `docs/superpowers/specs/2026-05-03-cumulative-pnl-chart-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `js/pnl-chart.js` | Create | Data computation (`computePnlData`), SVG chart builder (`buildChartSVG`), crosshair interaction, compact widget (`pnlChartSection`), full-screen overlay (`openPnlOverlay`) |
| `css/pnl-chart.css` | Create | Card layout, stats strip, time range buttons, filter row, SVG container, crosshair tooltip, overlay, responsive breakpoints |
| `index.html` | Modify | Add `<link>` for `css/pnl-chart.css` (line ~19, after `css/calendar.css`) |
| `js/dashboard.js` | Modify | Import `pnlChartSection` and insert after strategy grid section (~line 80) |

---

## Task 1: Data Computation — `computePnlData()`

**Files:**
- Create: `js/pnl-chart.js`

This task builds the data layer only. No rendering yet.

- [ ] **Step 1: Create `js/pnl-chart.js` with imports and the `computePnlData` function**

```js
import { data, journalHasStrategy } from './store.js';
import { el, fmtMoney, fmtDate, iconSVG } from './utils.js';

function computePnlData(journals, filters) {
  const { range, accountId, strategyId } = filters;

  let filtered = journals.filter(j => {
    if (accountId && accountId !== 'all' && j.accountId !== accountId) return false;
    if (strategyId && strategyId !== 'all' && !journalHasStrategy(j, strategyId)) return false;
    return true;
  });

  if (range && range !== 'all') {
    const now = Date.now();
    const cutoffs = {
      '7d':  now - 7  * 86400000,
      '30d': now - 30 * 86400000,
      '90d': now - 90 * 86400000,
      'ytd': new Date(new Date().getFullYear(), 0, 1).getTime(),
    };
    const cutoff = cutoffs[range];
    if (cutoff) filtered = filtered.filter(j => (j.entryDate || j.createdAt || 0) >= cutoff);
  }

  const sorted = [...filtered].sort((a, b) => (a.entryDate || a.createdAt || 0) - (b.entryDate || b.createdAt || 0));

  let cumPnl = 0;
  let runningMax = 0;
  let maxDd = 0;
  let winCount = 0;
  let lossCount = 0;
  let winTotal = 0;
  let lossTotal = 0;
  const points = [];

  for (const j of sorted) {
    const amt = Math.abs(parseFloat(j.amount) || 0);
    let delta = 0;
    if (j.result === 'win')  { delta = amt;  winCount++;  winTotal += amt; }
    if (j.result === 'loss') { delta = -amt; lossCount++; lossTotal += amt; }
    cumPnl += delta;
    if (cumPnl > runningMax) runningMax = cumPnl;
    const dd = cumPnl - runningMax;
    if (dd < maxDd) maxDd = dd;
    points.push({ date: j.entryDate || j.createdAt || 0, cumPnl, delta, result: j.result || 'be' });
  }

  const totalTrades = sorted.length;
  const winRate = (winCount + lossCount) > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
  const avgWin = winCount > 0 ? winTotal / winCount : 0;
  const avgLoss = lossCount > 0 ? -(lossTotal / lossCount) : 0;
  const profitFactor = lossTotal > 0 ? winTotal / lossTotal : (winTotal > 0 ? 99 : 0);

  return {
    points,
    stats: {
      currentPnl: cumPnl,
      ath: runningMax,
      maxDd,
      totalTrades,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
    },
  };
}
```

- [ ] **Step 2: Verify in browser console**

Open `http://localhost:3000`, then in the console:
```js
import('./js/pnl-chart.js')
```
Should load without errors.

- [ ] **Step 3: Commit**

```bash
git add js/pnl-chart.js
git commit -m "feat(pnl-chart): add computePnlData — cumulative PnL + stats from journals"
```

---

## Task 2: SVG Chart Rendering — `buildChartSVG()`

**Files:**
- Modify: `js/pnl-chart.js`

Adds the SVG builder that turns `computePnlData` output into a dual-tone area chart with axes.

- [ ] **Step 1: Add axis helper functions to `js/pnl-chart.js`**

Add these below `computePnlData`:

```js
function niceAxis(min, max, ticks) {
  if (min === max) { min -= 100; max += 100; }
  const range = max - min;
  const rough = range / (ticks - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = [1, 2, 5, 10].find(n => n * mag >= rough) * mag;
  const lo = Math.floor(min / nice) * nice;
  const hi = Math.ceil(max / nice) * nice;
  const vals = [];
  for (let v = lo; v <= hi + nice * 0.01; v += nice) vals.push(Math.round(v * 100) / 100);
  return vals;
}

function fmtAxisDate(ts, rangeDays) {
  const d = new Date(ts);
  if (rangeDays <= 7)  return d.toLocaleDateString(undefined, { weekday: 'short' });
  if (rangeDays <= 90) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function fmtDollar(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n < 0 ? '-' : '') + '$' + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
  return (n < 0 ? '-' : '') + '$' + abs.toFixed(0);
}
```

- [ ] **Step 2: Add `buildChartSVG` function**

```js
function buildChartSVG(points, opts = {}) {
  const W = opts.width || 600;
  const H = opts.height || 280;
  const PAD = { top: 10, right: 10, bottom: 30, left: 55 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  if (!points.length) {
    const zeroY = PAD.top + ch / 2;
    return el('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, class: 'pnl-svg' },
      el('line', { x1: PAD.left, y1: zeroY, x2: W - PAD.right, y2: zeroY, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }),
      el('text', { x: W / 2, y: zeroY - 12, fill: 'rgba(255,255,255,0.3)', 'font-size': 12, 'text-anchor': 'middle', 'font-family': 'var(--font-mono, monospace)' }, 'No trades in this period')
    );
  }

  const vals = points.map(p => p.cumPnl);
  const minV = Math.min(0, ...vals);
  const maxV = Math.max(0, ...vals);
  const yTicks = niceAxis(minV, maxV, 5);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const yRange = yMax - yMin || 1;

  const toX = (i) => PAD.left + (i / Math.max(1, points.length - 1)) * cw;
  const toY = (v) => PAD.top + (1 - (v - yMin) / yRange) * ch;
  const zeroY = toY(0);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)} ${toY(p.cumPnl).toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${toX(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L${toX(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const uid = 'pnl-' + Math.random().toString(36).slice(2, 8);

  const svg = el('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, class: 'pnl-svg', 'data-uid': uid });

  svg.innerHTML = `
    <defs>
      <linearGradient id="${uid}-gG" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#10B981" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0.02"/>
      </linearGradient>
      <linearGradient id="${uid}-gR" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#EF4444" stop-opacity="0.02"/>
        <stop offset="100%" stop-color="#EF4444" stop-opacity="0.3"/>
      </linearGradient>
      <clipPath id="${uid}-clipAbove"><rect x="${PAD.left}" y="${PAD.top}" width="${cw}" height="${Math.max(0, zeroY - PAD.top)}"/></clipPath>
      <clipPath id="${uid}-clipBelow"><rect x="${PAD.left}" y="${zeroY}" width="${cw}" height="${Math.max(0, PAD.top + ch - zeroY)}"/></clipPath>
    </defs>
  `;

  // Grid lines + Y-axis labels
  for (const v of yTicks) {
    const y = toY(v);
    const isZero = v === 0;
    svg.appendChild(el('line', {
      x1: PAD.left, y1: y, x2: W - PAD.right, y2: y,
      stroke: isZero ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
      'stroke-width': 1,
      ...(isZero ? { 'stroke-dasharray': '4 4' } : {}),
    }));
    svg.appendChild(el('text', {
      x: PAD.left - 6, y: y + 3.5, fill: 'rgba(255,255,255,0.25)',
      'font-size': 9, 'text-anchor': 'end', 'font-family': 'var(--font-mono, monospace)',
    }, fmtDollar(v)));
  }

  // Area fills (clipped above/below zero)
  const areaAbove = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaAbove.setAttribute('d', areaD);
  areaAbove.setAttribute('fill', `url(#${uid}-gG)`);
  areaAbove.setAttribute('clip-path', `url(#${uid}-clipAbove)`);
  svg.appendChild(areaAbove);

  const areaBelow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaBelow.setAttribute('d', areaD);
  areaBelow.setAttribute('fill', `url(#${uid}-gR)`);
  areaBelow.setAttribute('clip-path', `url(#${uid}-clipBelow)`);
  svg.appendChild(areaBelow);

  // Lines (clipped for dual-tone green/red)
  const lineAbove = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lineAbove.setAttribute('d', pathD);
  lineAbove.setAttribute('fill', 'none');
  lineAbove.setAttribute('stroke', '#10B981');
  lineAbove.setAttribute('stroke-width', '2.5');
  lineAbove.setAttribute('stroke-linejoin', 'round');
  lineAbove.setAttribute('stroke-linecap', 'round');
  lineAbove.setAttribute('clip-path', `url(#${uid}-clipAbove)`);
  svg.appendChild(lineAbove);

  const lineBelow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lineBelow.setAttribute('d', pathD);
  lineBelow.setAttribute('fill', 'none');
  lineBelow.setAttribute('stroke', '#EF4444');
  lineBelow.setAttribute('stroke-width', '2.5');
  lineBelow.setAttribute('stroke-linejoin', 'round');
  lineBelow.setAttribute('stroke-linecap', 'round');
  lineBelow.setAttribute('clip-path', `url(#${uid}-clipBelow)`);
  svg.appendChild(lineBelow);

  // X-axis date labels (max 6)
  const dateCount = Math.min(6, points.length);
  const rangeDays = points.length > 1 ? (points[points.length - 1].date - points[0].date) / 86400000 : 1;
  for (let i = 0; i < dateCount; i++) {
    const idx = Math.round(i / (dateCount - 1) * (points.length - 1));
    svg.appendChild(el('text', {
      x: toX(idx), y: H - 6, fill: 'rgba(255,255,255,0.2)',
      'font-size': 9, 'text-anchor': 'middle',
    }, fmtAxisDate(points[idx].date, rangeDays)));
  }

  // Store point positions for crosshair hit-testing
  svg.dataset.points = JSON.stringify(points.map((p, i) => ({ x: toX(i), y: toY(p.cumPnl), cumPnl: p.cumPnl, date: p.date })));

  return svg;
}
```

- [ ] **Step 3: Verify no syntax errors**

Open `http://localhost:3000`, console: `import('./js/pnl-chart.js')` — should load clean.

- [ ] **Step 4: Commit**

```bash
git add js/pnl-chart.js
git commit -m "feat(pnl-chart): add buildChartSVG — dual-tone area chart with axes"
```

---

## Task 3: CSS — `css/pnl-chart.css` + link in `index.html`

**Files:**
- Create: `css/pnl-chart.css`
- Modify: `index.html` (line ~19)

> **Agent note:** Use the `/ui-ux-pro-max` skill for this task to ensure premium dark-theme styling consistent with the TMS design system.

- [ ] **Step 1: Create `css/pnl-chart.css`**

```css
/* ── PnL Chart Card ──────────────────────────────────── */

.pnl-chart-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 32px;
  transition: border-color 0.2s var(--ease);
}
.pnl-chart-card:hover {
  border-color: rgba(249,168,37,0.3);
}

.pnl-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.pnl-chart-head h2 {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.pnl-expand-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 10px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s var(--ease);
}
.pnl-expand-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
}

/* ── Stats Strip ─────────────────────────────────────── */

.pnl-stats-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.pnl-stat {
  text-align: center;
  padding: 6px 4px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
}
.pnl-stat-l {
  font-size: 10px;
  color: rgba(255,255,255,0.45);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pnl-stat-v {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin: 2px 0;
  color: var(--text);
}
.pnl-stat-v.pos { color: #10B981; }
.pnl-stat-v.neg { color: #EF4444; }
.pnl-stat-v.gold { color: #F59E0B; }

/* ── Time Range Buttons ──────────────────────────────── */

.pnl-range-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.pnl-range-btn {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  cursor: pointer;
  transition: all 0.15s var(--ease);
  letter-spacing: 0.04em;
}
.pnl-range-btn:hover {
  border-color: rgba(245,158,11,0.4);
  color: var(--text);
}
.pnl-range-btn.active {
  background: rgba(245,158,11,0.12);
  border-color: rgba(245,158,11,0.5);
  color: #FDE68A;
}

/* ── Filter Row ──────────────────────────────────────── */

.pnl-filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.pnl-filter-row select {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  padding: 4px 10px;
  max-width: 180px;
}
.pnl-filter-row select:focus {
  outline: none;
  border-color: rgba(245,158,11,0.5);
}

/* ── Chart Container ─────────────────────────────────── */

.pnl-chart-wrap {
  position: relative;
  width: 100%;
}
.pnl-svg {
  display: block;
  width: 100%;
  height: auto;
}

/* ── Crosshair Tooltip ───────────────────────────────── */

.pnl-crosshair {
  position: absolute;
  top: 0;
  width: 1px;
  border-left: 1px dashed rgba(245,158,11,0.5);
  pointer-events: none;
  display: none;
}
.pnl-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 2px solid #F59E0B;
  border-radius: 50%;
  background: rgba(7,9,15,0.9);
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: none;
}
.pnl-tooltip {
  position: absolute;
  background: rgba(15,20,30,0.95);
  border: 1px solid rgba(245,158,11,0.3);
  border-radius: 8px;
  padding: 6px 12px;
  pointer-events: none;
  display: none;
  white-space: nowrap;
  z-index: 10;
}
.pnl-tooltip-val {
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: #F59E0B;
}
.pnl-tooltip-date {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  font-family: var(--font-mono, monospace);
  margin-top: 1px;
}

/* ── Full-Screen Overlay ─────────────────────────────── */

.pnl-chart-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(7,9,15,0.95);
  display: flex;
  flex-direction: column;
  padding: 32px;
  overflow-y: auto;
}
.pnl-overlay-close {
  position: absolute;
  top: 20px;
  right: 24px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  padding: 6px 12px;
  font-size: 13px;
  transition: all 0.2s var(--ease);
}
.pnl-overlay-close:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.pnl-overlay-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 16px;
}

/* ── Empty State ─────────────────────────────────────── */

.pnl-chart-card.empty {
  opacity: 0.6;
}

/* ── Responsive ──────────────────────────────────────── */

@media (max-width: 860px) {
  .pnl-stats-strip {
    display: flex;
    overflow-x: auto;
    gap: 10px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .pnl-stats-strip::-webkit-scrollbar { display: none; }
  .pnl-stat {
    flex: 0 0 auto;
    min-width: 90px;
  }
  .pnl-filter-row {
    flex-direction: column;
  }
  .pnl-filter-row select {
    max-width: 100%;
  }
  .pnl-chart-overlay {
    padding: 16px;
  }
}
```

- [ ] **Step 2: Add stylesheet link to `index.html`**

In `index.html`, after `<link rel="stylesheet" href="css/calendar.css">` (line 18), add:

```html
<link rel="stylesheet" href="css/pnl-chart.css">
```

- [ ] **Step 3: Verify CSS loads**

Open `http://localhost:3000` — no 404 errors in Network tab for `pnl-chart.css`.

- [ ] **Step 4: Commit**

```bash
git add css/pnl-chart.css index.html
git commit -m "style(pnl-chart): add chart card, overlay, stats, tooltip, responsive CSS"
```

---

## Task 4: Compact Dashboard Widget — `pnlChartSection()`

**Files:**
- Modify: `js/pnl-chart.js`
- Modify: `js/dashboard.js` (line ~5 imports, line ~80 insertion)

Wires up the stats strip, time range buttons, filter dropdowns, chart SVG, and crosshair tooltip into a dashboard section.

- [ ] **Step 1: Add `pnlChartSection` and all supporting functions to `js/pnl-chart.js`**

Add at the bottom of the file:

```js
let chartFilters = { range: 'all', accountId: 'all', strategyId: 'all' };

function statBox(label, value, tone) {
  return el('div', { class: 'pnl-stat' },
    el('div', { class: 'pnl-stat-l' }, label),
    el('div', { class: 'pnl-stat-v' + (tone ? ' ' + tone : '') }, value)
  );
}

function statsStrip(stats) {
  const pnlTone = stats.currentPnl >= 0 ? 'pos' : 'neg';
  const wrTone = stats.winRate >= 50 ? 'pos' : 'neg';
  const pfTone = stats.profitFactor >= 1 ? 'pos' : 'neg';

  return el('div', { class: 'pnl-stats-strip' },
    statBox('Current PnL', stats.totalTrades ? fmtMoney(stats.currentPnl, { dp: 0, sign: true }) : '—', stats.totalTrades ? pnlTone : ''),
    statBox('ATH', stats.totalTrades ? fmtMoney(stats.ath, { dp: 0, sign: true }) : '—', 'gold'),
    statBox('Max DD', stats.totalTrades ? fmtMoney(stats.maxDd, { dp: 0 }) : '—', stats.totalTrades ? 'neg' : ''),
    statBox('Trades', stats.totalTrades ? String(stats.totalTrades) : '—', ''),
    statBox('Win Rate', stats.totalTrades ? stats.winRate.toFixed(0) + '%' : '—', stats.totalTrades ? wrTone : ''),
    statBox('Avg Win', stats.totalTrades && stats.avgWin ? fmtMoney(stats.avgWin, { dp: 0 }) : '—', 'pos'),
    statBox('Avg Loss', stats.totalTrades && stats.avgLoss ? fmtMoney(stats.avgLoss, { dp: 0 }) : '—', 'neg'),
    statBox('Profit Factor', stats.totalTrades ? stats.profitFactor.toFixed(2) : '—', stats.totalTrades ? pfTone : '')
  );
}

function rangeRow(active, onChange) {
  const ranges = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'ytd', label: 'YTD' },
    { key: 'all', label: 'All' },
  ];
  return el('div', { class: 'pnl-range-row' },
    ...ranges.map(r =>
      el('button', {
        class: 'pnl-range-btn' + (active === r.key ? ' active' : ''),
        onClick: () => onChange(r.key),
      }, r.label)
    )
  );
}

function filterRow(onChange) {
  const accSelect = el('select', { onChange: (e) => onChange('accountId', e.target.value) });
  accSelect.appendChild(el('option', { value: 'all' }, 'All accounts'));
  data.accounts.forEach(a => {
    const opt = el('option', { value: a.id }, a.name);
    if (chartFilters.accountId === a.id) opt.selected = true;
    accSelect.appendChild(opt);
  });

  const stratSelect = el('select', { onChange: (e) => onChange('strategyId', e.target.value) });
  stratSelect.appendChild(el('option', { value: 'all' }, 'All strategies'));
  data.strategies.forEach(s => {
    const opt = el('option', { value: s.id }, s.name);
    if (chartFilters.strategyId === s.id) opt.selected = true;
    stratSelect.appendChild(opt);
  });

  return el('div', { class: 'pnl-filter-row' }, accSelect, stratSelect);
}

function attachCrosshair(wrap, svg) {
  const crosshair = el('div', { class: 'pnl-crosshair' });
  const dot = el('div', { class: 'pnl-dot' });
  const tooltip = el('div', { class: 'pnl-tooltip' },
    el('div', { class: 'pnl-tooltip-val' }),
    el('div', { class: 'pnl-tooltip-date' })
  );
  wrap.appendChild(crosshair);
  wrap.appendChild(dot);
  wrap.appendChild(tooltip);

  const show = (e) => {
    const pts = JSON.parse(svg.dataset.points || '[]');
    if (!pts.length) return;
    const rect = svg.getBoundingClientRect();
    const mx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const scaleX = rect.width > 0 ? parseFloat(svg.getAttribute('viewBox').split(' ')[2]) / rect.width : 1;

    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dist = Math.abs(pts[i].x - mx * scaleX);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    }

    const p = pts[closest];
    const pxX = p.x / scaleX;
    const pxY = p.y / scaleX;

    crosshair.style.display = 'block';
    crosshair.style.left = pxX + 'px';
    crosshair.style.height = rect.height + 'px';

    dot.style.display = 'block';
    dot.style.left = pxX + 'px';
    dot.style.top = pxY + 'px';

    const sign = p.cumPnl >= 0 ? '+' : '';
    tooltip.querySelector('.pnl-tooltip-val').textContent = sign + fmtMoney(p.cumPnl, { dp: 2 });
    tooltip.querySelector('.pnl-tooltip-date').textContent = fmtDate(p.date);
    tooltip.style.display = 'block';
    const tipLeft = pxX + 16;
    const tipTop = pxY - 20;
    tooltip.style.left = (tipLeft + tooltip.offsetWidth > rect.width ? pxX - tooltip.offsetWidth - 12 : tipLeft) + 'px';
    tooltip.style.top = Math.max(0, tipTop) + 'px';
  };

  const hide = () => {
    crosshair.style.display = 'none';
    dot.style.display = 'none';
    tooltip.style.display = 'none';
  };

  svg.addEventListener('mousemove', show);
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('touchstart', show, { passive: true });
  svg.addEventListener('touchend', hide);
}

function renderChart(container, heightOverride) {
  container.innerHTML = '';
  const { points, stats } = computePnlData(data.journals, chartFilters);

  container.appendChild(statsStrip(stats));
  container.appendChild(rangeRow(chartFilters.range, (key) => {
    chartFilters.range = key;
    renderChart(container, heightOverride);
  }));
  container.appendChild(filterRow((field, value) => {
    chartFilters[field] = value;
    renderChart(container, heightOverride);
  }));

  const wrap = el('div', { class: 'pnl-chart-wrap' });
  const svg = buildChartSVG(points, { height: heightOverride || 280 });
  wrap.appendChild(svg);
  attachCrosshair(wrap, svg);
  container.appendChild(wrap);
}

export function pnlChartSection() {
  const content = el('div', { class: 'pnl-chart-content' });
  const card = el('section', { class: 'card pnl-chart-card' + (!data.journals.length ? ' empty' : '') },
    el('div', { class: 'pnl-chart-head' },
      el('h2', {}, 'Cumulative PnL'),
      el('button', { class: 'pnl-expand-btn', onClick: () => openPnlOverlay() },
        el('span', { html: iconSVG('expand') }), ' Expand'
      )
    ),
    content
  );
  renderChart(content);
  return card;
}
```

- [ ] **Step 2: Import and insert in `js/dashboard.js`**

At the top of `dashboard.js`, add to the imports:

```js
import { pnlChartSection } from './pnl-chart.js';
```

In `renderDashboardPage()`, after `root.appendChild(stratSection);` (line ~80) and before the `// ── Journal trade history ──` comment, add:

```js
  // ── Cumulative PnL chart ──
  root.appendChild(pnlChartSection());
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000` — the dashboard should show the PnL chart card between strategies and journal history. Test:
- Time range buttons switch and re-render
- Filter dropdowns populate with accounts/strategies
- Crosshair tooltip appears on mouse hover over the chart
- Empty state shows correctly if no journals exist

- [ ] **Step 4: Commit**

```bash
git add js/pnl-chart.js js/dashboard.js
git commit -m "feat(pnl-chart): add compact dashboard widget with stats, filters, crosshair"
```

---

## Task 5: Full-Screen Overlay — `openPnlOverlay()`

**Files:**
- Modify: `js/pnl-chart.js`

- [ ] **Step 1: Add `openPnlOverlay` function to `js/pnl-chart.js`**

Add before the `export function pnlChartSection()` line:

```js
function openPnlOverlay() {
  const existing = document.querySelector('.pnl-chart-overlay');
  if (existing) existing.remove();

  const content = el('div', { class: 'pnl-chart-content' });

  const overlay = el('div', { class: 'pnl-chart-overlay' },
    el('div', { style: { position: 'relative', maxWidth: '1200px', width: '100%', margin: '0 auto' } },
      el('div', { class: 'pnl-overlay-title' }, 'Cumulative PnL'),
      el('button', { class: 'pnl-overlay-close', onClick: close },
        el('span', { html: iconSVG('close') }), ' Close'
      ),
      content
    )
  );

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  renderChart(content, 500);
  document.body.appendChild(overlay);
}
```

- [ ] **Step 2: Verify in browser**

On the dashboard, click the "Expand" button on the PnL chart card. Should open a full-screen overlay with:
- Larger chart (500px height)
- Same stats, filters, and crosshair tooltip
- Close button works
- Escape key closes

- [ ] **Step 3: Commit**

```bash
git add js/pnl-chart.js
git commit -m "feat(pnl-chart): add full-screen overlay with Escape key close"
```

---

## Task 6: Visual Polish & Browser Testing

**Files:**
- Possibly tweak: `css/pnl-chart.css`, `js/pnl-chart.js`

> **Agent note:** Use `/ui-ux-pro-max` skill and Chrome DevTools MCP for this task. Test in the actual browser and fix any visual issues.

- [ ] **Step 1: Test on desktop (> 860px)**

Verify in browser at `http://localhost:3000`:
- Card hover shows gold border
- Stats strip lays out in 2 rows of 4
- Time range buttons highlight correctly
- Crosshair tooltip doesn't overflow chart bounds
- Overlay backdrop covers full screen
- Chart resizes properly on window resize

- [ ] **Step 2: Test on mobile (≤ 860px)**

Use Chrome DevTools device mode (375px width):
- Stats strip scrolls horizontally
- Filter dropdowns stack vertically
- Chart renders at reduced height
- Overlay works full-screen

- [ ] **Step 3: Test edge cases**

- Zero journal entries → empty state message
- All trades are wins → green line only, no red
- All trades are losses → red line only, dips below zero
- Single trade → one data point renders (dot, no line)
- Switch time ranges with no trades in that period → empty state

- [ ] **Step 4: Fix any issues found**

Apply CSS/JS tweaks as needed based on testing.

- [ ] **Step 5: Commit**

```bash
git add css/pnl-chart.css js/pnl-chart.js
git commit -m "fix(pnl-chart): visual polish and edge case fixes from browser testing"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|------------------|------|
| Dollar PnL computation | Task 1 |
| Account/strategy filtering | Task 1 (data), Task 4 (UI) |
| Time range presets (7D/30D/90D/YTD/All) | Task 1 (data), Task 4 (UI) |
| Dual-tone area chart (green/red) | Task 2 |
| Y-axis dollar labels | Task 2 |
| X-axis date labels | Task 2 |
| Zero line (dashed) | Task 2 |
| Crosshair tooltip (gold) | Task 4 |
| Stats row (8 metrics) | Task 4 |
| Compact dashboard widget | Task 4 |
| Full-screen overlay | Task 5 |
| Escape key to close overlay | Task 5 |
| Empty state | Task 2 (SVG), Task 4 (card) |
| Responsive behavior | Task 3 (CSS), Task 6 (verify) |
| CSS tokens match design system | Task 3 |
| Dashboard insertion point | Task 4 |
| `index.html` stylesheet link | Task 3 |
