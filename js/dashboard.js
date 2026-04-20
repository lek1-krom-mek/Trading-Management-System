/**
 * dashboard.js — Aggregate view of accounts, strategies, and recent activity.
 * Also hosts the inline risk calculator widget.
 */

import { data, strategyStats, setActiveAccount } from './store.js';
import { el, ACCOUNT_TYPES, initials, fmtMoney, fmtPct, fmtDate, fmtRelative, iconSVG, sparkline, equityCurve } from './utils.js';
import { go } from './router.js';
import { openAccountForm } from './accounts.js';
import { openStrategyForm } from './strategies.js';
import { openBacktestForm } from './backtesting.js';
import { emptyState } from './accounts.js';

export function renderDashboardPage() {
  const root = document.querySelector('[data-page="dashboard"]');
  root.innerHTML = '';

  // ── Head ──
  const active = data.accounts.find(a => a.id === data.activeAccountId);
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Overview'),
      el('h1', { class: 'page-title' }, 'Dashboard'),
      el('p', { class: 'page-sub' }, active
        ? `Active: ${active.name} · ${fmtMoney(active.capital || 0, { dp: 0 })}`
        : 'No active account — create one to get started.')
    ),
    el('div', { class: 'kpi-strip' },
      kpi(data.accounts.length,   'Accounts'),
      kpi(data.strategies.length, 'Strategies'),
      kpi(data.backtests.length,  'Backtests'),
      kpi(fmtMoney(totalCapital(), { dp: 0 }), 'Total capital', 'gold')
    )
  ));

  // ── Account strip ──
  const accSection = el('section', { class: 'dash-section' },
    el('div', { class: 'dash-section-head' },
      el('h2', {}, 'Portfolio accounts'),
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openAccountForm() },
        el('span', { html: iconSVG('plus') }), ' Add'
      )
    )
  );
  if (!data.accounts.length) {
    accSection.appendChild(el('div', { class: 'dash-empty' }, 'No accounts yet. ',
      el('a', { href: '#', onClick: (e) => { e.preventDefault(); openAccountForm(); } }, 'Add one')
    ));
  } else {
    const scroller = el('div', { class: 'account-scroller' });
    data.accounts.forEach(a => scroller.appendChild(accountStripCard(a)));
    accSection.appendChild(scroller);
  }
  root.appendChild(accSection);

  // ── Strategy performance grid ──
  const stratSection = el('section', { class: 'dash-section' },
    el('div', { class: 'dash-section-head' },
      el('h2', {}, 'Strategy win rate'),
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openStrategyForm() },
        el('span', { html: iconSVG('plus') }), ' Add'
      )
    )
  );
  if (!data.strategies.length) {
    stratSection.appendChild(el('div', { class: 'dash-empty' }, 'No strategies defined yet.'));
  } else {
    const grid = el('div', { class: 'strategy-mini-grid' });
    data.strategies.forEach(s => grid.appendChild(strategyMiniCard(s)));
    stratSection.appendChild(grid);
  }
  root.appendChild(stratSection);

  // ── Activity feed + calculator row ──
  const twoCol = el('div', { class: 'dash-two-col' },
    activityPanel(),
    calculatorPanel()
  );
  root.appendChild(twoCol);
}

function kpi(v, l, tone) {
  return el('div', { class: 'kpi' + (tone ? ' kpi-' + tone : '') },
    el('div', { class: 'kpi-v' }, String(v)),
    el('div', { class: 'kpi-l' }, l)
  );
}

function totalCapital() {
  return data.accounts.reduce((a, x) => a + (parseFloat(x.capital) || 0), 0);
}

function accountStripCard(a) {
  const type = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES['own-funds'];
  const isActive = data.activeAccountId === a.id;
  const pnl = (a.capital || 0) - (a.startingCapital || 0);
  const pnlPct = a.startingCapital ? (pnl / a.startingCapital) * 100 : 0;
  const dailyLimit = a.rules?.dailyLossPct ? (a.capital * a.rules.dailyLossPct / 100) : null;
  const maxLoss = a.rules?.maxLossPct ? (a.startingCapital * a.rules.maxLossPct / 100) : null;
  const ddUsed = a.startingCapital && maxLoss ? Math.min(100, Math.max(0, Math.abs(Math.min(0, pnl)) / maxLoss * 100)) : 0;

  return el('article', { class: 'strip-card' + (isActive ? ' is-active' : ''), onClick: () => go('accounts/' + a.id) },
    el('div', { class: 'strip-top' },
      el('div', { class: 'account-avatar', style: { background: type.bg, color: type.fg } }, initials(a.company || a.name)),
      el('div', {},
        el('div', { class: 'strip-name' }, a.name),
        el('div', { class: 'strip-type', style: { color: type.fg } }, type.label)
      )
    ),
    el('div', { class: 'strip-bal' }, fmtMoney(a.capital || 0, { dp: 0 })),
    el('div', { class: 'strip-pnl ' + (pnl >= 0 ? 'pos' : 'neg') },
      (pnl >= 0 ? '+' : '') + fmtMoney(pnl, { dp: 0 }) + ' · ' + fmtPct(pnlPct, 2)
    ),
    el('div', { class: 'strip-dd' },
      el('div', { class: 'strip-dd-l' }, `DD used ${ddUsed.toFixed(0)}%`),
      el('div', { class: 'strip-dd-bar' },
        el('div', { class: 'strip-dd-fill', style: { width: ddUsed + '%' } })
      )
    )
  );
}

function strategyMiniCard(s) {
  const st = strategyStats(s.id);
  const bts = data.backtests.filter(b => b.strategyId === s.id);
  const curve = equityCurve(bts);
  return el('article', { class: 'strat-mini', onClick: () => go('strategies/' + s.id), style: { '--c': s.color || '#F59E0B' } },
    el('div', { class: 'strat-mini-head' },
      el('span', { class: 'color-swatch-sm', style: { background: s.color } }),
      el('div', { class: 'strat-mini-name' }, s.name),
      el('span', { class: 'strat-mini-wr' }, st.total ? fmtPct(st.winRate, 0) : '—')
    ),
    el('div', { class: 'strat-mini-sub' },
      el('span', {}, `${st.total} trades`),
      el('span', {}, st.avgR ? st.avgR.toFixed(2) + 'R' : '—'),
      el('span', {}, st.profitFactor ? 'PF ' + st.profitFactor.toFixed(2) : '—')
    ),
    el('div', { class: 'strat-mini-spark' }, sparkline(curve, 240, 34, s.color))
  );
}

function activityPanel() {
  const card = el('section', { class: 'card' },
    el('div', { class: 'card-label' }, 'Recent activity')
  );
  const items = [
    ...data.backtests.map(b => ({ kind: 'bt', ts: b.createdAt, obj: b })),
    ...data.accounts.map(a => ({ kind: 'acct', ts: a.createdAt, obj: a })),
    ...data.strategies.map(s => ({ kind: 'strat', ts: s.createdAt, obj: s })),
  ].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 12);

  if (!items.length) {
    card.appendChild(el('div', { class: 'muted-text', style: { padding: '8px 0' } }, 'No activity yet.'));
    return card;
  }
  const list = el('div', { class: 'activity-list' });
  for (const it of items) {
    list.appendChild(activityRow(it));
  }
  card.appendChild(list);
  return card;
}

function activityRow({ kind, ts, obj }) {
  if (kind === 'bt') {
    const s = data.strategies.find(x => x.id === obj.strategyId);
    const a = data.accounts.find(x => x.id === obj.accountId);
    return el('div', { class: 'activity-row' },
      el('div', { class: 'activity-dot ' + (obj.result || 'be') }),
      el('div', { class: 'activity-body' },
        el('div', { class: 'activity-t' }, `Backtest · ${s?.name || 'Strategy'} — ${(obj.result || 'BE').toUpperCase()} ${obj.rAchieved ? obj.rAchieved + 'R' : ''}`),
        el('div', { class: 'activity-s' }, `${obj.instrument || '—'} · ${obj.timeframe || '—'}${a ? ' · ' + a.name : ''}`)
      ),
      el('span', { class: 'activity-ts' }, fmtRelative(ts))
    );
  }
  if (kind === 'acct') {
    const type = ACCOUNT_TYPES[obj.type] || ACCOUNT_TYPES['own-funds'];
    return el('div', { class: 'activity-row' },
      el('div', { class: 'activity-dot', style: { background: type.fg } }),
      el('div', { class: 'activity-body' },
        el('div', { class: 'activity-t' }, `Account created · ${obj.name}`),
        el('div', { class: 'activity-s' }, `${type.label} · ${fmtMoney(obj.startingCapital, { dp: 0 })}`)
      ),
      el('span', { class: 'activity-ts' }, fmtRelative(ts))
    );
  }
  return el('div', { class: 'activity-row' },
    el('div', { class: 'activity-dot', style: { background: obj.color } }),
    el('div', { class: 'activity-body' },
      el('div', { class: 'activity-t' }, `Strategy added · ${obj.name}`),
      el('div', { class: 'activity-s' }, (obj.timeframes || []).join(', ') || '—')
    ),
    el('span', { class: 'activity-ts' }, fmtRelative(ts))
  );
}

function calculatorPanel() {
  // Host the existing calculator markup, collapsed by default
  const card = el('section', { class: 'card calc-host' },
    el('div', { class: 'card-head-row' },
      el('div', { class: 'card-label' }, 'Risk calculator'),
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('calculator') }, 'Open full')
    ),
    el('div', { class: 'calc-desc' }, 'XAU/USD lot sizing — inherits the active account balance automatically.'),
    el('div', { id: 'dash-calc-mount' }, 'Use the Calculator tab for the full tool.')
  );
  return card;
}
