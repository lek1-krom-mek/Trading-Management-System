/** Detect whether TMS runs against the Node server or browser IndexedDB. */

export async function detectMode() {
  const cached = sessionStorage.getItem('tms-mode');
  if (cached === 'http' || cached === 'idb') return cached;

  let mode = 'idb';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch('/api/accounts', { method: 'HEAD', signal: ctrl.signal });
    if (res.ok) mode = 'http';
  } catch {
    mode = 'idb';
  }

  sessionStorage.setItem('tms-mode', mode);
  return mode;
}

export async function createAdapter() {
  const mode = await detectMode();

  if (mode === 'http') {
    const { httpAdapter: adapter } = await import('./db-http.js');
    return { adapter, mode };
  }

  const { idbAdapter: adapter } = await import('./db-idb.js');
  return { adapter, mode };
}
