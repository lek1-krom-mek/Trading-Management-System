/**
 * store.js — In-memory cache over db.js. Modules subscribe to change events
 * so dashboards, lists, and detail views stay in sync after any CRUD op.
 */

import { db, uid } from './db.js';

export const data = {
  accounts:   [],
  strategies: [],
  backtests:  [],
  activeAccountId: null,
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify(type) { listeners.forEach(fn => fn(type)); }

export async function loadAll() {
  const [a, s, b] = await Promise.all([
    db.getAll('accounts'),
    db.getAll('strategies'),
    db.getAll('backtests'),
  ]);
  data.accounts   = a.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.strategies = s.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.backtests  = b.sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  data.activeAccountId = localStorage.getItem('tms-active-account') || (data.accounts[0]?.id || null);
  notify('all');
}

export function setActiveAccount(id) {
  data.activeAccountId = id;
  localStorage.setItem('tms-active-account', id || '');
  notify('active');
}

export async function saveAccount(obj) {
  if (!obj.id) obj.id = uid();
  await db.put('accounts', obj);
  const i = data.accounts.findIndex(x => x.id === obj.id);
  if (i >= 0) data.accounts[i] = obj; else data.accounts.unshift(obj);
  if (!data.activeAccountId) setActiveAccount(obj.id);
  notify('accounts');
  return obj;
}
export async function deleteAccount(id) {
  await db.del('accounts', id);
  data.accounts = data.accounts.filter(x => x.id !== id);
  // Unlink from strategies' implicit usage and from backtests
  data.backtests.forEach(b => { if (b.accountId === id) b.accountId = null; });
  if (data.activeAccountId === id) setActiveAccount(data.accounts[0]?.id || null);
  notify('accounts');
}

export async function saveStrategy(obj) {
  if (!obj.id) obj.id = uid();
  await db.put('strategies', obj);
  const i = data.strategies.findIndex(x => x.id === obj.id);
  if (i >= 0) data.strategies[i] = obj; else data.strategies.unshift(obj);
  notify('strategies');
  return obj;
}
export async function deleteStrategy(id) {
  await db.del('strategies', id);
  data.strategies = data.strategies.filter(x => x.id !== id);
  // Remove references from accounts
  for (const a of data.accounts) {
    if (a.strategyIds?.includes(id)) {
      a.strategyIds = a.strategyIds.filter(x => x !== id);
      await db.put('accounts', a);
    }
  }
  notify('strategies');
}

export async function saveBacktest(obj) {
  if (!obj.id) obj.id = uid();
  await db.put('backtests', obj);
  const i = data.backtests.findIndex(x => x.id === obj.id);
  if (i >= 0) data.backtests[i] = obj; else data.backtests.unshift(obj);
  notify('backtests');
  return obj;
}
export async function deleteBacktest(id) {
  await db.del('backtests', id);
  data.backtests = data.backtests.filter(x => x.id !== id);
  notify('backtests');
}

// ── Derived helpers ──────────────────────────────────────
export function accountById(id)   { return data.accounts.find(a => a.id === id); }
export function strategyById(id)  { return data.strategies.find(s => s.id === id); }
export function activeAccount()   { return accountById(data.activeAccountId); }

export function strategyStats(strategyId) {
  const bt = data.backtests.filter(b => b.strategyId === strategyId);
  const wins = bt.filter(b => b.result === 'win').length;
  const losses = bt.filter(b => b.result === 'loss').length;
  const be = bt.filter(b => b.result === 'be').length;
  const total = bt.length;
  const winRate = total ? (wins / (wins + losses || 1)) * 100 : 0;
  const rs = bt.map(b => parseFloat(b.rAchieved) || 0).filter(r => !isNaN(r));
  const avgR = rs.length ? rs.reduce((a,b) => a+b, 0) / rs.length : 0;
  const winR = bt.filter(b => b.result === 'win').reduce((a,b) => a + (parseFloat(b.rAchieved)||0), 0);
  const lossR = bt.filter(b => b.result === 'loss').reduce((a,b) => a + Math.abs(parseFloat(b.rAchieved)||1), 0);
  const profitFactor = lossR > 0 ? winR / lossR : (winR > 0 ? 99 : 0);
  return { total, wins, losses, be, winRate, avgR, profitFactor };
}

export function accountsUsingStrategy(strategyId) {
  return data.accounts.filter(a => a.strategyIds?.includes(strategyId));
}
