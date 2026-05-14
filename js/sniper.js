/**
 * sniper.js — Adaptive Flow · Strategy 01 · Sn1P3r daily checklist.
 * State persists in localStorage under `tms-sniper-state`.
 */

import { el } from './utils.js';

const STATE_KEY = 'tms-sniper-state';
let clockTimer = null;

const INDICATORS = [
  'Sn1P3r Premium 2.0',
  'Sn1P3r Oscillator',
  'Sn1P3r Order Flow',
  'Event Horizon',
  'VWAP Weekly',
];

const KILLZONES = [
  { id: 'asia',   name: 'Asian',    time: '07:00 – 10:00', start: 7,  end: 10 },
  { id: 'london', name: 'London',   time: '14:00 – 16:00', start: 14, end: 16 },
  { id: 'ny',     name: 'New York', time: '20:00 – 22:00', start: 20, end: 22 },
];

const PHASES = [
  {
    n: 1, title: 'Pre-Trade Setup', tag: 'Before any signal hunting',
    items: [
      { k: 'TIMEFRAME LOCKED',    t: 'M1 or M5 selected above. Do not switch between timeframes mid-session.',                                                              badge: { label: 'Timeframe', cls: 'timeframe' } },
      { k: 'INDICATORS LOADED',   t: 'All five indicators visible and active on the chart: Premium 2.0, Oscillator, Order Flow, Event Horizon, VWAP Weekly.',                badge: { label: 'Setup',     cls: 'setup' } },
      { k: 'KILLZONE ACTIVE',     t: 'Current time falls inside Asian (07–10), London (14–16), or NY (20–22) Cambodia time. Outside window = no trade.',                    badge: { label: 'KZ Check',  cls: 'kz' } },
      { k: 'BIAS DEFINED',        t: 'CDL present → BUY setups only. CDS present → SELL setups only. Trade only in the direction the indicator gives you.',                 badge: { label: 'Bias',      cls: 'bias' } },
      { k: 'S/R MARKED',          t: 'Key support and resistance levels drawn on chart. Signals near major S/R carry higher conviction; signals in open space carry less.', badge: { label: 'Structure', cls: 'structure' } },
    ],
  },
  {
    n: 2, title: 'Entry Conditions', tag: 'All 3 must be met',
    items: [
      { k: 'CONDITION 1 · DIRECTION',   t: 'CDL or CDS showing 2★ or 3★ strength in trade direction. 1★ signals = SKIP. No exceptions.',                                          badge: { label: 'Direction', cls: 'direction' } },
      { k: 'CONDITION 2 · ACCELERATOR', t: 'Bullish accelerator (BuAx+) present for BUY, Bearish accelerator (BeAx+) present for SELL. No accelerator = SKIP.',                  badge: { label: 'Candle',    cls: 'candle' } },
      { k: 'CONDITION 3 · FVG',         t: 'FVG in the trade direction visible: Strong Bullish / Bull Bias / Bull FVG for BUY, or Strong Bearish / Bear Bias / Bear FVG for SELL.', badge: { label: 'FVG',       cls: 'fvg' } },
    ],
  },
  {
    n: 3, title: 'Entry Confirmation', tag: 'The actual trigger sequence',
    items: [
      { k: 'CONFLUENCE',            t: 'All 3 Phase 2 conditions (Direction stars, Accelerator, FVG) point in the same direction. Mismatch = abort.',           badge: { label: 'Confluence',    cls: 'confluence' } },
      { k: 'RETRACE INTO FVG',      t: 'Price has pulled back into the identified FVG zone. Do NOT chase at current candle — wait for the retrace.',            badge: { label: 'Retrace',       cls: 'retrace' } },
      { k: 'REJECTION AT FVG',      t: 'A clear rejection wick OR reversal candle has printed at the FVG edge. No rejection = no entry.',                       badge: { label: 'Rejection',     cls: 'reject' } },
      { k: 'ENTER AT CANDLE CLOSE', t: 'Only place the trade after the rejection candle has FULLY closed. Never enter on an open/forming candle.',              badge: { label: 'Entry Timing',  cls: 'entry' } },
    ],
  },
  {
    n: 4, title: 'Risk Management', tag: 'Define before clicking buy/sell',
    items: [
      { k: 'STOP LOSS PLACED',     t: 'SELL: SL above recent swing high. BUY: SL below recent swing low. At least 1 candle beyond the swing.',                  badge: { label: 'Stop Loss',     cls: 'stop' } },
      { k: 'LOT SIZE CALCULATED',  t: 'Risk maximum 1–2% of account based on SL distance in points. Never increase lots to recover prior losses.',              badge: { label: 'Lot Size',      cls: 'lot' } },
      { k: 'TAKE PROFIT SET',      t: 'Minimum 1:1.5 R:R. Target nearest S/R level, previous swing high/low, or fixed point target. Confirm BEFORE entry.',     badge: { label: 'Take Profit',   cls: 'tp' } },
      { k: 'NEWS CLEARED',         t: 'No high-impact news within 15 min of entry. Check economic calendar: NFP, FOMC, CPI, PCE, ECB, rate decisions.',          badge: { label: 'News Filter',   cls: 'news' } },
      { k: 'TRADE COUNT < 3',      t: 'Less than 3 trades taken today (counter above). Once 3 are filled (win or loss), stop. No more signals trade-able today.', badge: { label: 'Max Exposure',  cls: 'max' } },
    ],
  },
  {
    n: 5, title: 'Trade Management', tag: 'After entry — discipline phase',
    items: [
      { k: 'BREAKEVEN AT 1:1',          t: 'Once price moves the same distance as your SL in your favor, slide SL to entry price. Lock in no-loss.',           badge: { label: 'Breakeven',     cls: 'be' } },
      { k: 'NEVER WIDEN SL',            t: 'Moving SL further from entry to avoid being stopped is strictly prohibited. Honour your original SL. Always.',     badge: { label: 'Discipline',    cls: 'discipline' } },
      { k: 'PARTIAL CLOSE (OPTIONAL)',  t: 'At 1:1 R:R you may close 50% of position and let the remainder run to full TP with BE on SL.',                     badge: { label: 'Partial TP',    cls: 'partial' } },
      { k: 'NO MARTINGALE',             t: 'Do NOT add to a losing position. No averaging down. No "doubling up to recover." Walk away from the chart.',       badge: { label: 'No Martingale', cls: 'no-mg' } },
      { k: 'KZ EXIT',                   t: "If price hasn't moved meaningfully before the killzone window closes, manually close the trade. No aimless drift.", badge: { label: 'KZ Exit Rule',  cls: 'kz-exit' } },
    ],
  },
];

const PREMIUM = [
  { k: 'FVG RANK #1–#3',        t: 'Top three ranked FVG in the trade direction. Avoid #5 or below.' },
  { k: 'FVG STRENGTH ≥75%',     t: 'Strength chip percentage. 85%+ is elite territory.' },
  { k: 'SENTIMENT NOT NEUTRAL', t: 'Inside-FVG sentiment reads "Strong" or "Moderate" in trade direction — never "Neutral" or counter-direction.' },
  { k: 'FIRST TOUCH ONLY',      t: 'Price has not previously tested this FVG. Second and third tests have meaningfully lower hit rates.' },
  { k: 'AX RATIOS ≥2.0×',       t: 'Range expansion AND delta expansion both at or above 2.0× average. Premium accelerator quality.' },
  { k: 'UH / UL CONFLUENCE',    t: 'Un-auctioned High or Low ($) marker inside or adjacent to FVG, OR aligned with TP. Liquidity edge stacked.' },
  { k: '3★ CDL/CDS',            t: 'The direction signal is at 3-star quality, not just 2-star. Maximum directional conviction.' },
];

const NO_TRADE = [
  ['News window',          '15 min before/after NFP, CPI, FOMC, PCE, ECB, rate decisions. Synthetic delta lies during spikes.'],
  ['Outside killzone',     'Asian / London / NY only. No trades outside the 3 windows.'],
  ['3 trades reached',     'Daily cap hit. Win or loss, you are done for the day.'],
  ['1★ CDL/CDS',           'Bias signal at 1-star is too weak. Wait for 2★+ or stand down.'],
  ['Counter-bias signals', 'Direction stars, Accelerator, and FVG disagree. Confluence is non-negotiable.'],
  ['No rejection at FVG',  'Price entered the FVG but did not show a clear rejection wick or reversal candle.'],
  ['Spread widened',       'OANDA gold spread > 0.40 (common at 23:00 UTC+7 rollover).'],
  ['Tilt / revenge',       'Just took a loss and "feel" the next setup. Mood = no edge. Walk away.'],
];

const GLOSSARY = [
  ['CDL / CDS',            'Change Direction Long / Short. The bias signal. Stars indicate strength of the directional shift. 2★ minimum to trade.'],
  ['BuAx+ / BeAx+',        'Bullish / Bearish Accelerator with Plus velocity (close past midpoint). Range and delta both expanded.'],
  ['FVG',                  'Fair Value Gap. Three-candle imbalance left by aggressive moves. Categorized by direction and strength.'],
  ['UH / UL · $',          'Un-auctioned High / Low. Wickless candle extremes — untested levels that act as liquidity magnets.'],
  ['SH / SL',              'Swing High / Low. Structural reference points used for SL placement (at least 1 candle beyond).'],
  ['BuBC / BeBC',          'Bullish / Bearish Block Candle. Auction state — teal (buyers dominated) / purple (sellers dominated).'],
  ['Sentiment Bar',        'In-FVG strength: Strong Bull, Weak Bull, Neutral, Weak Bear, Strong Bear. Reads conviction inside zone.'],
  ['Buyers / Sellers TGT', 'Indicator-projected target levels based on structural break. Primary reference for take profit placement.'],
];

// ── State helpers ────────────────────────────────────────
function itemId(phaseN, idx) { return `p${phaseN}-${idx}`; }
function premiumId(idx)      { return `prem-${idx}`; }

function defaultState() { return { ticked: {}, tf: null, trades: 0 }; }

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ticked: parsed.ticked && typeof parsed.ticked === 'object' ? parsed.ticked : {},
      tf:     parsed.tf === 'M1' || parsed.tf === 'M5' ? parsed.tf : null,
      trades: typeof parsed.trades === 'number' ? Math.max(0, Math.min(3, parsed.trades)) : 0,
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function clearState() {
  try { localStorage.removeItem(STATE_KEY); } catch {}
}

// ── Time / killzone detection ────────────────────────────
function killzoneInfo(now = new Date()) {
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const local = new Date(utc + (7 * 3600000));
  const h = local.getHours();
  const m = local.getMinutes();
  const timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  for (const kz of KILLZONES) {
    if (h >= kz.start && h < kz.end) return { name: kz.name.toUpperCase(), id: kz.id, cls: 'active', timeStr };
  }
  return { name: 'CLOSED', id: null, cls: 'inactive', timeStr };
}

// ── Counts / tier ────────────────────────────────────────
function phaseCounts(state) {
  return PHASES.map(p => ({
    n: p.n,
    total: p.items.length,
    checked: p.items.reduce((a, _, idx) => a + (state.ticked[itemId(p.n, idx)] ? 1 : 0), 0),
  }));
}

function premiumCount(state) {
  return PREMIUM.reduce((a, _, idx) => a + (state.ticked[premiumId(idx)] ? 1 : 0), 0);
}

function overallProgress(state) {
  const c = phaseCounts(state);
  const total   = c.reduce((a, x) => a + x.total, 0);
  const checked = c.reduce((a, x) => a + x.checked, 0);
  return { checked, total, percent: total ? Math.round((checked / total) * 100) : 0 };
}

function computeTier(state) {
  if (state.trades >= 3) return { tier: 'DAY DONE', cls: 'danger', sub: 'Daily cap reached — stand down.' };
  const c = phaseCounts(state);
  const [p1, p2, p3, p4] = c;
  const prem = premiumCount(state);
  const allCore = p1.checked === p1.total && p2.checked === p2.total && p3.checked === p3.total && p4.checked === p4.total;
  if (allCore && prem >= 3) return { tier: 'A+',       cls: 'premium', sub: 'Size up — toward 2% risk.' };
  if (allCore)              return { tier: 'BASELINE', cls: 'active',  sub: 'Valid trade — 1% risk.' };
  if (p2.checked === p2.total && p3.checked >= 2) return { tier: 'BUILDING', cls: 'warning', sub: 'Close to baseline — finish P3 + P4.' };
  return { tier: 'SKIP', cls: 'danger', sub: 'Conditions not met.' };
}

// ── Render ───────────────────────────────────────────────
export function renderSniperPage() {
  const root = document.querySelector('[data-page="sniper"]');
  if (!root) return;
  root.innerHTML = '';

  const state = loadState();
  const wrap = el('div', { class: 'sniper-page' });
  root.appendChild(wrap);

  // ── Compact header ─────────────────────────────────────
  wrap.appendChild(el('header', { class: 'sniper-header' },
    el('div', { class: 'sniper-meta' },
      el('span', { class: 'sniper-dot' }),
      el('span', {}, 'STRATEGY 01'),
      el('span', { class: 'sniper-meta-sep' }, '·'),
      el('span', {}, 'SN1P3R TRADING SYSTEM'),
      el('span', { class: 'sniper-meta-sep' }, '·'),
      el('span', {}, 'BTECH CAMBODIA'),
    ),
    el('h1', { class: 'sniper-h1' },
      'ADAPTIVE ', el('span', { class: 'sniper-accent' }, 'FLOW'),
    ),
    el('p', { class: 'sniper-tagline' },
      'Trader execution checklist for XAU/USD on the Sn1P3r indicator suite. Five phases. No improvisation. Run top-to-bottom before, during, and after every trade.',
    ),
  ));

  // ── Pre-flight ─────────────────────────────────────────
  const indicatorsBlock = el('div', { class: 'sniper-preflight-block' },
    el('div', { class: 'sniper-preflight-title' }, 'Indicators Required'),
    el('div', { class: 'sniper-indicator-chips' },
      ...INDICATORS.map(name => el('span', { class: 'sniper-indicator-chip' }, name)),
    ),
  );

  const kzCards = new Map();
  const kzBlock = el('div', { class: 'sniper-preflight-block' },
    el('div', { class: 'sniper-preflight-title' }, 'Killzone Windows · Cambodia Time (GMT+7)'),
    el('div', { class: 'sniper-killzone-grid' },
      ...KILLZONES.map(kz => {
        const card = el('div', { class: 'sniper-killzone-card sniper-kz-' + kz.id },
          el('div', { class: 'sniper-kz-name' }, kz.name),
          el('div', { class: 'sniper-kz-time' }, kz.time),
        );
        kzCards.set(kz.id, card);
        return card;
      }),
    ),
  );

  // Timeframe toggle (radiogroup for a11y)
  const tfButtons = new Map();

  function selectTF(tf) {
    state.tf = tf;
    saveState(state);
    tfButtons.forEach((btn, k) => {
      const isActive = k === tf;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  const tfGroup = el('div', { class: 'sniper-tf-toggle', role: 'radiogroup', 'aria-label': "Today's operating timeframe" });
  ['M1', 'M5'].forEach(tf => {
    const btn = el('button', {
      type: 'button',
      class: 'sniper-tf-btn' + (state.tf === tf ? ' active' : ''),
      role: 'radio',
      'aria-checked': state.tf === tf ? 'true' : 'false',
      tabindex: state.tf === tf || (!state.tf && tf === 'M1') ? '0' : '-1',
    }, tf);
    btn.addEventListener('click', () => selectTF(tf));
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        const other = tf === 'M1' ? 'M5' : 'M1';
        selectTF(other);
        tfButtons.get(other)?.focus();
      }
    });
    tfButtons.set(tf, btn);
    tfGroup.appendChild(btn);
  });

  const tfBlock = el('div', { class: 'sniper-preflight-block' },
    el('div', { class: 'sniper-preflight-title' }, "Today's Operating Timeframe — Lock In Before Session, No Switching"),
    tfGroup,
  );

  wrap.appendChild(el('section', { class: 'sniper-preflight' }, indicatorsBlock, kzBlock, tfBlock));

  // ── Sticky status bar ──────────────────────────────────
  const sessionVal = el('div', { class: 'sniper-status-value' }, '—');
  const clockEl    = el('span', { class: 'sniper-clock' }, '—');

  const tradesVal = el('span', { class: 'sniper-counter-value', 'aria-live': 'polite' }, String(state.trades));
  const minusBtn  = el('button', { class: 'sniper-counter-btn', type: 'button', 'aria-label': 'Decrease trade count' }, '−');
  const plusBtn   = el('button', { class: 'sniper-counter-btn', type: 'button', 'aria-label': 'Increase trade count' }, '+');

  const tierVal = el('div', { class: 'sniper-status-value sniper-danger', 'aria-live': 'polite' }, 'SKIP');
  const tierSub = el('div', { class: 'sniper-tier-sub' }, '');

  const resetBtn = el('button', { class: 'sniper-reset-btn', type: 'button', 'aria-label': 'Reset all checks, trade count, and timeframe' }, 'Reset');

  function adjustTrade(delta) {
    state.trades = Math.max(0, Math.min(3, state.trades + delta));
    tradesVal.textContent = String(state.trades);
    tradesVal.classList.remove('sniper-text-warning', 'sniper-text-danger');
    if (state.trades >= 3)       tradesVal.classList.add('sniper-text-danger');
    else if (state.trades === 2) tradesVal.classList.add('sniper-text-warning');
    saveState(state);
    updateAll();
  }
  minusBtn.addEventListener('click', () => adjustTrade(-1));
  plusBtn .addEventListener('click', () => adjustTrade(1));

  const progressFill = el('div', { class: 'sniper-progress-fill sniper-danger', style: { width: '0%' } });
  const progressBar  = el('div', { class: 'sniper-progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, progressFill);
  const progressNum  = el('span', { class: 'sniper-progress-num' }, '0 / 22');

  wrap.appendChild(el('section', { class: 'sniper-status-bar', role: 'region', 'aria-label': 'Setup readout' },
    el('div', { class: 'sniper-status-top' },
      el('div', { class: 'sniper-status-cell' },
        el('div', { class: 'sniper-status-label' }, 'Active Killzone'),
        sessionVal,
        clockEl,
      ),
      el('div', { class: 'sniper-status-cell' },
        el('div', { class: 'sniper-status-label' }, 'Trades Today (Max 3)'),
        el('div', { class: 'sniper-trade-counter' }, minusBtn, tradesVal, plusBtn),
      ),
      el('div', { class: 'sniper-status-cell sniper-status-tier' },
        el('div', { class: 'sniper-status-label' }, 'Tier'),
        tierVal,
        tierSub,
      ),
      resetBtn,
    ),
    el('div', { class: 'sniper-progress-row' },
      progressBar,
      progressNum,
    ),
  ));

  // ── Phases ─────────────────────────────────────────────
  const phaseStatusEls = new Map();

  function renderPhase(phase) {
    const status = el('span', { class: 'sniper-phase-status pending' }, 'Pending');
    phaseStatusEls.set(phase.n, status);

    const list = el('ul', { class: 'sniper-checks', role: 'list' });
    phase.items.forEach((item, idx) => {
      const id = itemId(phase.n, idx);
      const isChecked = !!state.ticked[id];
      const row = el('li', {
        class: 'sniper-check-item' + (isChecked ? ' checked' : ''),
        role: 'checkbox',
        tabindex: '0',
        'aria-checked': isChecked ? 'true' : 'false',
      },
        el('div', { class: 'sniper-check-box' }),
        el('div', { class: 'sniper-check-text' },
          el('strong', {}, item.k),
          el('span', { class: 'sniper-check-detail' }, ' — ' + item.t),
        ),
        el('span', { class: 'sniper-check-badge sniper-badge-' + item.badge.cls }, item.badge.label),
      );
      const toggle = () => {
        const next = !state.ticked[id];
        state.ticked[id] = next;
        row.classList.toggle('checked', next);
        row.setAttribute('aria-checked', next ? 'true' : 'false');
        saveState(state);
        updateAll();
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); }
      });
      list.appendChild(row);
    });

    return el('section', { class: 'sniper-phase sniper-phase-' + phase.n, dataset: { phase: String(phase.n) } },
      el('div', { class: 'sniper-phase-header' },
        el('div', { class: 'sniper-phase-title-block' },
          el('span', { class: 'sniper-phase-num' }, String(phase.n).padStart(2, '0')),
          el('span', { class: 'sniper-phase-name' }, phase.title),
          el('span', { class: 'sniper-phase-tag' }, phase.tag),
        ),
        status,
      ),
      el('div', { class: 'sniper-phase-body' }, list),
    );
  }

  PHASES.forEach(p => wrap.appendChild(renderPhase(p)));

  // ── A+ Premium Qualifiers ──────────────────────────────
  const premiumList = el('div', { class: 'sniper-premium-body' });
  PREMIUM.forEach((item, idx) => {
    const id = premiumId(idx);
    const isChecked = !!state.ticked[id];
    const row = el('div', {
      class: 'sniper-premium-check' + (isChecked ? ' checked' : ''),
      role: 'checkbox',
      tabindex: '0',
      'aria-checked': isChecked ? 'true' : 'false',
    },
      el('div', { class: 'sniper-check-box' }),
      el('div', { class: 'sniper-check-text' },
        el('strong', {}, item.k),
        el('span', { class: 'sniper-check-detail' }, ' — ' + item.t),
      ),
    );
    const toggle = () => {
      const next = !state.ticked[id];
      state.ticked[id] = next;
      row.classList.toggle('checked', next);
      row.setAttribute('aria-checked', next ? 'true' : 'false');
      saveState(state);
      updateAll();
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (ev) => {
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); }
    });
    premiumList.appendChild(row);
  });

  wrap.appendChild(el('section', { class: 'sniper-premium-section' },
    el('div', { class: 'sniper-premium-header' },
      el('div', { class: 'sniper-premium-label' }, 'Optional · Layer on top of baseline'),
      el('div', { class: 'sniper-premium-title' }, 'A+ Premium Qualifiers'),
      el('div', { class: 'sniper-premium-desc' },
        'If all Phase 1–4 conditions above pass, this is a valid trade. If three or more of the qualifiers below ALSO pass, this becomes an A+ premium setup and you can size at the upper end of your risk range (toward 2%). These are personal filters built from backtest data.'),
    ),
    premiumList,
  ));

  // ── No-trade filters ───────────────────────────────────
  const noTradeList = el('ul', { class: 'sniper-no-trade-list' });
  NO_TRADE.forEach(([title, body]) => {
    noTradeList.appendChild(el('li', { class: 'sniper-no-trade-item' },
      el('span', { class: 'sniper-x' }, '✕'),
      el('span', {}, el('strong', {}, title), ' — ' + body),
    ));
  });
  wrap.appendChild(el('section', { class: 'sniper-no-trade' },
    el('h2', { class: 'sniper-no-trade-title' }, 'Do Not Trade'),
    el('div', { class: 'sniper-no-trade-sub' }, 'Override-all conditions — skip even if everything else passes'),
    noTradeList,
  ));

  // ── Glossary ───────────────────────────────────────────
  const glossGrid = el('div', { class: 'sniper-gloss-grid' });
  GLOSSARY.forEach(([term, def]) => {
    glossGrid.appendChild(el('div', { class: 'sniper-gloss-item' },
      el('div', { class: 'sniper-gloss-term' }, term),
      el('div', { class: 'sniper-gloss-def' }, def),
    ));
  });
  wrap.appendChild(el('section', { class: 'sniper-glossary' },
    el('h2', { class: 'sniper-section-title' }, 'Reference'),
    el('div', { class: 'sniper-section-subtitle' }, 'Sn1P3r vocabulary cheat sheet'),
    glossGrid,
  ));

  // ── Footer ─────────────────────────────────────────────
  wrap.appendChild(el('footer', { class: 'sniper-footer' },
    el('span', {}, 'Discipline > Conviction · 5 phases, every trade · Max 3 trades / day'),
  ));

  // ── Reset ──────────────────────────────────────────────
  resetBtn.addEventListener('click', () => {
    state.ticked = {};
    state.tf = null;
    state.trades = 0;
    clearState();
    wrap.querySelectorAll('.sniper-check-item, .sniper-premium-check').forEach(node => {
      node.classList.remove('checked');
      node.setAttribute('aria-checked', 'false');
    });
    tfButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-checked', 'false');
    });
    tradesVal.textContent = '0';
    tradesVal.classList.remove('sniper-text-warning', 'sniper-text-danger');
    updateAll();
  });

  // ── Unified update ─────────────────────────────────────
  function updateAll() {
    const counts = phaseCounts(state);
    counts.forEach(c => {
      const status = phaseStatusEls.get(c.n);
      if (!status) return;
      if (c.checked === c.total) {
        status.textContent = 'Complete';
        status.className = 'sniper-phase-status complete';
      } else if (c.checked > 0) {
        status.textContent = `${c.checked} / ${c.total}`;
        status.className = 'sniper-phase-status pending';
      } else {
        status.textContent = 'Pending';
        status.className = 'sniper-phase-status pending';
      }
      const phaseEl = wrap.querySelector(`.sniper-phase[data-phase="${c.n}"]`);
      if (phaseEl) phaseEl.classList.toggle('complete', c.checked === c.total);
    });

    const { tier, cls, sub } = computeTier(state);
    tierVal.textContent = tier;
    tierVal.className = 'sniper-status-value sniper-' + cls;
    tierSub.textContent = sub;

    const p = overallProgress(state);
    progressFill.style.width = p.percent + '%';
    progressFill.className = 'sniper-progress-fill sniper-' + cls;
    progressBar.setAttribute('aria-valuenow', String(p.percent));
    progressNum.textContent = `${p.checked} / ${p.total}`;
  }

  // ── Killzone clock ─────────────────────────────────────
  function refreshClock() {
    const kz = killzoneInfo();
    sessionVal.textContent = kz.name;
    sessionVal.className = 'sniper-status-value sniper-' + (kz.cls === 'active' ? 'active' : 'inactive');
    clockEl.textContent = kz.timeStr + ' UTC+7';
    kzCards.forEach(c => c.classList.remove('active'));
    if (kz.id) kzCards.get(kz.id)?.classList.add('active');
  }
  if (clockTimer) clearInterval(clockTimer);
  refreshClock();
  clockTimer = setInterval(refreshClock, 30000);

  if (state.trades >= 3) tradesVal.classList.add('sniper-text-danger');
  else if (state.trades === 2) tradesVal.classList.add('sniper-text-warning');

  updateAll();
}
