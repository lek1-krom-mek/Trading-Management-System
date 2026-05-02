/**
 * ui.js — DOM render layer.
 *
 * Reads from state, calls calculate(), then writes results
 * to the DOM. Nothing here knows how values were changed —
 * it only knows how to display them. Future views (journal,
 * charts) get their data from state/calc, not from here.
 */

import { state, saveState } from './state.js';
import { calculate }        from './calc.js';
import { data }              from './store.js';

// ── Helpers ───────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function setSliderFill(id) {
  const input = el(id);
  const pct   = (parseFloat(input.value) - parseFloat(input.min)) /
                (parseFloat(input.max)  - parseFloat(input.min)) * 100;
  input.style.setProperty('--fill', pct.toFixed(2) + '%');
}

// ── State mutations from UI controls ─────────────────────

export function setTrades(n) {
  state.tradesPerDay = n;
  [1, 2, 3].forEach(i =>
    el('tb' + i).classList.toggle('active', i === n)
  );
  saveState();
  render();
}

export function setRR(n) {
  state.rr = n;
  document.querySelectorAll('#rr-group .rr-btn').forEach(btn =>
    btn.classList.toggle('active', parseInt(btn.dataset.rr) === n)
  );
  saveState();
  render();
}

// ── Main render ───────────────────────────────────────────

export function render() {
  // Sync account inputs → state
  state.balance    = Math.max(100,  parseFloat(el('balance-input').value)  || 2000);
  state.dailyPct   = Math.min(100,  Math.max(0.1, parseFloat(el('daily-input').value)    || 5));
  state.maxlossPct = Math.min(100,  Math.max(0.1, parseFloat(el('maxloss-input').value)  || 10));
  state.targetPct  = Math.min(1000, Math.max(0.1, parseFloat(el('target-input').value)   || 8));

  // Sync slider inputs → state
  state.riskPct = parseFloat(el('risk-pct').value);
  state.slPips  = parseInt(el('sl-pips').value);

  // Update slider fill tracks
  setSliderFill('risk-pct');
  setSliderFill('sl-pips');

  // Update slider value labels
  el('risk-pct-val').textContent = state.riskPct.toFixed(2) + '%';
  el('sl-pips-val').textContent  = state.slPips + ' pips';

  // Run calculations (pure — no DOM access inside)
  const r = calculate(state);

  // ── Metric bar ────────────────────────────────────────
  el('m-balance').textContent      = '$' + state.balance.toLocaleString();
  el('m-daily').textContent        = '$' + r.dailyLimit.toFixed(0);
  el('m-max').textContent          = '$' + r.maxLoss.toFixed(0);
  el('m-target').textContent       = '$' + r.target.toFixed(0);
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
  el('m-max-label').textContent    = `Max loss (${state.maxlossPct}%)`;
  el('m-target-label').textContent = `Target (${state.targetPct}%)`;

  // ── Result cards ──────────────────────────────────────
  el('r-lot').textContent    = r.lotSize.toFixed(2);
  el('r-risk').textContent   = '$' + r.riskDollar.toFixed(2);
  el('r-tp').textContent     = r.tpPips + ' pips';
  el('r-profit').textContent = '$' + r.profit.toFixed(2);

  // Lot limit check
  const lotOk  = r.lotSize <= r.maxLot;
  const lotSub = el('r-lot-sub');
  lotSub.textContent = lotOk
    ? `max ${r.maxLot.toFixed(2)} lot`
    : `exceeds max ${r.maxLot.toFixed(2)} lot`;
  lotSub.style.color = lotOk ? 'var(--green)' : 'var(--red)';

  el('lot-card').classList.toggle('over-limit', !lotOk);
  el('r-lot').style.color = lotOk ? 'var(--gold)' : 'var(--red)';

  // Sub-labels
  el('r-risk-sub').textContent   = `${state.riskPct.toFixed(2)}% of balance`;
  el('r-tp-sub').textContent     = `at 1:${state.rr} R:R`;
  el('r-profit-sub').textContent = `${state.rr}\u00d7 risk`;

  saveState();
}

// ── Restore UI controls from saved state ─────────────────

export function restoreControls() {
  el('balance-input').value  = state.balance;
  el('daily-input').value    = state.dailyPct;
  el('maxloss-input').value  = state.maxlossPct;
  el('target-input').value   = state.targetPct;
  el('risk-pct').value       = state.riskPct;
  el('sl-pips').value        = state.slPips;

  document.querySelectorAll('#rr-group .rr-btn').forEach(btn =>
    btn.classList.toggle('active', parseInt(btn.dataset.rr) === state.rr)
  );
  [1, 2, 3].forEach(i =>
    el('tb' + i).classList.toggle('active', i === state.tradesPerDay)
  );
}
