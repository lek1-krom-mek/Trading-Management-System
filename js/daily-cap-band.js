/**
 * daily-cap-band.js — Renders today's P&L vs personal/firm caps on the dashboard.
 *
 * Returns a DOM node when the active account is in caution+ state, or null
 * when safe. Caller (dashboard) inserts this between the KPI row and the
 * Portfolio Accounts section.
 */

import { el } from './utils.js';

const STATE_COPY = {
  safe:              null,
  caution:           'Approaching personal daily cap. Stay disciplined.',
  warning:           'Approaching personal daily cap. Consider stopping for the day.',
  breach_imminent:   'Personal cap nearly hit. SOP Rule 5: 3 trades/day max.',
  personal_breached: 'Personal cap reached. SOP Rule 5: stop trading.',
  firm_breached:     'FIRM CAP BREACHED. Account at risk.',
};

export function dailyCapBand(account) {
  if (!account) return null;
  if (account.capState === 'safe' || !account.capState) return null;

  const fmtUsd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;

  const head = el('div', { class: 'dcb-head' },
    el('span', { class: 'dcb-eyebrow' }, 'TODAY · ACTIVE ACCOUNT'),
    el('span', { class: 'dcb-account' }, account.name || ''),
  );

  const summary = el('div', { class: 'dcb-summary' },
    `${fmtUsd(account.dailyPnlToday)} of ${fmtUsd(account.personalCapDollars)} personal cap (${Math.round(account.personalCapPctUsed)}% used)`
  );

  const pBar = bar(account.personalCapPctUsed, `Personal ${account.personalDailyCapPct ?? 3}%`);
  const fBar = bar(account.firmCapPctUsed,     `Firm ${account.firmDailyCapPct ?? 5}%`);

  const message = STATE_COPY[account.capState];
  const messageEl = message
    ? el('div', { class: 'dcb-message' }, '⚠ ' + message)
    : null;

  return el('section', { class: `daily-cap-band daily-cap-band--${account.capState.replace(/_/g, '-')}` },
    head,
    summary,
    pBar,
    fBar,
    messageEl,
  );
}

function bar(pctUsed, label) {
  const clamped = Math.min(100, Math.max(0, pctUsed || 0));
  return el('div', { class: 'dcb-bar' },
    el('div', { class: 'dcb-bar-track' },
      el('div', { class: 'dcb-bar-fill', style: { width: clamped + '%' } }),
    ),
    el('span', { class: 'dcb-bar-label' }, label),
  );
}
