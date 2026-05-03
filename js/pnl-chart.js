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
