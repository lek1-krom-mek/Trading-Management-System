export const SOP_RULE_KEYS = ['rule_1','rule_2','rule_3','rule_4','rule_5','rule_6','rule_7','rule_8'];
export const TRADER_TZ_OFFSET_MINUTES = 420;

export function computeJournalGrade(sopChecks) {
  const n = SOP_RULE_KEYS.reduce((c, k) => c + (sopChecks?.[k]?.confirmed === true ? 1 : 0), 0);
  const grade = n >= 7 ? 'A' : n >= 5 ? 'B' : n >= 3 ? 'C' : 'Off-SOP';
  return { grade, confluenceCount: n };
}

export function validateSopChecks(sopChecks) {
  if (sopChecks == null) return { ok: true };
  if (typeof sopChecks !== 'object') return { ok: false, msg: 'sopChecks must be an object' };
  for (const k of SOP_RULE_KEYS) {
    if (!(k in sopChecks)) return { ok: false, msg: `sopChecks missing rule key: ${k}` };
  }
  return { ok: true };
}

export function computeCapState({ dailyPnlToday, startingCapital, personalDailyCapPct, firmDailyCapPct }) {
  const balance = Number(startingCapital) || 0;
  const personalPct = Number(personalDailyCapPct) || 3.0;
  const firmPct = Number(firmDailyCapPct) || 5.0;
  const pnl = Number(dailyPnlToday) || 0;

  const personalCapDollars = -(balance * personalPct / 100);
  const firmCapDollars = -(balance * firmPct / 100);
  const personalCapPctUsed = balance > 0 && pnl < 0 ? Math.abs(pnl / personalCapDollars * 100) : 0;
  const firmCapPctUsed = balance > 0 && pnl < 0 ? Math.abs(pnl / firmCapDollars * 100) : 0;

  let capState = 'safe';
  if (firmCapPctUsed >= 100) capState = 'firm_breached';
  else if (personalCapPctUsed >= 100) capState = 'personal_breached';
  else if (personalCapPctUsed >= 90) capState = 'breach_imminent';
  else if (personalCapPctUsed >= 70) capState = 'warning';
  else if (personalCapPctUsed >= 40) capState = 'caution';

  return { dailyPnlToday: pnl, personalCapDollars, firmCapDollars, personalCapPctUsed, firmCapPctUsed, capState };
}

export function todayBoundsMs(now = Date.now()) {
  const localNow = now + TRADER_TZ_OFFSET_MINUTES * 60_000;
  const dayMs = 24 * 60 * 60 * 1000;
  const startLocal = Math.floor(localNow / dayMs) * dayMs;
  const endLocal = startLocal + dayMs;
  return {
    startUtcMs: startLocal - TRADER_TZ_OFFSET_MINUTES * 60_000,
    endUtcMs: endLocal - TRADER_TZ_OFFSET_MINUTES * 60_000,
  };
}

export function dailyPnlForAccount(accountId, journals) {
  const { startUtcMs, endUtcMs } = todayBoundsMs();
  return journals
    .filter(j => j.accountId === accountId && j.entryDate >= startUtcMs && j.entryDate < endUtcMs)
    .reduce((sum, j) => {
      if (j.result === 'win') return sum + (Number(j.amount) || 0);
      if (j.result === 'loss') return sum - (Number(j.amount) || 0);
      return sum;
    }, 0);
}

export function enrichAccount(account, journals) {
  const pnl = dailyPnlForAccount(account.id, journals);
  const cap = computeCapState({
    dailyPnlToday: pnl,
    startingCapital: account.startingCapital ?? account.capital,
    personalDailyCapPct: account.personalDailyCapPct,
    firmDailyCapPct: account.firmDailyCapPct,
  });
  return { ...account, ...cap };
}
