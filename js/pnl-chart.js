import { data, journalHasStrategy } from './store.js';
import { el, fmtMoney, fmtDate, iconSVG } from './utils.js';

function computePnlData(journals, filters) {
  const { range, accountId, strategyId } = filters;

  let filtered = journals.filter(j => {
    if (accountId && accountId !== 'all' && j.accountId !== accountId) return false;
    if (strategyId && strategyId !== 'all' && !journalHasStrategy(j, strategyId)) return false;
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
    return el('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, class: 'pnl-svg' },
      el('line', { x1: PAD.left, y1: zeroY, x2: W - PAD.right, y2: zeroY, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }),
      el('text', { x: W / 2, y: zeroY - 12, fill: 'rgba(255,255,255,0.3)', 'font-size': 12, 'text-anchor': 'middle', 'font-family': 'var(--font-mono, monospace)' }, 'No trades in this period')
    );
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

  const svg = el('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}`, class: 'pnl-svg', 'data-uid': uid });

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
    svg.appendChild(el('line', {
      x1: PAD.left, y1: y, x2: W - PAD.right, y2: y,
      stroke: isZero ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
      'stroke-width': 1,
      ...(isZero ? { 'stroke-dasharray': '4 4' } : {}),
    }));
    svg.appendChild(el('text', {
      x: PAD.left - 6, y: y + 3.5, fill: 'rgba(255,255,255,0.25)',
      'font-size': 9, 'text-anchor': 'end', 'font-family': 'var(--font-mono, monospace)',
    }, fmtDollar(v)));
  }

  // Area fills (clipped above/below zero)
  const areaAbove = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaAbove.setAttribute('d', areaD);
  areaAbove.setAttribute('fill', `url(#${uid}-gG)`);
  areaAbove.setAttribute('clip-path', `url(#${uid}-clipAbove)`);
  svg.appendChild(areaAbove);

  const areaBelow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaBelow.setAttribute('d', areaD);
  areaBelow.setAttribute('fill', `url(#${uid}-gR)`);
  areaBelow.setAttribute('clip-path', `url(#${uid}-clipBelow)`);
  svg.appendChild(areaBelow);

  // Lines (clipped for dual-tone green/red)
  const lineAbove = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lineAbove.setAttribute('d', pathD);
  lineAbove.setAttribute('fill', 'none');
  lineAbove.setAttribute('stroke', '#10B981');
  lineAbove.setAttribute('stroke-width', '2.5');
  lineAbove.setAttribute('stroke-linejoin', 'round');
  lineAbove.setAttribute('stroke-linecap', 'round');
  lineAbove.setAttribute('clip-path', `url(#${uid}-clipAbove)`);
  svg.appendChild(lineAbove);

  const lineBelow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lineBelow.setAttribute('d', pathD);
  lineBelow.setAttribute('fill', 'none');
  lineBelow.setAttribute('stroke', '#EF4444');
  lineBelow.setAttribute('stroke-width', '2.5');
  lineBelow.setAttribute('stroke-linejoin', 'round');
  lineBelow.setAttribute('stroke-linecap', 'round');
  lineBelow.setAttribute('clip-path', `url(#${uid}-clipBelow)`);
  svg.appendChild(lineBelow);

  // X-axis date labels (max 6)
  const dateCount = Math.min(6, points.length);
  const rangeDays = points.length > 1 ? (points[points.length - 1].date - points[0].date) / 86400000 : 1;
  for (let i = 0; i < dateCount; i++) {
    const idx = Math.round(i / (dateCount - 1) * (points.length - 1));
    svg.appendChild(el('text', {
      x: toX(idx), y: H - 6, fill: 'rgba(255,255,255,0.2)',
      'font-size': 9, 'text-anchor': 'middle',
    }, fmtAxisDate(points[idx].date, rangeDays)));
  }

  // Store point positions for crosshair hit-testing
  svg.dataset.points = JSON.stringify(points.map((p, i) => ({ x: toX(i), y: toY(p.cumPnl), cumPnl: p.cumPnl, date: p.date })));

  return svg;
}
