/**
 * main.js — Entry point. Boots the DB, router, and calculator.
 */

import { loadState, state, saveState }  from './state.js';
import { render, restoreControls,
         setTrades, setRR }              from './ui.js';
import { initTheme, toggleTheme }        from './theme.js';
import { initBackground }                from './background.js';

import { loadAll, data, subscribe,
         setActiveAccount }              from './store.js';
import { register, initRouter, current, go } from './router.js';
import { renderDashboardPage }           from './dashboard.js';
import { renderAccountsPage, renderAccountDetail, openAccountForm } from './accounts.js';
import { renderStrategiesPage, renderStrategyDetail, openStrategyForm } from './strategies.js';
import { renderJournalPage, openJournalForm } from './journal.js';
import { el, fmtMoney, fmtPct, ACCOUNT_TYPES, initials } from './utils.js';
import { db, uid } from './db.js';

// Expose inline handlers (calculator uses onclick in JSX-free HTML)
window.setTrades   = setTrades;
window.setRR       = setRR;
window.toggleTheme = toggleTheme;

// ── Register routes ─────────────────────────────────────
register('dashboard',   renderDashboardPage);
register('accounts',    (param) => param ? renderAccountDetail(param) : renderAccountsPage());
register('strategies',  (param) => param ? renderStrategyDetail(param) : renderStrategiesPage());
register('journal',     renderJournalPage);
register('calculator',  () => { renderCalcMeta(); });

function renderCalcMeta() {
  const sub = document.getElementById('calc-page-sub');
  const active = data.accounts.find(a => a.id === data.activeAccountId);
  if (active) sub.textContent = `Synced with ${active.name} — ${fmtMoney(active.capital || 0, { dp: 0 })}.`;
  else        sub.textContent = 'XAU/USD lot sizing — add an account to auto-sync balance.';
}

// ── Sidebar rendering ───────────────────────────────────
function renderSidebar() {
  const active = data.accounts.find(a => a.id === data.activeAccountId);
  const nameEl  = document.getElementById('sa-name');
  const balEl   = document.getElementById('sa-bal');
  const deltaEl = document.getElementById('sa-delta');
  if (!active) {
    nameEl.textContent = 'No account selected';
    balEl.textContent  = fmtMoney(0, { dp: 0 });
    deltaEl.textContent = '—';
    deltaEl.className = 'sa-delta';
    return;
  }
  const type = ACCOUNT_TYPES[active.type] || ACCOUNT_TYPES['own-funds'];
  nameEl.textContent = active.name;
  nameEl.style.color = type.fg;
  balEl.textContent = fmtMoney(active.capital || 0, { dp: 0 });
  const pnl = (active.capital || 0) - (active.startingCapital || 0);
  const pnlPct = active.startingCapital ? (pnl / active.startingCapital) * 100 : 0;
  deltaEl.textContent = `${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, { dp: 0 })} · ${fmtPct(pnlPct, 2)}`;
  deltaEl.className = 'sa-delta ' + (pnl >= 0 ? 'pos' : 'neg');
}

// Sidebar add button adapts to current page
function updateAddButton() {
  const route = current() || { name: 'dashboard' };
  const label = document.getElementById('sidebar-add-label');
  const map = {
    dashboard: 'Quick Add',
    accounts:  'Add Account',
    strategies:'Add Strategy',
    journal:   'Add Journal',
    calculator: 'Add Account',
  };
  label.textContent = map[route.name] || 'Add New';
}

function closeMobileSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
  document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
}

function onAddClick() {
  const route = current() || { name: 'dashboard' };
  switch (route.name) {
    case 'accounts':    openAccountForm();   break;
    case 'strategies':  openStrategyForm();  break;
    case 'journal':     openJournalForm();   break;
    case 'calculator':
    case 'dashboard':
    default:            openAccountForm();   break;
  }
}

// ── Calculator input wiring ────────────────────────────
function clampPct(id, max) {
  const inputEl = document.getElementById(id);
  const v = parseFloat(inputEl.value);
  if (!isNaN(v) && v > max) inputEl.value = max;
  render();
}

function bindInputs() {
  document.getElementById('balance-input').addEventListener('input', render);
  document.getElementById('daily-input')  .addEventListener('input', () => clampPct('daily-input',   100));
  document.getElementById('maxloss-input').addEventListener('input', () => clampPct('maxloss-input', 100));
  document.getElementById('target-input') .addEventListener('input', () => clampPct('target-input',  1000));
  document.getElementById('risk-pct')     .addEventListener('input', render);
  document.getElementById('sl-pips')      .addEventListener('input', render);
  // RR and trades buttons: wire via delegation (replaces onclick)
  document.querySelectorAll('#rr-group .rr-btn').forEach(btn =>
    btn.addEventListener('click', () => setRR(parseInt(btn.dataset.rr)))
  );
  ['tb1','tb2','tb3'].forEach((id, i) =>
    document.getElementById(id).addEventListener('click', () => setTrades(i + 1))
  );

  document.getElementById('calc-sync-btn').addEventListener('click', syncCalcWithActiveAccount);
}

function syncCalcWithActiveAccount() {
  const a = data.accounts.find(x => x.id === data.activeAccountId);
  if (!a) return;
  state.balance = a.capital || state.balance;
  if (a.rules?.dailyLossPct) state.dailyPct   = a.rules.dailyLossPct;
  if (a.rules?.maxLossPct)   state.maxlossPct = a.rules.maxLossPct;
  if (a.rules?.targetPct)    state.targetPct  = a.rules.targetPct;
  if (a.rules?.maxRiskPct)   state.riskPct    = Math.min(3, a.rules.maxRiskPct);
  saveState();
  restoreControls();
  render();
  renderCalcMeta();
}

// ── One-time cleanup migration ──────────────────────────
// Earlier builds seeded sample strategies + journals. Wipe those for any
// existing user so "Attached strategies" and the journals list start clean.
async function cleanupSeededSamples() {
  if (localStorage.getItem('tms-cleaned-seeds-v1')) return;
  const SEEDED_STRATS = new Set(['London OB Retracement', 'NY FVG Fill', 'HTF CHoCH Reversal']);
  try {
    const strats = await db.getAll('strategies');
    const staleIds = new Set(strats.filter(s => SEEDED_STRATS.has(s.name)).map(s => s.id));
    if (staleIds.size) {
      for (const id of staleIds) await db.del('strategies', id);
      const bts = await db.getAll('journals');
      for (const b of bts) if (staleIds.has(b.strategyId)) await db.del('journals', b.id);
      const accs = await db.getAll('accounts');
      for (const a of accs) {
        if (Array.isArray(a.strategyIds) && a.strategyIds.some(id => staleIds.has(id))) {
          a.strategyIds = a.strategyIds.filter(id => !staleIds.has(id));
          await db.put('accounts', a);
        }
      }
    }
  } catch {}
  localStorage.setItem('tms-cleaned-seeds-v1', '1');
}

// ── Seed demo data ──────────────────────────────────────
async function seedIfEmpty() {
  if (data.accounts.length || data.strategies.length || data.journals.length) return;

  // Seed a few demo accounts only (no strategies, no journals).
  // The user will attach their own strategies as they create them.
  const acc1 = { id: uid(), name: 'FTMO 100K — Phase 1', type: 'prop-challenge',
    company: 'FTMO', accountNumber: '1520342', status: 'active',
    startingCapital: 100000, capital: 103420,
    tier: '100K', phase: 'phase1',
    rules: { dailyLossPct: 5, maxLossPct: 10, targetPct: 8, maxLot: 10, maxRiskPct: 1 },
    strategyIds: [],
    createdAt: Date.now() - 8640000 * 9 };
  const acc2 = { id: uid(), name: 'The Funded Trader — Instant 25K', type: 'prop-instant',
    company: 'Funded Trader', accountNumber: '8831209', status: 'active',
    startingCapital: 25000, capital: 25840,
    rules: { dailyLossPct: 3, maxLossPct: 6, payoutSchedule: 'biweekly', payoutSplit: 90 },
    strategyIds: [],
    createdAt: Date.now() - 8640000 * 5 };
  const acc3 = { id: uid(), name: 'Personal Portfolio', type: 'own-funds',
    company: 'IC Markets', status: 'active',
    startingCapital: 15000, capital: 16220,
    riskAppetite: 'moderate',
    rules: { dailyLossPct: 3 },
    strategyIds: [],
    createdAt: Date.now() - 8640000 * 3 };
  const acc4 = { id: uid(), name: 'GoldPulse EA — Live', type: 'ea-robot',
    company: 'Pepperstone', status: 'paused',
    startingCapital: 5000, capital: 4720,
    eaName: 'GoldPulse v2.3', broker: 'Pepperstone', vps: 'ForexVPS-London',
    rules: { dailyLossPct: 5, maxLot: 0.5 },
    strategyIds: [],
    createdAt: Date.now() - 8640000 * 1 };
  for (const a of [acc1, acc2, acc3, acc4]) await db.put('accounts', a);
}

// ── Boot ────────────────────────────────────────────────
async function boot() {
  loadState();
  initTheme();
  initBackground();
  restoreControls();
  bindInputs();
  render();

  // Wire the sidebar/nav/theme buttons
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => { go(btn.dataset.nav); closeMobileSidebar(); })
  );
  document.getElementById('sidebar-add').addEventListener('click', () => { onAddClick(); closeMobileSidebar(); });
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('sidebar-account').addEventListener('click', () => { go('accounts'); closeMobileSidebar(); });

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  menuBtn?.addEventListener('click', () => {
    const isOpen = document.getElementById('app-sidebar').classList.toggle('open');
    backdrop?.classList.toggle('open', isOpen);
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });
  backdrop?.addEventListener('click', closeMobileSidebar);

  // One-time cleanup for pre-fix visitors who got duplicate seed rows
  if (!localStorage.getItem('tms-seed-v2')) {
    try {
      const req = indexedDB.deleteDatabase('tms-db');
      await new Promise(res => { req.onsuccess = req.onerror = req.onblocked = res; });
    } catch {}
    localStorage.removeItem('tms-seeded');
    localStorage.setItem('tms-seed-v2', '1');
  }

  await loadAll();
  await cleanupSeededSamples();
  await loadAll();
  if (!localStorage.getItem('tms-seeded') && !data.accounts.length && !data.strategies.length && !data.journals.length) {
    await seedIfEmpty();
    localStorage.setItem('tms-seeded', '1');
    await loadAll();
  }

  // Subscribe — re-render whatever page is visible when data changes
  subscribe(() => {
    renderSidebar();
    updateAddButton();
    const r = current();
    if (!r) return;
    const routes = {
      dashboard: renderDashboardPage,
      accounts:  () => r.param ? renderAccountDetail(r.param) : renderAccountsPage(),
      strategies: () => r.param ? renderStrategyDetail(r.param) : renderStrategiesPage(),
      journal:   renderJournalPage,
      calculator: renderCalcMeta,
    };
    routes[r.name]?.();
  });

  initRouter();
  renderSidebar();
  updateAddButton();

  // Watch hash changes to update the add-button label
  window.addEventListener('hashchange', updateAddButton);
}

boot();
