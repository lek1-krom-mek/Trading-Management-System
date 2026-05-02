/**
 * grading.js — Pure grade computation for trade plans.
 *
 * Grades:
 *   SKIP — at least one must-pass check unticked
 *   A    — all must-pass ticked AND scored ratio ≥ 0.90 (or no scored checks)
 *   B    — all must-pass ticked AND scored ratio ≥ 0.70
 *   C    — all must-pass ticked AND scored ratio  < 0.70
 *
 * @param {Record<string, boolean>} checkResults  Map of checkId → ticked.
 * @param {Array<{id: string, mustPass: boolean}>} checks  All checks shown on the form.
 * @returns {'A' | 'B' | 'C' | 'SKIP'}
 */
export function computeGrade(checkResults, checks) {
  const ticked = id => checkResults[id] === true;

  const mustPass = checks.filter(c => c.mustPass);
  const scored   = checks.filter(c => !c.mustPass);

  if (mustPass.some(c => !ticked(c.id))) return 'SKIP';
  if (scored.length === 0) return 'A';

  const ratio = scored.filter(c => ticked(c.id)).length / scored.length;
  if (ratio >= 0.90) return 'A';
  if (ratio >= 0.70) return 'B';
  return 'C';
}

/**
 * Returns the unique union of `globalChecks` and per-strategy checks for the
 * selected strategies. Dedup is by case-insensitive label. Globals always come first.
 *
 * @param {Array<Check>} globalChecks
 * @param {Map<string, Array<Check>>} byStrategy  strategyId → its checks
 * @param {string[]} selectedStrategyIds
 * @returns {Array<Check>}
 */
export function checksForPlan(globalChecks, byStrategy, selectedStrategyIds) {
  const seen = new Set();
  const out = [];
  const push = c => {
    const key = (c.label || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  [...globalChecks].sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(push);
  for (const sid of selectedStrategyIds || []) {
    const list = byStrategy.get(sid) || [];
    [...list].sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(push);
  }
  return out;
}

/**
 * Post-trade SOP grade. Counts confirmed rules out of 8.
 *   ≥7 → A, ≥5 → B, ≥3 → C, else Off-SOP.
 * Distinct from the plan-time `computeGrade` above — they use different inputs
 * and different vocab (Off-SOP vs SKIP) by design.
 *
 * @param {Record<string, { confirmed?: boolean, note?: string }>|null|undefined} sopChecks
 * @returns {{ grade: 'A'|'B'|'C'|'Off-SOP', confluenceCount: number }}
 */
export function computeJournalGrade(sopChecks) {
  const confluenceCount = Object.values(sopChecks || {})
    .filter(r => r && r.confirmed === true).length;
  const grade = confluenceCount >= 7 ? 'A'
              : confluenceCount >= 5 ? 'B'
              : confluenceCount >= 3 ? 'C'
              : 'Off-SOP';
  return { grade, confluenceCount };
}
