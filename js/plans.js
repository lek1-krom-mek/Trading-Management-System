/**
 * plans.js — Trade Plans workspace.
 *
 * Two top-level tabs:
 *   - Plans      (default)  — grouped list by status
 *   - Discipline (analytics)  — implemented later
 */

import {
  data, planById, accountById, strategyById,
  globalChecks, strategyChecks,
  savePlan, deletePlan, skipPlan,
} from './store.js';
import { el, iconSVG, fmtRelative, INSTRUMENTS, TIMEFRAMES, toast } from './utils.js';
import {
  openFormPanel, field, textInput, numberInput, textArea, select,
  toggleGroup, imageUpload, multiChips, readForm,
} from './forms.js';
import { computeGrade, checksForPlan } from './grading.js';
import { go } from './router.js';
import { uid } from './db.js';
import { openJournalForm } from './journal.js';
import {
  winRateByGrade, expectancyByGrade, disciplineViolations, skipRatio, topFailedChecks,
} from './discipline.js';

const TABS = [
  { id: 'list',       label: 'Plans' },
  { id: 'discipline', label: 'Discipline' },
];

let activeTab = 'list';

export function renderPlansPage() {
  const root = document.querySelector('[data-page="plans"]');
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Pre-trade discipline'),
      el('h1', { class: 'page-title' }, 'Trade Plans'),
      el('p', { class: 'page-sub' }, `${data.plans.length} plan${data.plans.length === 1 ? '' : 's'} logged — gate every trade with a checklist.`),
    ),
    el('button', { class: 'btn btn-primary', onClick: () => openPlanForm() },
      el('span', { html: iconSVG('plus') }), ' New Plan'),
  ));

  // Tabs
  const tabBar = el('div', { class: 'tab-bar' },
    ...TABS.map(t => el('button', {
      class: 'tab-btn ' + (activeTab === t.id ? 'active' : ''),
      onClick: () => { activeTab = t.id; renderPlansPage(); },
    }, t.label)));
  root.appendChild(tabBar);

  if (activeTab === 'list') renderListView(root);
  else renderDisciplineTab(root);
}

function renderListView(root) {
  if (!data.plans.length) {
    root.appendChild(el('div', { class: 'empty-inline' },
      'No plans yet. Click New Plan to gate your next trade.'));
    return;
  }

  const groups = {
    planned:  { label: 'Open',     plans: [] },
    executed: { label: 'Executed', plans: [] },
    skipped:  { label: 'Skipped',  plans: [] },
    draft:    { label: 'Drafts',   plans: [] },
    expired:  { label: 'Expired',  plans: [] },
  };
  for (const p of data.plans) (groups[p.status] || groups.draft).plans.push(p);

  for (const key of ['planned','executed','skipped','draft','expired']) {
    const g = groups[key];
    if (!g.plans.length) continue;
    root.appendChild(el('h2', { class: 'plans-group-title' },
      g.label, el('span', { class: 'plans-group-count' }, ` · ${g.plans.length}`)));
    const grid = el('div', { class: 'plans-grid' });
    g.plans.forEach(p => grid.appendChild(planCard(p)));
    root.appendChild(grid);
  }
}

function planCard(p) {
  const strategies = (p.strategyIds || []).map(strategyById).filter(Boolean);
  const a = accountById(p.accountId);

  return el('article', { class: 'plan-card', onClick: () => openPlanDetail(p) },
    el('div', { class: 'plan-card-head' },
      el('span', { class: 'grade-chip grade-' + (p.grade || 'C').toLowerCase() }, p.grade || '—'),
      el('span', { class: 'plan-instrument' }, p.instrument || '—'),
      el('span', { class: 'plan-direction ' + (p.direction || '') }, (p.direction || '').toUpperCase() || '—'),
    ),
    el('div', { class: 'plan-card-body' },
      el('div', { class: 'plan-card-row' },
        ...strategies.length
          ? strategies.map(s => el('span', {
              class: 'mini-chip',
              style: { background: s.color + '22', color: s.color, borderColor: s.color + '55' },
            }, s.name))
          : [el('span', { class: 'mini-chip' }, 'No strategy')]),
      el('div', { class: 'plan-card-foot' },
        el('span', {}, a ? a.name : 'Unassigned'),
        el('span', {}, p.plannedRr ? p.plannedRr.toFixed(2) + 'R planned' : ''),
        el('span', {}, fmtRelative(p.createdAt)),
      ),
      p.disciplineViolation
        ? el('div', { class: 'discipline-violation-tag' },
            el('span', { html: iconSVG('alert-triangle') || '!' }), ' Discipline violation')
        : null,
    ),
  );
}

function renderDisciplineTab(root) {
  const wr = winRateByGrade(data.plans, data.journals);
  const ex = expectancyByGrade(data.plans, data.journals);
  const dv = disciplineViolations(data.plans, data.journals);
  const sr = skipRatio(data.plans, 30);
  const top = topFailedChecks(data.plans, data.checks, 3);

  root.appendChild(el('div', { class: 'discipline-tiles' },
    tile('Skip ratio (30d)', sr.ratio ? (sr.ratio * 100).toFixed(0) + '%' : '—',
         sr.skipped + ' skipped · ' + sr.executed + ' executed'),
    tile('Discipline violations', dv.count.toString(),
         (dv.total >= 0 ? '+' : '') + '$' + dv.total.toFixed(0) + ' total'),
    tile('Plans (all time)', data.plans.length.toString(),
         data.plans.filter(p => p.status === 'executed').length + ' executed'),
  ));

  root.appendChild(el('h3', { class: 'discipline-section-title' }, 'Win rate by grade'));
  root.appendChild(barChart(['A','B','C','SKIP'].map(g => ({
    label: g, value: wr[g].winRate, hint: wr[g].wins + 'W / ' + wr[g].losses + 'L',
  }))));

  root.appendChild(el('h3', { class: 'discipline-section-title' }, 'Expectancy ($/trade) by grade'));
  root.appendChild(barChart(['A','B','C','SKIP'].map(g => ({
    label: g,
    value: ex[g].expectancy,
    hint: '$' + ex[g].total.toFixed(0) + ' over ' + ex[g].count,
    signed: true,
  }))));

  root.appendChild(el('h3', { class: 'discipline-section-title' }, 'Top failed checks'));
  if (!top.length) {
    root.appendChild(el('div', { class: 'empty-inline' }, 'No SKIP-graded plans yet.'));
  } else {
    const list = el('div', { class: 'top-failed-list' });
    top.forEach(t => list.appendChild(el('div', { class: 'top-failed-row' },
      el('span', { class: 'top-failed-count' }, '×' + t.count),
      el('span', { class: 'top-failed-label' }, t.check?.label || '(removed check)'),
    )));
    root.appendChild(list);
  }
}

function tile(label, value, hint) {
  return el('div', { class: 'discipline-tile' },
    el('div', { class: 'discipline-tile-l' }, label),
    el('div', { class: 'discipline-tile-v' }, value),
    el('div', { class: 'discipline-tile-h' }, hint));
}

function barChart(rows) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value || 0)));
  const wrap = el('div', { class: 'bar-chart' });
  rows.forEach(r => {
    const isSigned = r.signed;
    const v = r.value || 0;
    const pct = (Math.abs(v) / max) * 100;
    const negative = isSigned && v < 0;
    wrap.appendChild(el('div', { class: 'bar-row' },
      el('div', { class: 'bar-label' }, r.label),
      el('div', { class: 'bar-track' },
        el('div', {
          class: 'bar-fill grade-' + r.label.toLowerCase() + (negative ? ' negative' : ''),
          style: { width: pct + '%' },
        })),
      el('div', { class: 'bar-value' }, isSigned
        ? (v >= 0 ? '+' : '') + '$' + v.toFixed(0)
        : v.toFixed(0) + '%'),
      el('div', { class: 'bar-hint' }, r.hint || ''),
    ));
  });
  return wrap;
}

export function openPlanForm(existing = null) {
  const p = existing || {
    direction: 'long',
    timeframe: 'H1',
    instrument: 'XAU/USD',
    strategyIds: [],
    accountId: data.activeAccountId || null,
    status: 'draft',
    checkResults: {},
  };

  const stratOpts = data.strategies.map(s => ({ value: s.id, label: s.name }));
  const acctOpts = [{ value: '', label: '— Unassigned —' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))];

  const localState = {
    strategyIds: [...(p.strategyIds || [])],
    plannedEntry: p.plannedEntry ?? null,
    plannedSl:    p.plannedSl    ?? null,
    plannedTp:    p.plannedTp    ?? null,
    checkResults: { ...(p.checkResults || {}) },
  };

  const gradeChip = el('span', { class: 'grade-chip grade-c' }, '—');
  const rrDisplay = el('span', { class: 'rr-display' }, '—');

  const checklistMount = el('div', { class: 'plan-checklist' });

  function rebuildChecklistMount() {
    checklistMount.innerHTML = '';
    const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
    const checks = checksForPlan(globalChecks(), byStrategy, localState.strategyIds);

    if (!checks.length) {
      checklistMount.appendChild(el('div', { class: 'form-empty-note' },
        'No checks configured. Add global checks in Doctrine or per-strategy checks in the Strategies workspace.'));
      return;
    }

    checks.forEach(c => {
      const id = c.id;
      const checked = !!localState.checkResults[id];
      const cb = el('input', { type: 'checkbox', checked });
      cb.addEventListener('change', () => {
        localState.checkResults[id] = cb.checked;
        updateGrade();
      });
      checklistMount.appendChild(el('label', {
        class: 'plan-check-row ' + (c.mustPass ? 'must-pass' : ''),
        title: c.description || '',
      },
        cb,
        el('span', { class: 'plan-check-label' }, c.label),
        c.mustPass ? el('span', { class: 'mini-chip danger' }, 'must-pass') : null,
      ));
    });

    updateGrade();
  }

  function updateGrade() {
    const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
    const checks = checksForPlan(globalChecks(), byStrategy, localState.strategyIds);
    const g = computeGrade(localState.checkResults, checks);
    gradeChip.textContent = g;
    gradeChip.className = 'grade-chip grade-' + g.toLowerCase();
  }

  function updateRR() {
    const e = parseFloat(localState.plannedEntry), sl = parseFloat(localState.plannedSl), tp = parseFloat(localState.plannedTp);
    if (!isFinite(e) || !isFinite(sl) || !isFinite(tp) || e === sl) {
      rrDisplay.textContent = '—';
      return null;
    }
    const rr = Math.abs(e - tp) / Math.abs(e - sl);
    rrDisplay.textContent = rr.toFixed(2) + 'R';
    return rr;
  }

  const stratChips = stratOpts.length
    ? multiChips({ name: 'strategyIds', values: localState.strategyIds, options: stratOpts })
    : el('div', { class: 'form-empty-note' }, 'Create a strategy first.');
  if (stratChips.querySelector) {
    stratChips.addEventListener('click', () => {
      const hidden = stratChips.querySelector('input[type=hidden]');
      if (hidden) {
        const v = hidden.value;
        localState.strategyIds = v ? v.split(',').filter(Boolean) : [];
        rebuildChecklistMount();
      }
    });
  }

  const entryInput = numberInput({ name: 'plannedEntry', value: p.plannedEntry ?? '', step: 0.0001, placeholder: 'e.g. 2410.50' });
  const slInput    = numberInput({ name: 'plannedSl',    value: p.plannedSl    ?? '', step: 0.0001, placeholder: 'e.g. 2407.20' });
  const tpInput    = numberInput({ name: 'plannedTp',    value: p.plannedTp    ?? '', step: 0.0001, placeholder: 'e.g. 2418.00' });
  [entryInput, slInput, tpInput].forEach(inp => {
    inp.addEventListener('input', () => {
      const key = inp.name;
      localState[key] = parseFloat(inp.value);
      updateRR();
    });
  });

  const body = el('div', {},
    el('div', { class: 'plan-grade-banner' },
      el('span', {}, 'Live grade'), gradeChip,
      el('span', { class: 'rr-label' }, 'Planned RR'), rrDisplay,
    ),
    field('Strategies', stratChips, 'Tap one or more — checklist below merges from globals + each strategy.'),
    field('Account', select({ name: 'accountId', value: p.accountId || '', options: acctOpts })),
    el('div', { class: 'form-row' },
      field('Instrument', select({ name: 'instrument', value: p.instrument || 'XAU/USD',
        options: INSTRUMENTS.map(i => ({ value: i, label: i })) })),
      field('Timeframe',  select({ name: 'timeframe',  value: p.timeframe || 'H1',
        options: TIMEFRAMES.map(t => ({ value: t, label: t })) })),
    ),
    field('Direction', toggleGroup({ name: 'direction', value: p.direction || 'long', options: [
      { value: 'long', label: 'Long' }, { value: 'short', label: 'Short' },
    ] })),
    el('div', { class: 'form-row' },
      field('Planned entry', entryInput),
      field('Stop loss',     slInput),
      field('Take profit',   tpInput),
    ),
    field('Risk %', numberInput({ name: 'riskPct', value: p.riskPct ?? '', step: 0.1, min: 0, max: 100, placeholder: 'e.g. 1' })),
    field('Checklist', checklistMount, 'Tick what is true right now. Must-pass checks are deal-breakers.'),
    field('Pre-mortem', textArea({ name: 'premortem', value: p.premortem || '', rows: 3, placeholder: 'What would invalidate this trade? What could go wrong?' })),
    field('Setup screenshot', imageUpload({ name: 'screenshotPath', value: p.screenshotPath || '' })),
  );

  rebuildChecklistMount();
  updateRR();

  openFormPanel({
    title: existing ? 'Edit plan' : 'New trade plan',
    body,
    submitLabel: existing ? 'Save changes' : 'Save plan',
    onDelete: existing ? async () => { await deletePlan(existing.id); toast('Plan deleted'); } : null,
    onSubmit: async (form) => {
      const raw = readForm(form, ['strategyIds']);
      const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
      const checks = checksForPlan(globalChecks(), byStrategy, localState.strategyIds);
      const grade = computeGrade(localState.checkResults, checks);

      const obj = {
        ...p,
        id: p.id || uid(),
        strategyIds: localState.strategyIds,
        accountId: raw.accountId || null,
        instrument: raw.instrument,
        timeframe: raw.timeframe,
        direction: raw.direction,
        plannedEntry: parseFloat(raw.plannedEntry) || null,
        plannedSl:    parseFloat(raw.plannedSl)    || null,
        plannedTp:    parseFloat(raw.plannedTp)    || null,
        plannedRr:    updateRR(),
        riskPct:      parseFloat(raw.riskPct)      || null,
        checkResults: { ...localState.checkResults },
        grade,
        status: 'planned',
        premortem: raw.premortem,
        screenshotPath: raw.screenshotPath || p.screenshotPath || '',
      };
      await savePlan(obj);
      toast(existing ? 'Plan updated' : `Plan saved · grade ${grade}`);
    },
  });
}

export function openPlanDetail(p) {
  const strategies = (p.strategyIds || []).map(strategyById).filter(Boolean);
  const a = accountById(p.accountId);
  const byStrategy = new Map(data.strategies.map(s => [s.id, strategyChecks(s.id)]));
  const checks = checksForPlan(globalChecks(), byStrategy, p.strategyIds || []);

  const overlay = el('div', { class: 'bt-detail-overlay' });
  function close() { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); }

  const actionsBar = el('div', { class: 'bt-detail-actions' },
    p.status === 'planned'
      ? el('button', { class: 'btn btn-primary btn-sm',
          onClick: async () => { close(); openExecuteFlow(p); } },
          'Mark executed → log result')
      : null,
    p.status === 'planned'
      ? el('button', { class: 'btn btn-ghost btn-sm',
          onClick: async () => {
            if (!confirm('Mark this plan as skipped?')) return;
            await skipPlan(p.id); toast('Plan skipped'); close();
          } },
          el('span', { html: iconSVG('x') || '×' }), ' Skip')
      : null,
    el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { close(); openPlanForm(p); } },
      el('span', { html: iconSVG('edit') }), ' Edit'),
    el('button', { class: 'icon-btn', onClick: close, 'aria-label': 'Close' },
      el('span', { html: iconSVG('close') })),
  );

  const checkRows = checks.map(c => {
    const ticked = p.checkResults?.[c.id] === true;
    return el('div', { class: 'plan-check-detail-row ' + (ticked ? 'ticked' : 'unticked') },
      el('span', { class: 'plan-check-mark' }, ticked ? '✓' : '✗'),
      el('span', { class: 'plan-check-label' }, c.label),
      c.mustPass ? el('span', { class: 'mini-chip danger' }, 'must-pass') : null,
    );
  });

  const modal = el('div', { class: 'bt-detail-modal' },
    el('div', { class: 'bt-detail-header' },
      el('div', {},
        el('div', { class: 'bt-detail-title' },
          el('span', { class: 'grade-chip grade-' + (p.grade || 'c').toLowerCase() }, p.grade || '—'),
          ' ', strategies.length ? strategies.map(s => s.name).join(' + ') : 'No strategy'),
        el('div', { class: 'bt-detail-sub' },
          `${p.instrument || '—'} · ${p.timeframe || '—'} · ${(p.direction || '').toUpperCase()} · ${fmtRelative(p.createdAt)}`),
        p.disciplineViolation
          ? el('div', { class: 'discipline-violation-tag', style: { marginTop: '8px' } },
              'Discipline violation — executed despite SKIP grade')
          : null,
      ),
      actionsBar,
    ),
    p.screenshotPath
      ? el('div', { class: 'bt-detail-image' }, el('img', { src: p.screenshotPath, alt: '' }))
      : null,
    el('div', { class: 'bt-detail-meta' },
      metaPill('Status', (p.status || '—').toUpperCase()),
      metaPill('Account', a?.name || 'Unassigned'),
      metaPill('Risk %', p.riskPct ? p.riskPct + '%' : '—'),
      metaPill('Planned RR', p.plannedRr ? p.plannedRr.toFixed(2) + 'R' : '—'),
    ),
    el('div', { class: 'bt-detail-body' },
      el('h4', {}, 'Checklist'),
      el('div', { class: 'plan-check-detail' }, ...checkRows),
      p.premortem
        ? el('div', {}, el('h4', {}, 'Pre-mortem'), el('p', {}, p.premortem))
        : null,
    ),
  );

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function metaPill(label, value) {
  return el('div', { class: 'meta-pill' },
    el('div', { class: 'meta-pill-l' }, label),
    el('div', { class: 'meta-pill-v' }, value),
  );
}

function openExecuteFlow(p) {
  // Open the existing journal form pre-filled from the plan.
  // savejournal callback in journal.js will call executePlan() when planId is set.
  openJournalForm(null, {
    planId: p.id,
    strategyIds: [...(p.strategyIds || [])],
    accountId: p.accountId || null,
    instrument: p.instrument || 'XAU/USD',
    timeframe: p.timeframe || 'H1',
    direction: p.direction || 'long',
    screenshotPath: p.screenshotPath || '',
  });
}
