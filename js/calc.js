/**
 * calc.js — Pure calculation functions.
 *
 * No DOM, no side-effects, no imports. Takes state values,
 * returns a result object. Easy to unit-test and reuse in
 * future chart or journal modules.
 *
 * XAU/USD pip formula:
 *   Pip value = $10 per pip per standard lot
 *              (10 pips = $1 per 0.01 lot)
 */

const PIP_VAL = 10; // USD per pip per 1.00 lot

/**
 * @param {object} s — state snapshot
 * @returns {object} all derived values needed by the UI
 */
export function calculate(s) {
  const dailyLimit = s.balance * (s.dailyPct   / 100);
  const maxLoss    = s.balance * (s.maxlossPct / 100);
  const target     = s.balance * (s.targetPct  / 100);
  const riskDollar = s.balance * (s.riskPct    / 100);
  const lotSize    = riskDollar / (s.slPips * PIP_VAL);
  const tpPips     = s.slPips * s.rr;
  const profit     = riskDollar * s.rr;
  const maxLot     = dailyLimit / (s.tradesPerDay * s.slPips * PIP_VAL);

  return { dailyLimit, maxLoss, target, riskDollar, lotSize, tpPips, profit, maxLot };
}
