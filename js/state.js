/**
 * state.js — Single source of truth for all calculator values.
 *
 * Centralising state here means future views (journal, charts, history)
 * can import the same object instead of reading the DOM directly.
 * localStorage persistence is handled here so every module benefits
 * automatically by calling saveState() after any mutation.
 */

const STORAGE_KEY = 'rc-state';

export const state = {
  // Account settings
  balance:    2000,
  dailyPct:   5,
  maxlossPct: 10,
  targetPct:  8,

  // Trade parameters
  riskPct:     1,
  slPips:      20,
  rr:          2,
  tradesPerDay: 1,
};

/** Merge any previously saved values over the defaults. */
export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) Object.assign(state, JSON.parse(saved));
  } catch {
    // Silently ignore — corrupt or missing storage; defaults are fine.
  }
}

/** Persist current state so it survives page refresh. */
export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota exceeded or private-mode restriction — non-fatal.
  }
}
