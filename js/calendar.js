/**
 * calendar.js — PnL Calendar workspace + dashboard mini-calendar.
 *
 * Aggregates journal entries by local-day and renders:
 *   - Full month view at #calendar with prev/today/next + account filter.
 *   - Display-only mini calendar for the dashboard (current month).
 */

import { data, journalStrategyIds } from './store.js';
import { go } from './router.js';
import { openJournalDetail } from './journal.js';
import { el, fmtMoney, fmtPct, fmtDate, iconSVG, customSelect } from './utils.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const state = { year: null, month: null, accountId: 'all' };

function todayParts() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function makeDayKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function pnlOf(j) {
  const amt = Math.abs(parseFloat(j.amount) || 0);
  if (j.result === 'win')  return amt;
  if (j.result === 'loss') return -amt;
  return 0;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Returns the Monday-anchored start date for the calendar grid.
// JS Date.getDay(): Sun=0, Mon=1, ..., Sat=6. We want Monday-first.
function gridStart(year, month) {
  const first = new Date(year, month, 1);
  const dow = first.getDay();           // 0..6, Sun..Sat
  const offset = (dow + 6) % 7;          // 0..6 where Mon=0
  return new Date(year, month, 1 - offset);
}

export function aggregateByDay({ journals, accountId, year, month }) {
  const days = new Map();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();

  for (const j of journals) {
    if (accountId !== 'all' && j.accountId !== accountId) continue;
    const ts = j.entryDate || j.createdAt;
    if (!ts || ts < monthStart || ts >= monthEnd) continue;
    const key = dayKey(ts);
    let bucket = days.get(key);
    if (!bucket) { bucket = { pnl: 0, trades: [] }; days.set(key, bucket); }
    bucket.pnl += pnlOf(j);
    bucket.trades.push(j);
  }

  let netPnl = 0, wins = 0, losses = 0, breakeven = 0;
  let bestDay = null, worstDay = null;
  for (const [key, b] of days.entries()) {
    netPnl += b.pnl;
    for (const t of b.trades) {
      if (t.result === 'win') wins++;
      else if (t.result === 'loss') losses++;
      else breakeven++;
    }
    if (!bestDay || b.pnl > bestDay.pnl)  bestDay = { key, pnl: b.pnl };
    if (!worstDay || b.pnl < worstDay.pnl) worstDay = { key, pnl: b.pnl };
  }
  const tradeCount = wins + losses + breakeven;
  const decisive = wins + losses;
  const winRate = decisive ? (wins / decisive) * 100 : 0;

  return {
    days,
    summary: {
      netPnl,
      tradeCount,
      wins, losses, breakeven,
      winRate,
      bestDay,
      worstDay,
      tradingDays: days.size,
    }
  };
}

function maxAbsPnl(days) {
  let max = 0;
  for (const b of days.values()) {
    const a = Math.abs(b.pnl);
    if (a > max) max = a;
  }
  return max;
}

// Tint intensity for a day cell, 0..1 based on |pnl| relative to month max.
function tintLevel(pnl, max) {
  if (!max || !pnl) return 0;
  const t = Math.abs(pnl) / max;
  return Math.max(0.18, Math.min(1, t));
}

function fmtKeyShort(key) {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return MONTH_NAMES[m - 1].slice(0, 3) + ' ' + d;
}

// ── Page ──────────────────────────────────────────────
export function renderCalendarPage() {
  const root = document.querySelector('[data-page="calendar"]');
  if (!root) return;
  if (state.year === null) {
    const t = todayParts();
    state.year = t.y; state.month = t.m;
  }

  const { days, summary } = aggregateByDay({
    journals: data.journals,
    accountId: state.accountId,
    year: state.year,
    month: state.month,
  });
  const max = maxAbsPnl(days);

  root.innerHTML = '';
  root.appendChild(pageHead());
  root.appendChild(summaryStrip(summary));
  root.appendChild(weekdayRow());
  root.appendChild(monthGrid(days, max, /*interactive*/ true));
}

function pageHead() {
  const accountOptions = [{ value: 'all', label: 'All accounts' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))];
  const accountSelect = customSelect(accountOptions, state.accountId, (v) => {
    state.accountId = v;
    renderCalendarPage();
  });

  const monthLabel = `${MONTH_NAMES[state.month]} ${state.year}`;

  return el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Performance'),
      el('h1', { class: 'page-title' }, 'PnL Calendar'),
      el('p', { class: 'page-sub' }, 'Daily profit and loss across the month — navigate back through previous months or forward.')
    ),
    el('div', { class: 'cal-head-controls' },
      accountSelect,
      el('div', { class: 'cal-month-nav' },
        el('button', { class: 'cal-nav-btn', onClick: () => stepMonth(-1), 'aria-label': 'Previous month' },
          el('span', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' })
        ),
        el('div', { class: 'cal-month-label' }, monthLabel),
        el('button', { class: 'cal-nav-btn', onClick: () => stepMonth(1), 'aria-label': 'Next month' },
          el('span', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' })
        ),
        el('button', { class: 'btn btn-ghost btn-sm cal-today-btn', onClick: () => goToday() }, 'Today')
      )
    )
  );
}

function stepMonth(delta) {
  let y = state.year, m = state.month + delta;
  if (m < 0)  { m = 11; y--; }
  if (m > 11) { m = 0;  y++; }
  state.year = y; state.month = m;
  renderCalendarPage();
}

function goToday() {
  const t = todayParts();
  state.year = t.y; state.month = t.m;
  renderCalendarPage();
}

function summaryStrip(s) {
  const netClass = s.netPnl > 0 ? 'pos' : s.netPnl < 0 ? 'neg' : '';
  const bestLabel = s.bestDay ? `${fmtKeyShort(s.bestDay.key)} · ${fmtMoney(s.bestDay.pnl, { dp: 0, sign: true })}` : '—';
  const worstLabel = s.worstDay ? `${fmtKeyShort(s.worstDay.key)} · ${fmtMoney(s.worstDay.pnl, { dp: 0 })}` : '—';
  const winRateLabel = s.tradeCount
    ? `${s.tradeCount} · ${fmtPct(s.winRate, 0)} WR`
    : '0';

  return el('div', { class: 'kpi-strip cal-kpi-strip' },
    kpiCard(
      (s.netPnl > 0 ? '+' : '') + fmtMoney(s.netPnl, { dp: 0 }),
      'Net PnL',
      netClass
    ),
    kpiCard(winRateLabel, 'Trades · win rate'),
    kpiCard(bestLabel, 'Best day', s.bestDay && s.bestDay.pnl > 0 ? 'pos' : ''),
    kpiCard(worstLabel, 'Worst day', s.worstDay && s.worstDay.pnl < 0 ? 'neg' : ''),
    kpiCard(String(s.tradingDays), 'Trading days'),
  );
}

function kpiCard(value, label, tone = '') {
  return el('div', { class: 'kpi cal-kpi' + (tone ? ' kpi-' + tone : '') },
    el('div', { class: 'kpi-v cal-kpi-v ' + tone }, value),
    el('div', { class: 'kpi-l' }, label)
  );
}

function weekdayRow() {
  const row = el('div', { class: 'cal-weekday-row' });
  WEEKDAYS.forEach(w => row.appendChild(el('div', { class: 'cal-weekday' }, w)));
  return row;
}

function monthGrid(days, maxAbs, interactive) {
  const grid = el('div', { class: 'calendar-grid' + (interactive ? '' : ' cal-mini') });
  const start = gridStart(state.year, state.month);
  const today = todayParts();
  const totalDays = daysInMonth(state.year, state.month);
  const lastDay = new Date(state.year, state.month, totalDays);
  const lastIncluded = new Date(start);
  // Always render 6 weeks (42 cells) for a stable grid height.
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + i);
    const inMonth = cellDate.getMonth() === state.month && cellDate.getFullYear() === state.year;
    const key = `${cellDate.getFullYear()}-${pad2(cellDate.getMonth()+1)}-${pad2(cellDate.getDate())}`;
    const bucket = days.get(key);
    const isToday = cellDate.getFullYear() === today.y && cellDate.getMonth() === today.m && cellDate.getDate() === today.d;
    grid.appendChild(dayCell({
      date: cellDate, key, inMonth, isToday, bucket, maxAbs, interactive
    }));
  }
  return grid;
}

function dayCell({ date, key, inMonth, isToday, bucket, maxAbs, interactive }) {
  const pnl = bucket?.pnl || 0;
  const tone = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
  const intensity = bucket ? tintLevel(pnl, maxAbs) : 0;
  const cls = [
    'cal-day',
    inMonth ? '' : 'is-padding',
    isToday ? 'is-today' : '',
    tone,
    bucket && interactive ? 'is-clickable' : '',
  ].filter(Boolean).join(' ');

  const node = el('div', {
    class: cls,
    style: bucket ? { '--tint': String(intensity) } : {},
    onClick: (bucket && interactive)
      ? () => openDayPopup(key, bucket.trades)
      : null,
  },
    el('div', { class: 'cal-day-num' }, String(date.getDate())),
    bucket
      ? el('div', { class: 'cal-day-pnl ' + tone },
          (pnl > 0 ? '+' : '') + fmtMoney(pnl, { dp: 0 })
        )
      : null,
    bucket && interactive
      ? el('div', { class: 'cal-day-count' },
          bucket.trades.length + (bucket.trades.length === 1 ? ' trade' : ' trades')
        )
      : null
  );
  return node;
}

// ── Day-detail popup (read-only list of that day's trades) ──
function openDayPopup(key, trades) {
  const totalPnl = trades.reduce((s, t) => s + pnlOf(t), 0);
  const wins = trades.filter(t => t.result === 'win').length;
  const losses = trades.filter(t => t.result === 'loss').length;
  const be = trades.filter(t => t.result === 'be').length;
  const tone = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : '';

  const overlay = el('div', { class: 'bt-detail-overlay cal-day-popup' });
  function close() { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); }

  const header = el('div', { class: 'bt-detail-header' },
    el('div', {},
      el('div', { class: 'bt-detail-title' }, fmtKeyToLong(key)),
      el('div', { class: 'bt-detail-sub' },
        `${trades.length} trade${trades.length === 1 ? '' : 's'} · ${wins}W ${losses}L${be ? ' ' + be + 'BE' : ''}`
      )
    ),
    el('div', { class: 'bt-detail-actions' },
      el('div', { class: 'cal-day-total ' + tone },
        (totalPnl > 0 ? '+' : '') + fmtMoney(totalPnl, { dp: 0 })
      ),
      el('button', { class: 'icon-btn', onClick: () => close(), 'aria-label': 'Close' },
        el('span', { html: iconSVG('close') })
      )
    )
  );

  const list = el('div', { class: 'cal-day-list' });
  [...trades]
    .sort((a, b) => (a.entryDate || a.createdAt || 0) - (b.entryDate || b.createdAt || 0))
    .forEach(t => list.appendChild(dayTradeRow(t, close)));

  const modal = el('div', { class: 'bt-detail-modal cal-day-modal' }, header, list);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function fmtKeyToLong(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function dayTradeRow(t, closePopup) {
  const strategies = journalStrategyIds(t).map(id => data.strategies.find(x => x.id === id)).filter(Boolean);
  const primary = strategies[0];
  const stratLabel = strategies.length ? strategies.map(s => s.name).join(' + ') : 'No strategy';
  const a = data.accounts.find(x => x.id === t.accountId);
  const pnl = pnlOf(t);
  const tone = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'be';
  const amtLabel = pnl !== 0
    ? (pnl > 0 ? '+' : '-') + fmtMoney(Math.abs(pnl), { dp: 0 })
    : (t.rAchieved ? t.rAchieved + 'R' : '—');

  return el('div', { class: 'cal-day-row', onClick: () => { closePopup(); openJournalDetail(t); } },
    el('div', { class: 'cal-day-row-thumb' + (t.screenshotPath ? '' : ' empty'),
                style: t.screenshotPath ? { backgroundImage: `url(${t.screenshotPath})` } : {} },
      el('span', { class: 'journal-thumb-result ' + (t.result || 'be') }, (t.result || 'be').toUpperCase())
    ),
    el('div', { class: 'cal-day-row-body' },
      el('div', { class: 'cal-day-row-t' },
        primary ? el('span', { class: 'journal-strat-dot', style: { background: primary.color || '#F59E0B' } }) : null,
        el('span', {}, stratLabel)
      ),
      el('div', { class: 'cal-day-row-s' },
        el('span', {}, a ? a.name : 'Unassigned'),
        el('span', { class: 'dot-sep' }, '·'),
        el('span', {}, t.instrument || '—'),
        el('span', { class: 'dot-sep' }, '·'),
        el('span', {}, t.timeframe || '—'),
        el('span', { class: 'dot-sep' }, '·'),
        el('span', {}, (t.direction || 'long').toUpperCase())
      )
    ),
    el('div', { class: 'cal-day-row-pnl ' + tone }, amtLabel)
  );
}

// ── Dashboard mini ────────────────────────────────────
export function dashboardMiniCalendar(accountFilter = 'all') {
  const t = todayParts();
  const { days, summary } = aggregateByDay({
    journals: data.journals,
    accountId: accountFilter,
    year: t.y,
    month: t.m,
  });
  const max = maxAbsPnl(days);

  // Use a local snapshot of state for mini rendering without affecting page state.
  const prevYear = state.year, prevMonth = state.month;
  state.year = t.y; state.month = t.m;
  const grid = monthGrid(days, max, /*interactive*/ false);
  state.year = prevYear; state.month = prevMonth;

  const netLabel = (summary.netPnl > 0 ? '+' : '') + fmtMoney(summary.netPnl, { dp: 0 });
  const netTone = summary.netPnl > 0 ? 'pos' : summary.netPnl < 0 ? 'neg' : '';

  const section = el('section', { class: 'dash-section' },
    el('div', { class: 'dash-section-head' },
      el('h2', {}, `${MONTH_NAMES[t.m]} ${t.y} · PnL Calendar`),
      el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
        el('span', { class: 'cal-mini-net ' + netTone }, netLabel),
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('calendar') }, 'View calendar →')
      )
    ),
    weekdayRow(),
    grid
  );
  return section;
}
