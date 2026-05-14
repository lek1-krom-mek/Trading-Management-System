/** Export/import backup for IndexedDB data. */

import { getAllRaw, putAllRaw, clearAll } from './db-idb.js';

const DATA_STORES = ['accounts', 'strategies', 'journals', 'plans', 'checks'];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(b64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

export async function exportBackup({ includeScreenshots = false } = {}) {
  const data = {};
  for (const store of DATA_STORES) {
    data[store] = await getAllRaw(store);
  }

  let screenshots = undefined;
  if (includeScreenshots) {
    const raws = await getAllRaw('screenshots');
    screenshots = {};
    for (const rec of raws) {
      if (rec.blob) {
        screenshots[rec.id] = await blobToBase64(rec.blob);
      }
    }
  }

  const payload = {
    version: 1,
    exportedAt: Date.now(),
    data,
  };
  if (screenshots) payload.screenshots = screenshots;

  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tms-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importBackup(file, { mode = 'replace' } = {}) {
  const text = await file.text();
  const payload = JSON.parse(text);

  if (payload.version !== 1) throw new Error('Unsupported backup version');
  if (!payload.data) throw new Error('Invalid backup file: missing data');

  if (mode === 'replace') {
    await clearAll();
  }

  const counts = {};
  for (const store of DATA_STORES) {
    const items = payload.data[store] || [];
    if (items.length) await putAllRaw(store, items);
    counts[store] = items.length;
  }

  counts.screenshots = 0;
  if (payload.screenshots) {
    const entries = Object.entries(payload.screenshots);
    const screenshotRecords = entries.map(([id, dataUrl]) => ({
      id,
      blob: base64ToBlob(dataUrl),
      mimeType: dataUrl.match(/:(.*?);/)[1],
      createdAt: Date.now(),
    }));
    if (screenshotRecords.length) await putAllRaw('screenshots', screenshotRecords);
    counts.screenshots = screenshotRecords.length;
  }

  return { success: true, counts };
}
