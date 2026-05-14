import { openDatabase, putAllRaw } from './db-idb.js';

const STORES = ['accounts', 'strategies', 'journals', 'plans', 'checks'];

export async function migrateServerToIdb(onProgress) {
  const report = (step, total, current, label) => {
    if (onProgress) onProgress({ step, total, current, label });
  };

  await openDatabase();
  const counts = { accounts: 0, strategies: 0, journals: 0, plans: 0, checks: 0, screenshots: 0 };

  const data = {};
  for (let i = 0; i < STORES.length; i++) {
    const store = STORES[i];
    report(1, STORES.length, i + 1, `Fetching ${store}...`);
    const res = await fetch(`/api/${store}`);
    if (!res.ok) throw new Error(`Failed to fetch ${store}: ${res.status}`);
    data[store] = await res.json();
    counts[store] = data[store].length;
  }

  const allWithScreenshots = [
    ...data.journals.map(j => ({ record: j, store: 'journals' })),
    ...data.plans.map(p => ({ record: p, store: 'plans' })),
  ].filter(({ record }) => record.screenshotPath && record.screenshotPath.startsWith('/uploads/'));

  const screenshotRecords = [];
  for (let i = 0; i < allWithScreenshots.length; i++) {
    const { record } = allWithScreenshots[i];
    report(2, allWithScreenshots.length, i + 1, `Downloading screenshot ${i + 1}/${allWithScreenshots.length}...`);
    try {
      const imgRes = await fetch(record.screenshotPath);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const id = `idb://sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        screenshotRecords.push({ id, blob, mimeType: blob.type, createdAt: Date.now() });
        record.screenshotPath = id;
        counts.screenshots++;
      }
    } catch (_) {
    }
  }

  report(3, 1, 1, 'Writing to IndexedDB...');

  if (screenshotRecords.length > 0) {
    await putAllRaw('screenshots', screenshotRecords);
  }

  for (const store of STORES) {
    if (data[store].length > 0) {
      await putAllRaw(store, data[store]);
    }
  }

  return { success: true, counts };
}
