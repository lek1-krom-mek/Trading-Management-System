import { data, journalHasStrategy, accountById } from './store.js';
import { el, fmtMoney, fmtDate, iconSVG, customSelect } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs))
    if (v !== null && v !== undefined && v !== false) node.setAttribute(k, String(v));
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
    else node.appendChild(c);
  }
  return node;
}

function computePnlData(journals, filters) {
  const { range, accountId, strategyId, status } = filters;

  let filtered = journals.filter(j => {
    if (accountId && accountId !== 'all' && j.accountId !== accountId) return false;
    if (strategyId && strategyId !== 'all' && !journalHasStrategy(j, strategyId)) return false;
    if (status && status !== 'all') {
      const acct = accountById(j.accountId);
      if (!acct || acct.status !== status) return false;
    }
    return true;
  });

  if (range && range !== 'all') {
    const now = Date.now();
    const cutoffs = {
      '7d':  now - 7  * 86400000,
      '30d': now - 30 * 86400000,
      '90d': now - 90 * 86400000,
      'ytd': new Date(new Date().getFullYear(), 0, 1).getTime(),
    };
    const cutoff = cutoffs[range];
    if (cutoff) filtered = filtered.filter(j => (j.entryDate || j.createdAt || 0) >= cutoff);
  }

  const sorted = [...filtered].sort((a, b) => (a.entryDate || a.createdAt || 0) - (b.entryDate || b.createdAt || 0));

  let cumPnl = 0;
  let runningMax = 0;
  let maxDd = 0;
  let winCount = 0;
  let lossCount = 0;
  let winTotal = 0;
  let lossTotal = 0;
  const points = [];

  for (const j of sorted) {
    const amt = Math.abs(parseFloat(j.amount) || 0);
    let delta = 0;
    if (j.result === 'win')  { delta = amt;  winCount++;  winTotal += amt; }
    if (j.result === 'loss') { delta = -amt; lossCount++; lossTotal += amt; }
    cumPnl += delta;
    if (cumPnl > runningMax) runningMax = cumPnl;
    const dd = cumPnl - runningMax;
    if (dd < maxDd) maxDd = dd;
    points.push({ date: j.entryDate || j.createdAt || 0, cumPnl, delta, result: j.result || 'be' });
  }

  const totalTrades = sorted.length;
  const winRate = (winCount + lossCount) > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
  const avgWin = winCount > 0 ? winTotal / winCount : 0;
  const avgLoss = lossCount > 0 ? -(lossTotal / lossCount) : 0;
  const profitFactor = lossTotal > 0 ? winTotal / lossTotal : (winTotal > 0 ? 99 : 0);

  return {
    points,
    stats: {
      currentPnl: cumPnl,
      ath: runningMax,
      maxDd,
      totalTrades,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
    },
  };
}

function niceAxis(min, max, ticks) {
  if (min === max) { min -= 100; max += 100; }
  const range = max - min;
  const rough = range / (ticks - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = [1, 2, 5, 10].find(n => n * mag >= rough) * mag;
  const lo = Math.floor(min / nice) * nice;
  const hi = Math.ceil(max / nice) * nice;
  const vals = [];
  for (let v = lo; v <= hi + nice * 0.01; v += nice) vals.push(Math.round(v * 100) / 100);
  return vals;
}

function fmtAxisDate(ts, rangeDays) {
  const d = new Date(ts);
  if (rangeDays <= 7)  return d.toLocaleDateString(undefined, { weekday: 'short' });
  if (rangeDays <= 90) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function fmtDollar(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n < 0 ? '-' : '') + '$' + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
  return (n < 0 ? '-' : '') + '$' + abs.toFixed(0);
}

function buildChartSVG(points, opts = {}) {
  const W = opts.width || 600;
  const H = opts.height || 280;
  const PAD = { top: 10, right: 10, bottom: 30, left: 55 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  if (!points.length) {
    const zeroY = PAD.top + ch / 2;
    const emptySvg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, class: 'pnl-svg' },
      svgEl('line', { x1: PAD.left, y1: zeroY, x2: W - PAD.right, y2: zeroY, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }),
      svgEl('text', { x: W / 2, y: zeroY - 12, fill: 'rgba(255,255,255,0.3)', 'font-size': 12, 'text-anchor': 'middle', 'font-family': 'var(--font-mono, monospace)' }, 'No trades in this period')
    );
    return emptySvg;
  }

  const vals = points.map(p => p.cumPnl);
  const minV = Math.min(0, ...vals);
  const maxV = Math.max(0, ...vals);
  const yTicks = niceAxis(minV, maxV, 5);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const yRange = yMax - yMin || 1;

  const toX = (i) => PAD.left + (i / Math.max(1, points.length - 1)) * cw;
  const toY = (v) => PAD.top + (1 - (v - yMin) / yRange) * ch;
  const zeroY = toY(0);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)} ${toY(p.cumPnl).toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${toX(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L${toX(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const uid = 'pnl-' + Math.random().toString(36).slice(2, 8);

  const svg = svgEl('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, class: 'pnl-svg', 'data-uid': uid });

  // SVG defs: gradients and clip-paths (static structure, no user data)
  svg.innerHTML = [
    '<defs>',
    `  <linearGradient id="${uid}-gG" x1="0" x2="0" y1="0" y2="1">`,
    '    <stop offset="0%" stop-color="#10B981" stop-opacity="0.4"/>',
    '    <stop offset="100%" stop-color="#10B981" stop-opacity="0.02"/>',
    '  </linearGradient>',
    `  <linearGradient id="${uid}-gR" x1="0" x2="0" y1="0" y2="1">`,
    '    <stop offset="0%" stop-color="#EF4444" stop-opacity="0.02"/>',
    '    <stop offset="100%" stop-color="#EF4444" stop-opacity="0.3"/>',
    '  </linearGradient>',
    `  <clipPath id="${uid}-clipAbove"><rect x="${PAD.left}" y="${PAD.top}" width="${cw}" height="${Math.max(0, zeroY - PAD.top)}"/></clipPath>`,
    `  <clipPath id="${uid}-clipBelow"><rect x="${PAD.left}" y="${zeroY}" width="${cw}" height="${Math.max(0, PAD.top + ch - zeroY)}"/></clipPath>`,
    '</defs>',
  ].join('\n');

  // Grid lines + Y-axis labels
  for (const v of yTicks) {
    const y = toY(v);
    const isZero = v === 0;
    svg.appendChild(svgEl('line', {
      x1: PAD.left, y1: y, x2: W - PAD.right, y2: y,
      stroke: isZero ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
      'stroke-width': 1,
      ...(isZero ? { 'stroke-dasharray': '4 4' } : {}),
    }));
    svg.appendChild(svgEl('text', {
      x: PAD.left - 6, y: y + 3.5, fill: 'rgba(255,255,255,0.25)',
      'font-size': 9, 'text-anchor': 'end', 'font-family': 'var(--font-mono, monospace)',
    }, fmtDollar(v)));
  }

  // Area fills (clipped above/below zero)
  svg.appendChild(svgEl('path', { d: areaD, fill: `url(#${uid}-gG)`, 'clip-path': `url(#${uid}-clipAbove)` }));
  svg.appendChild(svgEl('path', { d: areaD, fill: `url(#${uid}-gR)`, 'clip-path': `url(#${uid}-clipBelow)` }));

  // Lines (clipped for dual-tone green/red)
  svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: '#10B981', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'clip-path': `url(#${uid}-clipAbove)` }));
  svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: '#EF4444', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'clip-path': `url(#${uid}-clipBelow)` }));

  // X-axis date labels (max 6)
  const dateCount = Math.min(6, points.length);
  const rangeDays = points.length > 1 ? (points[points.length - 1].date - points[0].date) / 86400000 : 1;
  for (let i = 0; i < dateCount; i++) {
    const idx = Math.round(i / (dateCount - 1) * (points.length - 1));
    svg.appendChild(svgEl('text', {
      x: toX(idx), y: H - 6, fill: 'rgba(255,255,255,0.2)',
      'font-size': 9, 'text-anchor': 'middle',
    }, fmtAxisDate(points[idx].date, rangeDays)));
  }

  // Store point positions for crosshair hit-testing
  svg.dataset.points = JSON.stringify(points.map((p, i) => ({ x: toX(i), y: toY(p.cumPnl), cumPnl: p.cumPnl, date: p.date })));

  return svg;
}

let chartFilters = { range: 'all', accountId: 'all', strategyId: 'all', status: 'all' };

function statBox(label, value, tone) {
  return el('div', { class: 'pnl-stat' },
    el('div', { class: 'pnl-stat-l' }, label),
    el('div', { class: 'pnl-stat-v' + (tone ? ' ' + tone : '') }, value)
  );
}

function statsStrip(stats) {
  const pnlTone = stats.currentPnl >= 0 ? 'pos' : 'neg';
  const wrTone = stats.winRate >= 50 ? 'pos' : 'neg';
  const pfTone = stats.profitFactor >= 1 ? 'pos' : 'neg';

  return el('div', { class: 'pnl-stats-strip' },
    statBox('Current PnL', stats.totalTrades ? fmtMoney(stats.currentPnl, { dp: 0, sign: true }) : '—', stats.totalTrades ? pnlTone : ''),
    statBox('ATH', stats.totalTrades ? fmtMoney(stats.ath, { dp: 0, sign: true }) : '—', 'gold'),
    statBox('Max DD', stats.totalTrades ? fmtMoney(stats.maxDd, { dp: 0 }) : '—', stats.totalTrades ? 'neg' : ''),
    statBox('Trades', stats.totalTrades ? String(stats.totalTrades) : '—', ''),
    statBox('Win Rate', stats.totalTrades ? stats.winRate.toFixed(0) + '%' : '—', stats.totalTrades ? wrTone : ''),
    statBox('Avg Win', stats.totalTrades && stats.avgWin ? fmtMoney(stats.avgWin, { dp: 0 }) : '—', 'pos'),
    statBox('Avg Loss', stats.totalTrades && stats.avgLoss ? fmtMoney(stats.avgLoss, { dp: 0 }) : '—', 'neg'),
    statBox('Profit Factor', stats.totalTrades ? stats.profitFactor.toFixed(2) : '—', stats.totalTrades ? pfTone : '')
  );
}

function rangeRow(active, onChange) {
  const ranges = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'ytd', label: 'YTD' },
    { key: 'all', label: 'All' },
  ];
  return el('div', { class: 'pnl-range-row' },
    ...ranges.map(r =>
      el('button', {
        class: 'pnl-range-btn' + (active === r.key ? ' active' : ''),
        onClick: () => onChange(r.key),
      }, r.label)
    )
  );
}

function filterRow(onChange) {
  const accOptions = [{ value: 'all', label: 'All accounts' }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))];
  const stratOptions = [{ value: 'all', label: 'All strategies' }, ...data.strategies.map(s => ({ value: s.id, label: s.name }))];
  const statusOptions = [
    { value: 'all',    label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'passed', label: 'Passed' },
    { value: 'funded', label: 'Funded' },
    { value: 'blown',  label: 'Blown' },
  ];

  return el('div', { class: 'pnl-filter-row' },
    customSelect(accOptions, chartFilters.accountId, (v) => onChange('accountId', v)),
    customSelect(stratOptions, chartFilters.strategyId, (v) => onChange('strategyId', v)),
    customSelect(statusOptions, chartFilters.status, (v) => onChange('status', v))
  );
}

function attachCrosshair(wrap, svg) {
  const crosshair = el('div', { class: 'pnl-crosshair' });
  const dot = el('div', { class: 'pnl-dot' });
  const tooltip = el('div', { class: 'pnl-tooltip' },
    el('div', { class: 'pnl-tooltip-val' }),
    el('div', { class: 'pnl-tooltip-date' })
  );
  wrap.appendChild(crosshair);
  wrap.appendChild(dot);
  wrap.appendChild(tooltip);

  const show = (e) => {
    const pts = JSON.parse(svg.dataset.points || '[]');
    if (!pts.length) return;
    const rect = svg.getBoundingClientRect();
    const mx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const scaleX = rect.width > 0 ? parseFloat(svg.getAttribute('viewBox').split(' ')[2]) / rect.width : 1;

    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dist = Math.abs(pts[i].x - mx * scaleX);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    }

    const p = pts[closest];
    const pxX = p.x / scaleX;
    const pxY = p.y / scaleX;

    crosshair.style.display = 'block';
    crosshair.style.left = pxX + 'px';
    crosshair.style.height = rect.height + 'px';

    dot.style.display = 'block';
    dot.style.left = pxX + 'px';
    dot.style.top = pxY + 'px';

    const sign = p.cumPnl >= 0 ? '+' : '';
    tooltip.querySelector('.pnl-tooltip-val').textContent = sign + fmtMoney(p.cumPnl, { dp: 2 });
    tooltip.querySelector('.pnl-tooltip-date').textContent = fmtDate(p.date);
    tooltip.style.display = 'block';
    const tipLeft = pxX + 16;
    const tipTop = pxY - 20;
    tooltip.style.left = (tipLeft + tooltip.offsetWidth > rect.width ? pxX - tooltip.offsetWidth - 12 : tipLeft) + 'px';
    tooltip.style.top = Math.max(0, tipTop) + 'px';
  };

  const hide = () => {
    crosshair.style.display = 'none';
    dot.style.display = 'none';
    tooltip.style.display = 'none';
  };

  svg.addEventListener('mousemove', show);
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('touchstart', show, { passive: true });
  svg.addEventListener('touchend', hide);
}

function renderChart(container, heightOverride) {
  container.innerHTML = '';
  const { points, stats } = computePnlData(data.journals, chartFilters);

  container.appendChild(statsStrip(stats));
  container.appendChild(rangeRow(chartFilters.range, (key) => {
    chartFilters.range = key;
    renderChart(container, heightOverride);
  }));
  container.appendChild(filterRow((field, value) => {
    chartFilters[field] = value;
    renderChart(container, heightOverride);
  }));

  const wrap = el('div', { class: 'pnl-chart-wrap' });
  const svg = buildChartSVG(points, { height: heightOverride || 280 });
  wrap.appendChild(svg);
  attachCrosshair(wrap, svg);
  container.appendChild(wrap);
}

function openPnlOverlay() {
  const existing = document.querySelector('.pnl-chart-overlay');
  if (existing) existing.remove();

  const content = el('div', { class: 'pnl-chart-content' });

  const overlay = el('div', { class: 'pnl-chart-overlay' },
    el('div', { style: { position: 'relative', maxWidth: '1200px', width: '100%', margin: '0 auto' } },
      el('div', { class: 'pnl-overlay-title' }, 'Cumulative PnL'),
      el('button', { class: 'pnl-overlay-close', onClick: close },
        el('span', { html: iconSVG('close') }), ' Close'
      ),
      content
    )
  );

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  renderChart(content, 500);
  document.body.appendChild(overlay);
}

export function pnlChartSection() {
  const content = el('div', { class: 'pnl-chart-content' });
  const card = el('section', { class: 'card pnl-chart-card' + (!data.journals.length ? ' empty' : '') },
    el('div', { class: 'pnl-chart-head' },
      el('h2', {}, 'Cumulative PnL'),
      el('button', { class: 'pnl-expand-btn', onClick: () => openPnlOverlay() },
        el('span', { html: iconSVG('expand') }), ' Expand'
      )
    ),
    content
  );
  renderChart(content);
  return card;
}
