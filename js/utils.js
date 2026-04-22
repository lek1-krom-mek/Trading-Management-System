/**
 * utils.js — Shared rendering helpers used across pages.
 */

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class')     node.className = v;
    else if (k === 'style') {
      for (const [sk, sv] of Object.entries(v || {})) {
        if (sk.startsWith('--')) node.style.setProperty(sk, sv);
        else node.style[sk] = sv;
      }
    }
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      node.appendChild(document.createTextNode(String(c)));
    } else {
      node.appendChild(c);
    }
  }
  return node;
}

export function fmtMoney(n, opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = opts.sign && n > 0 ? '+' : (n < 0 ? '-' : '');
  return sign + '$' + abs.toLocaleString(undefined, { minimumFractionDigits: opts.dp ?? 0, maximumFractionDigits: opts.dp ?? 2 });
}

export function fmtPct(n, dp = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toFixed(dp) + '%';
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return fmtDate(ts);
}

export function initials(str) {
  if (!str) return '??';
  return str.split(/[\s\-_]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || str.slice(0, 2).toUpperCase();
}

export const ACCOUNT_TYPES = {
  'prop-challenge': { label: 'Prop Challenge', color: 'var(--gold)',  bg: 'rgba(245,158,11,0.14)',  fg: 'var(--gold)' },
  'prop-instant':   { label: 'Prop Instant',   color: '#60A5FA',      bg: 'rgba(96,165,250,0.14)',  fg: '#93C5FD' },
  'own-funds':      { label: 'Own Funds',      color: '#4ADE80',      bg: 'rgba(74,222,128,0.14)',  fg: '#86EFAC' },
  'ea-robot':       { label: 'EA Robot',       color: '#A78BFA',      bg: 'rgba(167,139,250,0.16)', fg: '#C4B5FD' },
};

export const ACCOUNT_STATUSES = {
  'active': { label: 'Active', color: '#4ADE80' },
  'paused': { label: 'Paused', color: '#FCD34D' },
  'passed': { label: 'Passed', color: '#60A5FA' },
  'funded': { label: 'Funded', color: '#F59E0B' },
  'blown':  { label: 'Blown',  color: '#F87171' },
};

export const ENTRY_METHODS = ['Order Block', 'Fair Value Gap', 'Break of Structure', 'Change of Character', 'Liquidity Sweep', 'Support / Resistance'];
export const TIMEFRAMES    = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
export const INSTRUMENTS   = ['XAU/USD', 'US30', 'NAS100', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD'];
export const STRATEGY_COLORS = ['#F59E0B', '#60A5FA', '#4ADE80', '#A78BFA', '#F472B6', '#FB923C', '#22D3EE', '#FDE68A'];

/** Small inline sparkline from an array of numbers */
export function sparkline(values, w = 120, h = 34, color = '#F59E0B') {
  if (!values || values.length < 2) {
    return el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'sparkline empty' },
      el('line', { x1: 0, y1: h/2, x2: w, y2: h/2, stroke: 'rgba(255,255,255,0.08)', 'stroke-dasharray': '2 3' })
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 2 - ((v - min) / range) * (h - 4)]);
  const d = 'M ' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L ');
  const area = d + ` L ${w} ${h} L 0 ${h} Z`;
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'sparkline' });
  svg.innerHTML = `
    <defs><linearGradient id="sg-${Math.random().toString(36).slice(2)}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="${color}" fill-opacity="0.12"/>
    <path d="${d}"    fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  `;
  return svg;
}

/** Build equity curve from journals (assumes R values represent units of risk). */
export function equityCurve(journals, startAt = 0) {
  if (!journals.length) return [];
  const sorted = [...journals].sort((a, b) => (a.createdAt||0) - (b.createdAt||0));
  let eq = startAt;
  const out = [eq];
  for (const b of sorted) {
    const r = parseFloat(b.rAchieved) || 0;
    if (b.result === 'win')  eq += r;
    else if (b.result === 'loss') eq -= Math.abs(r || 1);
    // be = no change
    out.push(eq);
  }
  return out;
}

/** Simple toast */
let toastTimer = null;
export function toast(msg, kind = '') {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/** Confirm dialog promise */
export function confirmAction(message) {
  return new Promise(resolve => {
    const ok = confirm(message);
    resolve(ok);
  });
}

export function iconSVG(name) {
  const icons = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    accounts:  '<path d="M20 7h-3V5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2H9z"/>',
    strategies:'<path d="M12 2 4 7v6c0 4.4 3 8 8 9 5-1 8-4.6 8-9V7zm0 10h6c-.5 3.1-2.7 5.5-6 6.4z"/>',
    journal:'<path d="M4 4h4v4H4zm6 0h10v4H10zM4 10h4v4H4zm6 0h10v4H10zM4 16h4v4H4zm6 0h10v4H10z"/>',
    calculator:'<path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 4v3h10V6zm0 5v2h3v-2zm5 0v2h3v-2zm-5 4v2h3v-2zm5 0v2h3v-2z"/>',
    plus:      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    close:     '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    edit:      '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/>',
    trash:     '<path d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zm3-3h6l1 2H8z"/>',
    upload:    '<path d="M12 3v12m0-12-4 4m4-4 4 4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    search:    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    chevron:   '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    expand:    '<path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    check:     '<path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    sparkle:   '<path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    filter:    '<path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  };
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icons[name] || ''}</svg>`;
}
