/**
 * router.js — Hash-based SPA router.
 * Routes: #dashboard, #accounts, #strategies, #backtesting, #calculator
 * Supports sub-routes via query-ish suffix: #strategies/:id, #accounts/:id
 */

const routes = new Map();
let currentRoute = null;

export function register(name, handler) { routes.set(name, handler); }

export function parseHash() {
  const h = (location.hash || '#dashboard').slice(1);
  const [name, ...rest] = h.split('/');
  return { name: name || 'dashboard', param: rest.join('/') || null };
}

export function go(path) {
  if (location.hash === '#' + path) {
    resolve();
  } else {
    location.hash = '#' + path;
  }
}

export function current() { return currentRoute; }

function resolve() {
  const { name, param } = parseHash();
  currentRoute = { name, param };

  // Set active nav state
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === name);
  });

  // Hide all pages, show the target
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === name);
  });

  const h = routes.get(name) || routes.get('dashboard');
  if (h) h(param);
}

export function initRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
