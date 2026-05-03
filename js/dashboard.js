/**
 * dashboard.js — Portfolio overview, strategy performance, and recent journal activity.
 */

import { data, strategyStats, setActiveAccount, journalStrategyIds, journalHasStrategy } from './store.js';
import { el, ACCOUNT_TYPES, ACCOUNT_STATUSES, initials, fmtMoney, fmtPct, fmtDate, fmtRelative, iconSVG, sparkline, equityCurve } from './utils.js';
import { winRateByGrade, disciplineViolations, skipRatio } from './discipline.js';
import { dailyCapBand } from './daily-cap-band.js';
import { go } from './router.js';
import { openAccountForm } from './accounts.js';
import { openStrategyForm } from './strategies.js';
import { openJournalForm, openJournalDetail } from './journal.js';
import { dashboardMiniCalendar } from './calendar.js';
import { emptyState } from './accounts.js';
import { pnlChartSection } from './pnl-chart.js';

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
      kpi(fmtMoney(totalCapital(), { dp: 0 }), 'Total prifit', 'gold')
    )
  ));

  // ── Daily cap band — hidden when active account is in safe state ──
  const band = dailyCapBand(active);
  if (band) root.appendChild(band);

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

  // ── Cumulative PnL chart ──
  root.appendChild(pnlChartSection());

  // ── Journal trade history ──
  root.appendChild(journalHistorySection());

  // ── Mini PnL calendar (current month) ──
  root.appendChild(dashboardMiniCalendar(dashFilters.journalAccount));

  // ── Discipline mini-widget ──
  root.appendChild(disciplineWidget());

  // ── Doctrine links + copyright ──
  root.appendChild(doctrineFooter());
}

function disciplineWidget() {
  const wr = winRateByGrade(data.plans, data.journals);
  const dv = disciplineViolations(data.plans, data.journals);
  const sr = skipRatio(data.plans, 30);

  return el('section', {
    class: 'card discipline-widget',
    onClick: () => go('plans'),
    style: { cursor: 'pointer', marginTop: '16px' },
  },
    el('div', { class: 'card-head' },
      el('h3', {}, 'Discipline'),
      el('span', { class: 'card-sub' }, 'Click to open Trade Plans →'),
    ),
    el('div', { class: 'discipline-widget-row' },
      miniStat('A win rate', wr.A.winRate.toFixed(0) + '%', wr.A.wins + 'W / ' + wr.A.losses + 'L'),
      miniStat('Skip ratio (30d)', sr.ratio ? (sr.ratio * 100).toFixed(0) + '%' : '—', sr.skipped + ' skipped'),
      miniStat('Violations', dv.count.toString(), '$' + dv.total.toFixed(0)),
    ),
  );
}

function miniStat(label, value, hint) {
  return el('div', { class: 'mini-stat' },
    el('div', { class: 'mini-stat-l' }, label),
    el('div', { class: 'mini-stat-v' }, value),
    el('div', { class: 'mini-stat-h' }, hint),
  );
}

function doctrineFooter() {
  const wrap = el('section', { class: 'dash-doctrine' },
    el('div', { class: 'doctrine-head' },
      el('div', { class: 'doctrine-eyebrow' }, 'Tyche Capital · Doctrine'),
      el('h2', { class: 'doctrine-title' }, 'The Manual & The Math')
    ),
    el('div', { class: 'doctrine-grid' },
      el('a', { class: 'doctrine-card', href: 'pages/blueprint.html', target: '_blank', rel: 'noopener' },
        el('div', { class: 'doctrine-card-mark' }, 'Manual · 01'),
        el('div', { class: 'doctrine-card-title' }, 'The Trading Manual'),
        el('div', { class: 'doctrine-card-body' }, 'Foundation, technical mastery, and the eight rules of ស្មារតីអង្គភាព.'),
        el('div', { class: 'doctrine-card-cta' }, 'Open blueprint →')
      ),
      el('a', { class: 'doctrine-card', href: 'pages/gold_risk_analysis.html', target: '_blank', rel: 'noopener' },
        el('div', { class: 'doctrine-card-mark' }, 'Brief · 02'),
        el('div', { class: 'doctrine-card-title' }, 'Gold Risk & R:R Analysis'),
        el('div', { class: 'doctrine-card-body' }, 'Optimal risk per trade for XAU/USD on HolaPrime — Kelly, drawdown, and execution plan.'),
        el('div', { class: 'doctrine-card-cta' }, 'Open brief →')
      ),
      el('a', { class: 'doctrine-card', href: 'pages/risk_approach_comparison.html', target: '_blank', rel: 'noopener' },
        el('div', { class: 'doctrine-card-mark' }, 'Study · 03'),
        el('div', { class: 'doctrine-card-title' }, 'Concentration vs Distribution'),
        el('div', { class: 'doctrine-card-body' }, 'One trade at 1% versus three trades at 0.33% — same daily exposure, different outcomes.'),
        el('div', { class: 'doctrine-card-cta' }, 'Open study →')
      ),
      el('a', { class: 'doctrine-card', href: '#doctrine/checklist' },
        el('div', { class: 'doctrine-card-mark' }, 'Checklist · 04'),
        el('div', { class: 'doctrine-card-title' }, 'Global Discipline Checklist'),
        el('div', { class: 'doctrine-card-body' }, 'Must-pass checks that apply to every Trade Plan — deal-breakers that auto-grade a plan SKIP when unticked.'),
        el('div', { class: 'doctrine-card-cta' }, 'Edit checklist →')
      )
    ),
    el('div', { class: 'doctrine-copy' },
      `© ${new Date().getFullYear()} Chhaynee Seak · Tyche Capital — Trading Management System`
    )
  );
  return wrap;
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
  const bts = data.journals.filter(b => journalHasStrategy(b, s.id));
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
  const strategies = journalStrategyIds(b).map(id => data.strategies.find(x => x.id === id)).filter(Boolean);
  const primary = strategies[0];
  const stratLabel = strategies.length
    ? strategies.map(s => s.name).join(' + ')
    : 'No strategy';
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
        primary ? el('span', { class: 'journal-strat-dot', style: { background: primary.color || '#F59E0B' } }) : null,
        el('span', {}, stratLabel)
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
