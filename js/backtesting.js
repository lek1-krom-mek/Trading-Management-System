/**
 * backtesting.js — Gallery + CRUD for backtesting sessions.
 */

import { data, saveBacktest, deleteBacktest, strategyById, accountById } from './store.js';
import { openFormPanel, field, textInput, numberInput, textArea, select, toggleGroup, imageUpload, multiChips, readForm } from './forms.js';
import { el, INSTRUMENTS, TIMEFRAMES, iconSVG, toast, fmtDate, fmtRelative } from './utils.js';
import { emptyState } from './accounts.js';

let filters = { strategy: 'all', account: 'all', result: 'all', instrument: 'all' };

export function renderBacktestingPage() {
  const root = document.querySelector('[data-page="backtesting"]');
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Research'),
      el('h1', { class: 'page-title' }, 'Backtesting'),
      el('p', { class: 'page-sub' }, `${data.backtests.length} session${data.backtests.length === 1 ? '' : 's'} logged — store TradingView setups, results, and notes.`)
    ),
    el('button', { class: 'btn btn-primary', onClick: () => openBacktestForm() },
      el('span', { html: iconSVG('plus') }), ' New entry'
    )
  ));

  if (!data.backtests.length) {
    root.appendChild(emptyState('No backtests yet', 'Upload a TradingView screenshot, tag the strategy, and log the result.', 'Add backtest', () => openBacktestForm()));
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

  const filtered = data.backtests.filter(b =>
    (filters.strategy === 'all'   || b.strategyId === filters.strategy) &&
    (filters.account === 'all'    || b.accountId === filters.account) &&
    (filters.result === 'all'     || b.result === filters.result) &&
    (filters.instrument === 'all' || b.instrument === filters.instrument)
  );

  if (!filtered.length) {
    root.appendChild(el('div', { class: 'empty-inline' }, 'No backtests match these filters.'));
    return;
  }

  const grid = el('div', { class: 'bt-gallery' });
  filtered.forEach(b => grid.appendChild(backtestCard(b)));
  root.appendChild(grid);
}

function filterSelect(label, key, options) {
  const sel = el('select', { class: 'filter-select', onChange: (e) => { filters[key] = e.target.value; renderBacktestingPage(); } });
  options.forEach(o => {
    const opt = el('option', { value: o.value }, o.label);
    if (filters[key] === o.value) opt.selected = true;
    sel.appendChild(opt);
  });
  return el('label', { class: 'filter-field' },
    el('span', {}, label),
    sel
  );
}

function backtestCard(b) {
  const s = strategyById(b.strategyId);
  const a = accountById(b.accountId);
  return el('article', { class: 'bt-card', onClick: (e) => {
      if (e.target.closest('button')) return;
      openBacktestDetail(b);
    } },
    el('div', { class: 'bt-thumb-lg', style: b.screenshotPath ? { backgroundImage: `url(${b.screenshotPath})` } : {} },
      !b.screenshotPath ? el('div', { class: 'bt-thumb-placeholder' }, 'no image') : null,
      el('span', { class: 'bt-result-badge ' + (b.result || 'be') }, (b.result || 'be').toUpperCase()),
      b.rAchieved ? el('span', { class: 'bt-r-badge' }, b.rAchieved + 'R') : null
    ),
    el('div', { class: 'bt-card-body' },
      el('div', { class: 'bt-card-row' },
        s ? el('span', { class: 'mini-chip', style: { background: s.color + '22', color: s.color, borderColor: s.color + '55' } }, s.name) : el('span', { class: 'mini-chip' }, 'No strategy'),
        el('span', { class: 'mini-chip tf' }, b.timeframe || '—'),
        el('span', { class: 'mini-chip inst' }, b.instrument || '—')
      ),
      el('p', { class: 'bt-desc' }, b.description ? b.description.split('\n')[0].slice(0, 140) : 'No description'),
      el('div', { class: 'bt-card-foot' },
        el('span', {}, a ? a.name : 'Unassigned'),
        el('span', {}, fmtRelative(b.createdAt))
      ),
      el('div', { class: 'card-actions' },
        el('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); openBacktestForm(b); } },
          el('span', { html: iconSVG('edit') }), ' Edit'
        ),
        el('span', { class: 'bt-result-mini ' + (b.result || 'be') }, (b.result || 'be').toUpperCase())
      )
    )
  );
}

function openBacktestDetail(b) {
  const s = strategyById(b.strategyId);
  const a = accountById(b.accountId);
  const overlay = el('div', { class: 'bt-detail-overlay' });
  const modal = el('div', { class: 'bt-detail-modal' },
    el('div', { class: 'bt-detail-header' },
      el('div', {},
        el('div', { class: 'bt-detail-title' }, s?.name || 'Untitled strategy'),
        el('div', { class: 'bt-detail-sub' },
          `${b.instrument || '—'} · ${b.timeframe || '—'} · ${(b.direction || 'long').toUpperCase()} · ${fmtDate(b.entryDate || b.createdAt)}`
        )
      ),
      el('div', { class: 'bt-detail-actions' },
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => { close(); openBacktestForm(b); } },
          el('span', { html: iconSVG('edit') }), ' Edit'
        ),
        el('button', { class: 'icon-btn', onClick: () => close(), 'aria-label': 'Close' },
          el('span', { html: iconSVG('close') })
        )
      )
    ),
    b.screenshotPath
      ? el('div', { class: 'bt-detail-image' }, el('img', { src: b.screenshotPath, alt: '' }))
      : el('div', { class: 'bt-detail-image empty' }, 'No screenshot'),
    el('div', { class: 'bt-detail-meta' },
      metaPill('Result', (b.result || '—').toUpperCase(), `result ${b.result}`),
      metaPill('R achieved', b.rAchieved ? b.rAchieved + 'R' : '—'),
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

export function openBacktestForm(existing = null, defaults = {}) {
  const b = existing || { result: 'win', direction: 'long', timeframe: 'H1', instrument: 'XAU/USD', tags: [], ...defaults };
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
    field('Screenshot', imageUpload({ name: 'screenshotPath', value: b.screenshotPath || '' })),
    row(
      field('Strategy', stratOpts.length
        ? select({ name: 'strategyId', value: b.strategyId || stratOpts[0]?.value, options: stratOpts, required: true })
        : el('div', { class: 'form-empty-note' }, 'Create a strategy first.')),
      field('Account', select({ name: 'accountId', value: b.accountId || '', options: acctOpts }))
    ),
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
    title: existing ? 'Edit backtest' : 'New backtest',
    body,
    submitLabel: existing ? 'Save changes' : 'Save backtest',
    onDelete: existing ? async () => { await deleteBacktest(existing.id); toast('Backtest deleted'); } : null,
    onSubmit: async (form) => {
      const raw = readForm(form, ['tags']);
      const obj = {
        ...b,
        strategyId: raw.strategyId,
        accountId: raw.accountId || null,
        instrument: raw.instrument,
        timeframe: raw.timeframe,
        direction: raw.direction,
        entryDate: raw.entryDate ? new Date(raw.entryDate).getTime() : Date.now(),
        result: raw.result,
        rAchieved: raw.result === 'win' ? (parseFloat(raw.rAchieved) || 0) : 0,
        amount: Math.abs(parseFloat(raw.amount) || 0),
        screenshotPath: raw.screenshotPath || b.screenshotPath || '',
        description: raw.description,
        tags: raw.tags || [],
      };
      await saveBacktest(obj);
      toast(existing ? 'Backtest updated' : 'Backtest saved');
    }
  });
}

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
