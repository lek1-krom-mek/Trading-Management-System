/** IndexedDB adapter — same interface as db-http.js, stores everything locally in the browser. */

const DB_NAME = 'tms-data';
const DB_VERSION = 1;

const STORE_MAP = {
  accounts: 'accounts',
  strategies: 'strategies',
  journals: 'journals',
  plans: 'trade_plans',
  checks: 'checks',
};

function resolveStore(store) {
  return STORE_MAP[store] || store;
}

let _db = null;

export function openDatabase() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('accounts')) {
        const s = db.createObjectStore('accounts', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('strategies')) {
        const s = db.createObjectStore('strategies', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('journals')) {
        const s = db.createObjectStore('journals', { keyPath: 'id' });
        s.createIndex('accountId', 'accountId', { unique: false });
        s.createIndex('entryDate', 'entryDate', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('trade_plans')) {
        const s = db.createObjectStore('trade_plans', { keyPath: 'id' });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('checks')) {
        const s = db.createObjectStore('checks', { keyPath: 'id' });
        s.createIndex('scope', 'scope', { unique: false });
        s.createIndex('strategyId', 'strategyId', { unique: false });
      }

      if (!db.objectStoreNames.contains('screenshots')) {
        db.createObjectStore('screenshots', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode) {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const idbAdapter = {
  async getAll(store, filters) {
    await openDatabase();
    const name = resolveStore(store);
    const all = await reqToPromise(tx(name, 'readonly').getAll());
    let results = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (store === 'journals' && filters && filters.grade) {
      const grades = filters.grade.split(',').map((g) => g.trim());
      results = results.filter((j) => {
        if (j.preGrading) return true;
        return grades.includes(j.grade);
      });
    }

    return results;
  },

  async get(store, id) {
    await openDatabase();
    const name = resolveStore(store);
    const result = await reqToPromise(tx(name, 'readonly').get(id));
    return result || null;
  },

  async put(store, obj) {
    await openDatabase();
    const name = resolveStore(store);
    const now = Date.now();
    const record = { ...obj, updatedAt: now };
    if (!record.createdAt) record.createdAt = now;
    await reqToPromise(tx(name, 'readwrite').put(record));
    return record;
  },

  async del(store, id) {
    await openDatabase();
    const name = resolveStore(store);
    const record = await reqToPromise(tx(name, 'readonly').get(id));

    if (record) {
      const blobKeys = ['screenshotPath', 'exitScreenshotPath']
        .map(k => record[k])
        .filter(p => p && typeof p === 'string' && p.startsWith('idb://'));
      if (blobKeys.length) {
        const scTx = _db.transaction('screenshots', 'readwrite').objectStore('screenshots');
        for (const key of blobKeys) await reqToPromise(scTx.delete(key));
      }
    }

    if (store === 'journals' && record && record.planId) {
      const planStore = tx('trade_plans', 'readwrite');
      const plan = await reqToPromise(planStore.get(record.planId));
      if (plan) {
        await reqToPromise(planStore.put({ ...plan, journalId: null, updatedAt: Date.now() }));
      }
    }

    if (store === 'plans' && record && record.journalId) {
      const journalStore = tx('journals', 'readwrite');
      const journal = await reqToPromise(journalStore.get(record.journalId));
      if (journal) {
        await reqToPromise(journalStore.put({ ...journal, planId: null, updatedAt: Date.now() }));
      }
    }

    await reqToPromise(tx(name, 'readwrite').delete(id));
  },

  async uploadScreenshot(file) {
    await openDatabase();
    const rand = Math.random().toString(36).slice(2, 8);
    const id = `idb://sc-${Date.now()}-${rand}`;
    const record = { id, blob: file, mimeType: file.type, createdAt: Date.now() };
    const scStore = _db.transaction('screenshots', 'readwrite').objectStore('screenshots');
    await reqToPromise(scStore.put(record));
    return id;
  },
};

export async function resolveScreenshotUrl(path) {
  if (!path) return null;
  if (!path.startsWith('idb://')) return path;
  await openDatabase();
  const scStore = _db.transaction('screenshots', 'readonly').objectStore('screenshots');
  const record = await reqToPromise(scStore.get(path));
  if (!record || !record.blob) return null;
  return URL.createObjectURL(record.blob);
}

export async function getAllRaw(store) {
  await openDatabase();
  const name = resolveStore(store);
  return reqToPromise(tx(name, 'readonly').getAll());
}

export async function putAllRaw(store, items) {
  await openDatabase();
  const name = resolveStore(store);
  const objectStore = _db.transaction(name, 'readwrite').objectStore(name);
  for (const item of items) {
    await reqToPromise(objectStore.put(item));
  }
}

export async function clearAll() {
  await openDatabase();
  const storeNames = ['accounts', 'strategies', 'journals', 'trade_plans', 'checks', 'screenshots'];
  const transaction = _db.transaction(storeNames, 'readwrite');
  for (const name of storeNames) {
    await reqToPromise(transaction.objectStore(name).clear());
  }
}
