/**
 * dashboard.js — Portfolio overview, strategy performance, and recent journal activity.
 */

import { data, strategyStats, setActiveAccount } from './store.js';
import { el, ACCOUNT_TYPES, ACCOUNT_STATUSES, initials, fmtMoney, fmtPct, fmtDate, fmtRelative, iconSVG, sparkline, equityCurve } from './utils.js';
import { go } from './router.js';
import { openAccountForm } from './accounts.js';
import { openStrategyForm } from './strategies.js';
import { openJournalForm, openJournalDetail } from './journal.js';
import { dashboardMiniCalendar } from './calendar.js';
import { emptyState } from './accounts.js';

const dashFilters = { journalAccount: 'all' };

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
      kpi(data.journals.length,  'Journal entries'),
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

  // ── Journal trade history ──
  root.appendChild(journalHistorySection());

  // ── Mini PnL calendar (current month) ──
  root.appendChild(dashboardMiniCalendar(dashFilters.journalAccount));
}

function kpi(v, l, tone) {
  return el('div', { class: 'kpi' + (tone ? ' kpi-' + tone : '') },
    el('div', { class: 'kpi-v' }, String(v)),
    el('div', { class: 'kpi-l' }, l)
  );
}

function totalCapital() {
  return data.accounts
    .filter(x => x.status === 'funded')
    .reduce((a, x) => a + (parseFloat(x.capital) || 0), 0);
}

function accountStripCard(a) {
  const type = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES['own-funds'];
  const status = ACCOUNT_STATUSES[a.status] || ACCOUNT_STATUSES.active;
  const isActive = data.activeAccountId === a.id;
  const pnl = (a.capital || 0) - (a.startingCapital || 0);
  const pnlPct = a.startingCapital ? (pnl / a.startingCapital) * 100 : 0;
  const maxLoss = a.rules?.maxLossPct ? (a.startingCapital * a.rules.maxLossPct / 100) : null;
  const ddUsed = a.startingCapital && maxLoss ? Math.min(100, Math.max(0, Math.abs(Math.min(0, pnl)) / maxLoss * 100)) : 0;

  return el('article', { class: 'strip-card status-' + (a.status || 'active') + (isActive ? ' is-active' : ''), onClick: () => go('accounts/' + a.id) },
    el('div', { class: 'strip-top' },
      el('div', { class: 'account-avatar', style: { background: type.bg, color: type.fg } }, initials(a.company || a.name)),
      el('div', { class: 'strip-top-meta' },
        el('div', { class: 'strip-name' }, a.name),
        el('div', { class: 'strip-type', style: { color: type.fg } }, type.label)
      ),
      el('div', { class: 'strip-status', title: status.label + ' account' },
        el('span', { class: 'status-dot', style: { background: status.color, boxShadow: '0 0 8px ' + status.color + '88' } }),
        el('span', { class: 'strip-status-label', style: { color: status.color } }, status.label)
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
    ),
    isActive
      ? el('div', { class: 'strip-active-pill' }, 'Active')
      : (a.status === 'passed' || a.status === 'blown')
        ? null
        : el('button', { class: 'strip-set-active', onClick: (e) => { e.stopPropagation(); setActiveAccount(a.id); } }, 'Set active')
  );
}

function winRateHue(winRate) {
  const t = Math.max(0, Math.min(100, winRate)) / 100;
  return t * 140;
}

function strategyMiniCard(s) {
  const st = strategyStats(s.id);
  const bts = data.journals.filter(b => b.strategyId === s.id);
  const curve = equityCurve(bts);

  const hasTrades = st.total > 0;
  const accent = hasTrades ? `hsl(${winRateHue(st.winRate)}, 72%, 56%)` : '#94A3B8';
  const tintBg = hasTrades ? `hsla(${winRateHue(st.winRate)}, 72%, 56%, 0.08)` : 'var(--surface)';
  const tintBorder = hasTrades ? `hsla(${winRateHue(st.winRate)}, 72%, 56%, 0.35)` : 'var(--border)';

  return el('article', { class: 'strat-mini', onClick: () => go('strategies/' + s.id), style: {
    '--c': accent,
    '--strat-bg': tintBg,
    '--strat-border': tintBorder,
  } },
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

function journalHistorySection() {
  const accountOptions = [{ value: 'all', label: 'All accounts' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))];
  const accountSelect = el('select', { class: 'filter-select dash-filter-select', onChange: (e) => { dashFilters.journalAccount = e.target.value; renderDashboardPage(); } });
  accountOptions.forEach(o => {
    const opt = el('option', { value: o.value }, o.label);
    if (dashFilters.journalAccount === o.value) opt.selected = true;
    accountSelect.appendChild(opt);
  });

  const section = el('section', { class: 'dash-section' },
    el('div', { class: 'dash-section-head' },
      el('h2', {}, 'Journal history'),
      el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
        accountSelect,
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('journal') }, 'View all'),
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => openJournalForm() },
          el('span', { html: iconSVG('plus') }), ' Add'
        )
      )
    )
  );

  if (!data.journals.length) {
    section.appendChild(el('div', { class: 'dash-empty' }, 'No journal entries yet. ',
      el('a', { href: '#', onClick: (e) => { e.preventDefault(); openJournalForm(); } }, 'Log your first trade')
    ));
    return section;
  }

  const recent = [...data.journals]
    .filter(b => dashFilters.journalAccount === 'all' || b.accountId === dashFilters.journalAccount)
    .sort((a, b) => (b.entryDate || b.createdAt || 0) - (a.entryDate || a.createdAt || 0))
    .slice(0, 12);

  if (!recent.length) {
    section.appendChild(el('div', { class: 'dash-empty' }, 'No journal entries for this account yet.'));
    return section;
  }

  const list = el('div', { class: 'journal-list' });
  recent.forEach(b => list.appendChild(journalRow(b)));
  section.appendChild(list);
  return section;
}

function journalRow(b) {
  const s = data.strategies.find(x => x.id === b.strategyId);
  const a = data.accounts.find(x => x.id === b.accountId);
  const amt = Math.abs(parseFloat(b.amount) || 0);
  const pnl = b.result === 'win' ? amt : b.result === 'loss' ? -amt : 0;
  const amtLabel = amt
    ? (pnl > 0 ? '+' : pnl < 0 ? '-' : '') + fmtMoney(Math.abs(pnl), { dp: 0 })
    : (b.rAchieved ? b.rAchieved + 'R' : '—');

  return el('div', { class: 'journal-row', onClick: () => openJournalDetail(b) },
    el('div', { class: 'journal-thumb' + (b.screenshotPath ? '' : ' empty'), style: b.screenshotPath ? { backgroundImage: `url(${b.screenshotPath})` } : {} },
      el('span', { class: 'journal-thumb-result ' + (b.result || 'be') }, (b.result || 'be').toUpperCase())
    ),
    el('div', { class: 'journal-body' },
      el('div', { class: 'journal-t' },
        s ? el('span', { class: 'journal-strat-dot', style: { background: s.color || '#F59E0B' } }) : null,
        el('span', {}, s?.name || 'No strategy')
      ),
      el('div', { class: 'journal-s' },
        el('span', {}, a ? a.name : 'Unassigned'),
        el('span', { class: 'dot-sep' }, '·'),
        el('span', {}, b.instrument || '—'),
        el('span', { class: 'dot-sep' }, '·'),
        el('span', {}, b.timeframe || '—'),
        el('span', { class: 'dot-sep' }, '·'),
        el('span', {}, (b.direction || 'long').toUpperCase())
      )
    ),
    el('div', { class: 'journal-pnl ' + (pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'be') }, amtLabel),
    el('div', { class: 'journal-ts' }, fmtRelative(b.entryDate || b.createdAt))
  );
}
