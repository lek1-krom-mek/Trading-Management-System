/**
 * journal.js — Gallery + CRUD for trade journal entries.
 * (File kept at journal.js to avoid churn; store is still `journals` in DB.)
 */

import { data, savejournal, deletejournal, strategyById, accountById, saveAccount, journalStrategyIds, journalHasStrategy, executePlan } from './store.js';
import { openFormPanel, field, textInput, numberInput, textArea, select, toggleGroup, imageUpload, multiChips, readForm } from './forms.js';
import { el, INSTRUMENTS, TIMEFRAMES, iconSVG, toast, fmtDate, fmtRelative, fmtMoney, customSelect, imageLightbox } from './utils.js';
import { emptyState } from './accounts.js';

let filters = { strategy: 'all', account: 'all', result: 'all', instrument: 'all' };

// Signed P&L delta a journal entry contributes to its account.
function signedDelta(result, amount) {
  const amt = Math.abs(parseFloat(amount) || 0);
  if (result === 'win')  return amt;
  if (result === 'loss') return -amt;
  return 0;
}

async function applyBalanceChange(accountId, delta) {
  if (!accountId || !delta) return;
  const acct = accountById(accountId);
  if (!acct) return;
  const updated = { ...acct, capital: (parseFloat(acct.capital) || 0) + delta };
  await saveAccount(updated);
}

export function renderJournalPage() {
  const root = document.querySelector('[data-page="journal"]');
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Trade log'),
      el('h1', { class: 'page-title' }, 'Journal'),
      el('p', { class: 'page-sub' }, `${data.journals.length} entr${data.journals.length === 1 ? 'y' : 'ies'} logged — track every trade with screenshot, result, and notes.`)
    ),
    el('button', { class: 'btn btn-primary', onClick: () => openJournalForm() },
      el('span', { html: iconSVG('plus') }), ' New entry'
    )
  ));

  if (!data.journals.length) {
    root.appendChild(emptyState('No journal entries yet', 'Upload a trade screenshot, tag the strategy, and log the result.', 'Add journal entry', () => openJournalForm()));
    return;
  }

  // Filter bar
  const bar = el('div', { class: 'filter-bar' });
  bar.appendChild(filterSelect('Strategy', 'strategy', [{ value: 'all', label: 'All strategies' }, ...data.strategies.map(s => ({ value: s.id, label: s.name }))]));
  bar.appendChild(filterSelect('Account', 'account', [{ value: 'all', label: 'All accounts' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))]));
  bar.appendChild(filterSelect('Result', 'result', [
    { value: 'all', label: 'All results' },
    { value: 'win',  label: 'Wins' },
    { value: 'loss', label: 'Losses' },
    { value: 'be',   label: 'Breakeven' },
  ]));
  bar.appendChild(filterSelect('Instrument', 'instrument', [{ value: 'all', label: 'All instruments' }, ...INSTRUMENTS.map(i => ({ value: i, label: i }))]));
  root.appendChild(bar);

  const filtered = data.journals.filter(b =>
    (filters.strategy === 'all'   || journalHasStrategy(b, filters.strategy)) &&
    (filters.account === 'all'    || b.accountId === filters.account) &&
    (filters.result === 'all'     || b.result === filters.result) &&
    (filters.instrument === 'all' || b.instrument === filters.instrument)
  );

  if (!filtered.length) {
    root.appendChild(el('div', { class: 'empty-inline' }, 'No journal entries match these filters.'));
    return;
  }

  const grid = el('div', { class: 'bt-gallery' });
  filtered.forEach(b => grid.appendChild(journalCard(b)));
  root.appendChild(grid);
}

// Back-compat alias for any old imports.
export const renderjournalPage = renderJournalPage;

function filterSelect(label, key, options) {
  return el('label', { class: 'filter-field' },
    el('span', {}, label),
    customSelect(options, filters[key], (v) => { filters[key] = v; renderJournalPage(); })
  );
}

function journalCard(b) {
  const strategies = journalStrategyIds(b).map(strategyById).filter(Boolean);
  const a = accountById(b.accountId);
  const stratChips = strategies.length
    ? strategies.map(s => el('span', { class: 'mini-chip', style: { background: s.color + '22', color: s.color, borderColor: s.color + '55' } }, s.name))
    : [el('span', { class: 'mini-chip' }, 'No strategy')];
  return el('article', { class: 'bt-card', onClick: (e) => {
      if (e.target.closest('button')) return;
      openJournalDetail(b);
    } },
    el('div', { class: 'bt-thumb-lg', style: (b.screenshotPathUrl || b.screenshotPath) ? { backgroundImage: `url(${b.screenshotPathUrl || b.screenshotPath})` } : {} },
      !b.screenshotPath ? el('div', { class: 'bt-thumb-placeholder' }, 'no image') : null,
      el('span', { class: 'bt-result-badge ' + (b.result || 'be') }, (b.result || 'be').toUpperCase()),
      b.rAchieved ? el('span', { class: 'bt-r-badge' }, b.rAchieved + 'R') : null
    ),
    el('div', { class: 'bt-card-body' },
      el('div', { class: 'bt-card-row' },
        ...stratChips,
        el('span', { class: 'mini-chip tf' }, b.timeframe || '—'),
        el('span', { class: 'mini-chip inst' }, b.instrument || '—')
      ),
      el('p', { class: 'bt-desc' }, b.description ? b.description.split('\n')[0].slice(0, 140) : 'No description'),
      el('div', { class: 'bt-card-foot' },
        el('span', {}, a ? a.name : 'Unassigned'),
        el('span', {}, fmtRelative(b.createdAt))
      ),
      el('div', { class: 'card-actions' },
        el('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); openJournalForm(b); } },
          el('span', { html: iconSVG('edit') }), ' Edit'
        ),
        el('span', { class: 'bt-result-mini ' + (b.result || 'be') }, (b.result || 'be').toUpperCase())
      )
    )
  );
}

export function openJournalDetail(b) {
  const strategies = journalStrategyIds(b).map(strategyById).filter(Boolean);
  const a = accountById(b.accountId);
  const titleText = strategies.length ? strategies.map(s => s.name).join(' + ') : 'Untitled strategy';
  const overlay = el('div', { class: 'bt-detail-overlay' });
  const modal = el('div', { class: 'bt-detail-modal' },
    el('div', { class: 'bt-detail-header' },
      el('div', {},
        el('div', { class: 'bt-detail-title' }, titleText),
        el('div', { class: 'bt-detail-sub' },
          `${b.instrument || '—'} · ${b.timeframe || '—'} · ${(b.direction || 'long').toUpperCase()} · ${fmtDate(b.entryDate || b.createdAt)}`
        ),
        strategies.length > 1 ? el('div', { class: 'chip-row', style: { marginTop: '8px' } },
          ...strategies.map(s => el('span', { class: 'mini-chip', style: { background: s.color + '22', color: s.color, borderColor: s.color + '55' } }, s.name))
        ) : null
      ),
      el('div', { class: 'bt-detail-actions' },
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { close(); openJournalForm(b); } },
          el('span', { html: iconSVG('edit') }), ' Edit'
        ),
        el('button', { class: 'icon-btn', onClick: () => close(), 'aria-label': 'Close' },
          el('span', { html: iconSVG('close') })
        )
      )
    ),
    (b.screenshotPath || b.exitScreenshotPath)
      ? el('div', { class: 'bt-detail-images' },
          b.screenshotPath
            ? el('figure', { class: 'bt-detail-image' },
                el('figcaption', { class: 'bt-detail-image-cap' }, 'Entry'),
                el('img', {
                  src: b.screenshotPathUrl || b.screenshotPath,
                  alt: 'Entry screenshot',
                  style: { cursor: 'zoom-in' },
                  onClick: () => imageLightbox(b.screenshotPathUrl || b.screenshotPath, 'Entry screenshot'),
                })
              )
            : null,
          b.exitScreenshotPath
            ? el('figure', { class: 'bt-detail-image' },
                el('figcaption', { class: 'bt-detail-image-cap' }, 'Exit · TP / SL'),
                el('img', {
                  src: b.exitScreenshotPathUrl || b.exitScreenshotPath,
                  alt: 'Exit screenshot',
                  style: { cursor: 'zoom-in' },
                  onClick: () => imageLightbox(b.exitScreenshotPathUrl || b.exitScreenshotPath, 'Exit screenshot'),
                })
              )
            : null,
        )
      : el('div', { class: 'bt-detail-image empty' }, 'No screenshot'),
    el('div', { class: 'bt-detail-meta' },
      metaPill('Result', (b.result || '—').toUpperCase(), `result ${b.result}`),
      metaPill('R achieved', b.rAchieved ? b.rAchieved + 'R' : '—'),
      metaPill(
        b.result === 'loss' ? 'Amount lost ($)' : b.result === 'win' ? 'Amount won ($)' : 'Amount ($)',
        b.amount ? fmtMoney(b.amount, { dp: 0 }) : '—',
        'amount ' + (b.result || '')
      ),
      metaPill('Account', a?.name || 'Unassigned'),
      metaPill('Entry', fmtDate(b.entryDate || b.createdAt))
    ),
    el('div', { class: 'bt-detail-body' },
      el('h4', {}, 'Notes'),
      el('p', {}, b.description || 'No notes.'),
      (b.tags || []).length ? el('div', { class: 'chip-row', style: { marginTop: '10px' } },
        ...b.tags.map(t => el('span', { class: 'mini-chip' }, '#' + t))
      ) : null
    )
  );
  overlay.appendChild(modal);
  function close() { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}
function metaPill(label, value, extra = '') {
  return el('div', { class: 'meta-pill ' + extra },
    el('div', { class: 'meta-pill-l' }, label),
    el('div', { class: 'meta-pill-v' }, value)
  );
}

export function openJournalForm(existing = null, defaults = {}) {
  const b = existing || { result: 'win', direction: 'long', timeframe: 'H1', instrument: 'XAU/USD', tags: [], strategyIds: [], ...defaults };
  const planId = defaults.planId || (existing && existing.planId) || null;
  const linkedPlan = planId ? data.plans.find(p => p.id === planId) : null;
  const isDisciplineViolation = !!linkedPlan && linkedPlan.grade === 'SKIP';
  const initialStrategyIds = journalStrategyIds(b);
  const stratOpts = data.strategies.map(s => ({ value: s.id, label: s.name }));
  const acctOpts = [{ value: '', label: '— Unassigned —' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))];
  const resultToggle = toggleGroup({ name: 'result', value: b.result || 'win', options: [
    { value: 'win',  label: 'Win' },
    { value: 'loss', label: 'Loss' },
    { value: 'be',   label: 'Breakeven' }
  ]});

  const amountField = field('Amount ($)', numberInput({ name: 'amount', value: b.amount ?? '', step: 0.01, min: 0, placeholder: 'e.g. 150' }));
  const rAchievedField = field('R achieved', numberInput({ name: 'rAchieved', value: b.rAchieved ?? '', step: 0.1, placeholder: 'e.g. 2.8' }));
  const amountRow = el('div', { class: 'form-row' }, amountField, rAchievedField);

  function syncResultFields(result) {
    rAchievedField.style.display = result === 'win' ? '' : 'none';
    const amountLabel = amountField.querySelector('.form-label');
    if (amountLabel) {
      amountLabel.textContent = result === 'loss' ? 'Amount lost ($)' : result === 'be' ? 'Amount ($)' : 'Amount won ($)';
    }
  }
  syncResultFields(b.result || 'win');
  resultToggle.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = resultToggle.querySelector('input[type=hidden]').value;
      syncResultFields(v);
    });
  });

  const body = el('div', {},
    isDisciplineViolation
      ? el('div', { class: 'discipline-warning-banner' },
          el('strong', {}, 'Discipline violation warning:'),
          ' This plan failed must-pass checks. Logging it anyway will be recorded as a discipline violation.')
      : null,
    row(
      field('Entry screenshot', imageUpload({ name: 'screenshotPath',     value: b.screenshotPath     || '' }), 'Chart at the moment of trade entry.'),
      field('Exit screenshot',  imageUpload({ name: 'exitScreenshotPath', value: b.exitScreenshotPath || '' }), 'Chart when TP / SL hit — optional, log after the trade closes.')
    ),
    field('Strategies', stratOpts.length
      ? multiChips({ name: 'strategyIds', values: initialStrategyIds, options: stratOpts })
      : el('div', { class: 'form-empty-note' }, 'Create a strategy first.'),
      'Tap one or more strategies that contributed to this trade.'),
    field('Account', select({ name: 'accountId', value: b.accountId || '', options: acctOpts })),
    row(
      field('Instrument', select({ name: 'instrument', value: b.instrument || 'XAU/USD', options: INSTRUMENTS.map(i => ({ value: i, label: i })) })),
      field('Timeframe',  select({ name: 'timeframe',  value: b.timeframe || 'H1',      options: TIMEFRAMES.map(t => ({ value: t, label: t })) }))
    ),
    row(
      field('Direction', toggleGroup({ name: 'direction', value: b.direction || 'long', options: [
        { value: 'long', label: 'Long' }, { value: 'short', label: 'Short' }
      ]})),
      field('Entry date', textInput({ name: 'entryDate', type: 'date', value: b.entryDate ? new Date(b.entryDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10) }))
    ),
    field('Result', resultToggle),
    amountRow,
    field('Description', textArea({ name: 'description', value: b.description || '', rows: 4, placeholder: 'What you saw, why you entered, how it played out…' })),
    sectionHeader('Tags'),
    tagInput({ name: 'tags', values: b.tags || [] })
  );
  openFormPanel({
    title: existing ? 'Edit journal entry' : 'New journal entry',
    body,
    width: 760,
    submitLabel: existing ? 'Save changes' : 'Save entry',
    onDelete: existing ? async () => {
      // Reverse the account balance effect this entry had.
      const oldDelta = signedDelta(existing.result, existing.amount);
      await deletejournal(existing.id);
      await applyBalanceChange(existing.accountId, -oldDelta);
      toast('Journal entry deleted');
    } : null,
    onSubmit: async (form) => {
      const raw = readForm(form, ['tags', 'strategyIds'], []);

      const oldResult = existing ? existing.result : null;
      const oldAmount = existing ? existing.amount : 0;
      const oldAccountId = existing ? (existing.accountId || null) : null;

      const newResult = raw.result;
      const newAmount = Math.abs(parseFloat(raw.amount) || 0);
      const newAccountId = raw.accountId || null;
      const newStrategyIds = Array.isArray(raw.strategyIds) ? raw.strategyIds.filter(Boolean) : [];

      const obj = {
        ...b,
        planId: planId || b.planId || null,
        strategyIds: newStrategyIds,
        strategyId: newStrategyIds[0] || null,
        accountId: newAccountId,
        instrument: raw.instrument,
        timeframe: raw.timeframe,
        direction: raw.direction,
        entryDate: raw.entryDate ? new Date(raw.entryDate).getTime() : Date.now(),
        result: newResult,
        rAchieved: newResult === 'win' ? (parseFloat(raw.rAchieved) || 0) : 0,
        amount: newAmount,
        screenshotPath: raw.screenshotPath || b.screenshotPath || '',
        exitScreenshotPath: raw.exitScreenshotPath || b.exitScreenshotPath || '',
        description: raw.description,
        tags: raw.tags || [],
      };
      const savedJournal = await savejournal(obj);

      // If this journal was created from a plan, link plan→journal and flag discipline violation
      if (planId && !existing) {
        await executePlan(planId, savedJournal.id);
      }

      // Reconcile account balance(s). Immutable updates via applyBalanceChange().
      const oldDelta = signedDelta(oldResult, oldAmount);
      const newDelta = signedDelta(newResult, newAmount);
      if (oldAccountId === newAccountId) {
        await applyBalanceChange(newAccountId, newDelta - oldDelta);
      } else {
        await applyBalanceChange(oldAccountId, -oldDelta);
        await applyBalanceChange(newAccountId, newDelta);
      }

      toast(existing ? 'Journal entry updated' : 'Journal entry saved');
    }
  });
}

// Back-compat alias for older imports.
export const openjournalForm = openJournalForm;

function tagInput({ name, values = [] }) {
  const selected = new Set(values);
  const wrap = el('div', { class: 'tag-input' });
  const hidden = el('input', { type: 'hidden', name, value: Array.from(selected).join(',') });
  const list = el('div', { class: 'tag-list' });
  const input = el('input', { type: 'text', class: 'text-input tag-text', placeholder: 'Add tag and press Enter…' });
  function render() {
    list.innerHTML = '';
    Array.from(selected).forEach(t => {
      list.appendChild(el('span', { class: 'chip active' }, '#' + t,
        el('button', { type: 'button', class: 'chip-remove', onClick: () => { selected.delete(t); hidden.value = Array.from(selected).join(','); render(); } }, '×')
      ));
    });
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim().replace(/^#/, '');
      if (v) { selected.add(v); input.value = ''; hidden.value = Array.from(selected).join(','); render(); }
    }
  });
  wrap.appendChild(list);
  wrap.appendChild(input);
  wrap.appendChild(hidden);
  render();
  return wrap;
}

function row(...c) { return el('div', { class: 'form-row' }, ...c); }
function sectionHeader(label) { return el('div', { class: 'form-section' }, label); }
