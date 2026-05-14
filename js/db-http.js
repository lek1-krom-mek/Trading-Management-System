// HTTP adapter — talks to the Express /api backend
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

async function getAll(store) {
  return parseJson(await fetch(`${BASE}/${store}`));
}

async function get(store, id) {
  const r = await fetch(`${BASE}/${store}/${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  return parseJson(r);
}

async function put(store, obj) {
  const r = await fetch(`${BASE}/${store}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  });
  return parseJson(r);
}

async function del(store, id) {
  const r = await fetch(`${BASE}/${store}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`delete ${store}/${id} failed: ${r.status}`);
}

async function uploadScreenshot(file) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
  const body = await parseJson(r);
  return body.path;
}

export const httpAdapter = { getAll, get, put, del, uploadScreenshot };

export function resolveScreenshotUrl(path) { return path; }
