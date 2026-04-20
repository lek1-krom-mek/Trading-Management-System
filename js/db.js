/**
 * db.js — HTTP client for the local SQLite-backed TMS API.
 *
 * Same public API as the old IndexedDB wrapper so store.js and page
 * modules don't need to change: db.getAll, db.get, db.put, db.del, uid.
 * Adds uploadScreenshot() for multipart file upload.
 */

const BASE = '/api';

async function parseJson(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  return res.json();
}

export const db = {
  async getAll(store) {
    return parseJson(await fetch(`${BASE}/${store}`));
  },
  async get(store, id) {
    const r = await fetch(`${BASE}/${store}/${encodeURIComponent(id)}`);
    if (r.status === 404) return null;
    return parseJson(r);
  },
  async put(store, obj) {
    obj.updatedAt = Date.now();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    const r = await fetch(`${BASE}/${store}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(obj),
    });
    return parseJson(r);
  },
  async del(store, id) {
    const r = await fetch(`${BASE}/${store}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`delete ${store}/${id} failed: ${r.status}`);
  },
};

export async function uploadScreenshot(file) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
  const body = await parseJson(r);
  return body.path;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
