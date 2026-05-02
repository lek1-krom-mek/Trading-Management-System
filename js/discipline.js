/**
 * discipline.js — Pure analytics over plans + journals.
 *
 * No DOM dependencies — returns data shapes that the UI then renders.
 */

/**
 * Win rate by grade. Considers only executed plans whose linked journal has
 * result IN ('win', 'loss'). Breakeven excluded from denominator.
 *
 * @param {Plan[]} plans
 * @param {Journal[]} journals
 * @returns {Record<'A'|'B'|'C'|'SKIP', { wins: number, losses: number, winRate: number }>}
 */
export function winRateByGrade(plans, journals) {
  const journalById = new Map(journals.map(j => [j.id, j]));
  const buckets = { A: { wins: 0, losses: 0 }, B: { wins: 0, losses: 0 },
                    C: { wins: 0, losses: 0 }, SKIP: { wins: 0, losses: 0 } };
  for (const p of plans) {
    if (p.status !== 'executed' || !p.journalId) continue;
    const j = journalById.get(p.journalId);
    if (!j || (j.result !== 'win' && j.result !== 'loss')) continue;
    const bucket = buckets[p.grade] || buckets.C;
    if (j.result === 'win') bucket.wins++; else bucket.losses++;
  }
  const out = {};
  for (const [grade, b] of Object.entries(buckets)) {
    const total = b.wins + b.losses;
    out[grade] = { wins: b.wins, losses: b.losses,
                   winRate: total ? (b.wins / total) * 100 : 0 };
  }
  return out;
}

/**
 * Expectancy ($/trade) by grade — sum of signed P&L over count of executed plans.
 */
export function expectancyByGrade(plans, journals) {
  const journalById = new Map(journals.map(j => [j.id, j]));
  const buckets = { A: [0, 0], B: [0, 0], C: [0, 0], SKIP: [0, 0] };
  for (const p of plans) {
    if (p.status !== 'executed' || !p.journalId) continue;
    const j = journalById.get(p.journalId);
    if (!j) continue;
    const amt = Math.abs(parseFloat(j.amount) || 0);
    const signed = j.result === 'win' ? amt : j.result === 'loss' ? -amt : 0;
    const b = buckets[p.grade] || buckets.C;
    b[0]++;
    b[1] += signed;
  }
  const out = {};
  for (const [grade, [count, total]] of Object.entries(buckets)) {
    out[grade] = { count, total, expectancy: count ? total / count : 0 };
  }
  return out;
}

/**
 * Discipline violations — count + total PnL of executed plans flagged as violations.
 */
export function disciplineViolations(plans, journals) {
  const journalById = new Map(journals.map(j => [j.id, j]));
  const violations = plans.filter(p => p.disciplineViolation && p.status === 'executed');
  let total = 0;
  for (const p of violations) {
    const j = journalById.get(p.journalId);
    if (!j) continue;
    const amt = Math.abs(parseFloat(j.amount) || 0);
    total += j.result === 'win' ? amt : j.result === 'loss' ? -amt : 0;
  }
  return { count: violations.length, total };
}

/**
 * Skip ratio over the last N days. (skipped + executed) is the denominator.
 */
export function skipRatio(plans, days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = plans.filter(p => (p.createdAt || 0) >= cutoff);
  const decisive = recent.filter(p => p.status === 'skipped' || p.status === 'executed');
  if (!decisive.length) return { ratio: 0, skipped: 0, executed: 0 };
  const skipped  = decisive.filter(p => p.status === 'skipped').length;
  const executed = decisive.filter(p => p.status === 'executed').length;
  return { ratio: skipped / decisive.length, skipped, executed };
}

/**
 * Top failed checks across all SKIP-graded plans (regardless of status).
 */
export function topFailedChecks(plans, allChecks, topN = 3) {
  const checkById = new Map(allChecks.map(c => [c.id, c]));
  const counts = new Map();
  for (const p of plans) {
    if (p.grade !== 'SKIP') continue;
    const results = p.checkResults || {};
    for (const c of allChecks) {
      if (!c.mustPass) continue;
      if (!(c.id in results)) continue;
      if (results[c.id] === false) {
        counts.set(c.id, (counts.get(c.id) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, count]) => ({ check: checkById.get(id), count }));
}
