/**
 * strategies.js — CRUD + list / detail for trading strategies.
 */

import { data, saveStrategy, deleteStrategy, strategyStats, accountsUsingStrategy } from './store.js';
import { openFormPanel, field, textInput, numberInput, textArea, multiChips, colorPicker, readForm } from './forms.js';
import { el, ENTRY_METHODS, TIMEFRAMES, INSTRUMENTS, STRATEGY_COLORS, iconSVG, toast, fmtPct, fmtDate, sparkline, equityCurve, initials } from './utils.js';
import { emptyState } from './accounts.js';
import { go } from './router.js';

export function renderStrategiesPage() {
  const root = document.querySelector('[data-page="strategies"]');
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-eyebrow' }, 'Playbook'),
      el('h1', { class: 'page-title' }, 'Strategies'),
      el('p', { class: 'page-sub' }, `${data.strategies.length} strategies defined — edit entry logic, track win rate, link accounts.`)
    ),
    el('button', { class: 'btn btn-primary', onClick: () => openStrategyForm() },
      el('span', { html: iconSVG('plus') }), ' New strategy'
    )
  ));

  if (!data.strategies.length) {
    root.appendChild(emptyState('No strategies yet', 'Document your setups so you can track win rate and attach them to accounts.', 'Add strategy', () => openStrategyForm()));
    return;
  }
  const grid = el('div', { class: 'card-grid strategies-grid' });
  data.strategies.forEach(s => grid.appendChild(strategyCard(s)));
  root.appendChild(grid);
}

function strategyCard(s) {
  const stats = strategyStats(s.id);
  const accts = accountsUsingStrategy(s.id);
  const bts = data.backtests.filter(b => b.strategyId === s.id);
  const last = bts[0];
  const curve = equityCurve(bts);
  const card = el('article', { class: 'strategy-card', onClick: (e) => {
    if (e.target.closest('button')) return;
    go('strategies/' + s.id);
  }, style: { '--strat-color': s.color || '#F59E0B' } },
    el('header', { class: 'strategy-card-head' },
      el('span', { class: 'color-swatch-sm', style: { background: s.color || '#F59E0B' } }),
      el('h3', {}, s.name || 'Untitled')
    ),
    el('p', { class: 'strategy-summary' }, s.description ? s.description.split('\n')[0] : 'No description'),
    el('div', { class: 'chip-row' },
      ...(s.timeframes || []).slice(0, 4).map(tf => el('span', { class: 'mini-chip tf' }, tf)),
      ...(s.instruments || []).slice(0, 3).map(i => el('span', { class: 'mini-chip inst' }, i))
    ),
    el('div', { class: 'strategy-stats' },
      el('div', { class: 'stat' },
        el('div', { class: 'stat-v' }, stats.total ? fmtPct(stats.winRate, 0) : '—'),
        el('div', { class: 'stat-l' }, 'Win rate')
      ),
      el('div', { class: 'stat' },
        el('div', { class: 'stat-v' }, stats.total),
        el('div', { class: 'stat-l' }, 'Trades')
      ),
      el('div', { class: 'stat' },
        el('div', { class: 'stat-v' }, stats.avgR ? stats.avgR.toFixed(2) + 'R' : '—'),
        el('div', { class: 'stat-l' }, 'Avg R')
      ),
      el('div', { class: 'stat' },
        el('div', { class: 'stat-v' }, stats.profitFactor ? stats.profitFactor.toFixed(2) : '—'),
        el('div', { class: 'stat-l' }, 'PF')
      ),
    ),
    el('div', { class: 'strategy-spark' }, sparkline(curve, 240, 48, s.color || '#F59E0B')),
    el('footer', { class: 'strategy-foot' },
      el('div', { class: 'acct-chips' },
        accts.length
          ? accts.slice(0, 3).map(a => el('span', { class: 'acct-chip', title: a.name }, initials(a.company || a.name)))
          : el('span', { class: 'muted-text' }, 'Unlinked')
      ),
      el('span', { class: 'muted-text' }, last ? 'Last ' + fmtDate(last.createdAt) : '—')
    ),
    el('div', { class: 'card-actions' },
      el('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); openStrategyForm(s); } },
        el('span', { html: iconSVG('edit') }), ' Edit'
      ),
      el('button', { class: 'btn btn-ghost btn-sm', onClick: (e) => { e.stopPropagation(); go('strategies/' + s.id); } },
        'View detail'
      )
    )
  );
  return card;
}

export function renderStrategyDetail(id) {
  const root = document.querySelector('[data-page="strategies"]');
  const s = data.strategies.find(x => x.id === id);
  if (!s) { go('strategies'); return; }
  const stats = strategyStats(s.id);
  const accts = accountsUsingStrategy(s.id);
  const bts = data.backtests.filter(b => b.strategyId === s.id);
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-head' },
    el('div', {},
      el('button', { class: 'back-link', onClick: () => go('strategies') },
        el('span', { html: iconSVG('chevron'), style: { transform: 'rotate(180deg)', display: 'inline-flex' } }), ' All strategies'
      ),
      el('div', { class: 'strategy-detail-title' },
        el('span', { class: 'color-swatch-lg', style: { background: s.color } }),
        el('h1', { class: 'page-title' }, s.name)
      ),
      el('div', { class: 'chip-row', style: { marginTop: '10px' } },
        ...(s.timeframes || []).map(tf => el('span', { class: 'mini-chip tf' }, tf)),
        ...(s.instruments || []).map(i => el('span', { class: 'mini-chip inst' }, i))
      )
    ),
    el('button', { class: 'btn btn-ghost', onClick: () => openStrategyForm(s) },
      el('span', { html: iconSVG('edit') }), ' Edit'
    )
  ));
  root.appendChild(el('div', { class: 'detail-grid' },
    el('div', { class: 'card detail-main' },
      el('div', { class: 'card-label' }, 'Description'),
      el('p', { class: 'long-text' }, s.description || 'No description provided.'),
      (s.entryMethods || []).length ? el('div', { style: { marginTop: '16px' } },
        el('div', { class: 'card-label' }, 'Entry methods'),
        el('div', { class: 'chip-row' }, ...s.entryMethods.map(m => el('span', { class: 'mini-chip' }, m)))
      ) : null,
      s.notes ? el('div', { style: { marginTop: '16px' } },
        el('div', { class: 'card-label' }, 'Notes'),
        el('p', { class: 'long-text' }, s.notes)
      ) : null
    ),
    el('div', { class: 'card' },
      el('div', { class: 'card-label' }, 'Performance'),
      el('div', { class: 'detail-stats' },
        detailStat(stats.total ? fmtPct(stats.winRate, 1) : '—', 'Win rate'),
        detailStat(stats.total,                                   'Total trades'),
        detailStat(`${stats.wins}W · ${stats.losses}L · ${stats.be}BE`, 'Breakdown'),
        detailStat(stats.avgR ? stats.avgR.toFixed(2) + 'R' : '—','Avg R realized'),
        detailStat(stats.profitFactor ? stats.profitFactor.toFixed(2) : '—','Profit factor'),
        detailStat(s.preferredRR ? '1:' + s.preferredRR : '—',   'Preferred R:R')
      )
    ),
    el('div', { class: 'card' },
      el('div', { class: 'card-label' }, 'Accounts using this'),
      accts.length
        ? el('div', { class: 'acct-list' }, ...accts.map(a => el('div', { class: 'acct-row' },
            el('span', { class: 'acct-chip lg' }, initials(a.company || a.name)),
            el('div', {},
              el('div', { class: 'acct-row-name' }, a.name),
              el('div', { class: 'acct-row-meta' }, a.company || '—')
            )
          )))
        : el('div', { class: 'muted-text' }, 'Not linked to any account yet.')
    )
  ));
  const btSection = el('div', { class: 'card' },
    el('div', { class: 'card-head-row' },
      el('div', { class: 'card-label' }, 'Backtesting sessions · ' + bts.length),
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('backtesting') }, 'View all')
    )
  );
  if (bts.length) {
    const thumbs = el('div', { class: 'bt-thumb-grid' });
    bts.slice(0, 8).forEach(b => {
      thumbs.appendChild(el('div', { class: 'bt-thumb', onClick: () => go('backtesting'), style: b.screenshotPath ? { backgroundImage: `url(${b.screenshotPath})` } : {} },
        el('div', { class: 'bt-thumb-label' },
          el('span', { class: 'bt-result ' + b.result }, b.result?.toUpperCase()),
          el('span', {}, b.rAchieved ? b.rAchieved + 'R' : '')
        )
      ));
    });
    btSection.appendChild(thumbs);
  } else {
    btSection.appendChild(el('div', { class: 'muted-text', style: { padding: '12px 0' } }, 'No backtests logged for this strategy yet.'));
  }
  root.appendChild(btSection);
}

function detailStat(v, l) {
  return el('div', { class: 'detail-stat' },
    el('div', { class: 'detail-stat-v' }, String(v)),
    el('div', { class: 'detail-stat-l' }, l)
  );
}

export function openStrategyForm(existing = null) {
  const s = existing || { color: STRATEGY_COLORS[0], entryMethods: [], timeframes: ['H1'], instruments: ['XAU/USD'], preferredRR: 2, maxSLPips: 20 };
  const body = el('div', {},
    field('Strategy name', textInput({ name: 'name', value: s.name || '', placeholder: 'e.g. London OB Retracement', required: true })),
    field('Color tag', colorPicker({ name: 'color', value: s.color, colors: STRATEGY_COLORS })),
    field('Description', textArea({ name: 'description', value: s.description || '', placeholder: 'Entry logic, confluence factors, market context…', rows: 3 })),
    sectionHeader('Entry confirmation'),
    multiChips({ name: 'entryMethods', values: s.entryMethods || [], options: ENTRY_METHODS }),
    sectionHeader('Timeframes'),
    multiChips({ name: 'timeframes', values: s.timeframes || [], options: TIMEFRAMES }),
    sectionHeader('Instruments'),
    multiChips({ name: 'instruments', values: s.instruments || [], options: INSTRUMENTS }),
    row(
      field('Preferred R:R', numberInput({ name: 'preferredRR', value: s.preferredRR ?? 2, min: 0.5, step: 0.5 })),
      field('Max SL (pips)', numberInput({ name: 'maxSLPips',  value: s.maxSLPips ?? 20, min: 1 }))
    ),
    field('Notes', textArea({ name: 'notes', value: s.notes || '', placeholder: 'Any extra rules, filters, session preferences…', rows: 3 }))
  );

  openFormPanel({
    title: existing ? 'Edit strategy' : 'New strategy',
    body,
    submitLabel: existing ? 'Save changes' : 'Create strategy',
    onDelete: existing ? async () => { await deleteStrategy(existing.id); toast('Strategy deleted'); go('strategies'); } : null,
    onSubmit: async (form) => {
      const raw = readForm(form, ['entryMethods', 'timeframes', 'instruments']);
      const obj = {
        ...s,
        name: raw.name,
        color: raw.color,
        description: raw.description,
        entryMethods: raw.entryMethods || [],
        timeframes: raw.timeframes || [],
        instruments: raw.instruments || [],
        preferredRR: parseFloat(raw.preferredRR) || 2,
        maxSLPips: parseFloat(raw.maxSLPips) || 20,
        notes: raw.notes,
      };
      await saveStrategy(obj);
      toast(existing ? 'Strategy updated' : 'Strategy created');
    }
  });
}

function row(...c) { return el('div', { class: 'form-row' }, ...c); }
function sectionHeader(label) { return el('div', { class: 'form-section' }, label); }
