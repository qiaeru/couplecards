// SPDX-License-Identifier: MIT
// SPA router: loads HTML partials from /views/<name>.html into <main id="view">,
// invokes mount/unmount hooks on the matching feature module.

import { applyI18n } from './i18n.js';

const partialCache = new Map();
const features = new Map();
// Per-route scroll positions, restored only when the navigation comes from
// the browser history (back/forward). Fresh nav (link click, navigate())
// always lands at the top.
const scrollPositions = new Map();
let currentRoute = null;
let currentModule = null;
let outlet = null;
let isHistoryNav = false;

export function registerFeature(name, loader) {
  features.set(name, loader);
}

export function setOutlet(el) {
  outlet = el;
}

async function loadPartial(name) {
  if (partialCache.has(name)) return partialCache.get(name);
  const resp = await fetch(`/views/${name}.html`, { credentials: 'same-origin' });
  if (!resp.ok) throw new Error(`partial ${name} failed to load`);
  const html = await resp.text();
  partialCache.set(name, html);
  return html;
}

function parsePath() {
  // Using hash-based routing keeps us immune to backend rewrites.
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const segment = path.replace(/^\//, '').split('/')[0] || 'home';
  return { segment, params };
}

export async function navigate(name, params = {}) {
  const hash = '#/' + name + (Object.keys(params).length
    ? '?' + new URLSearchParams(params).toString()
    : '');
  if (location.hash === hash) {
    await render();
  } else {
    location.hash = hash;
  }
}

export async function render() {
  if (!outlet) return;
  const { segment, params } = parsePath();
  if (!features.has(segment)) return;

  // Snapshot the scroll position of the screen we are about to leave, so a
  // future browser back can restore it.
  if (currentRoute) scrollPositions.set(currentRoute, window.scrollY);
  const restoreScroll = isHistoryNav;
  isHistoryNav = false;

  if (currentModule && typeof currentModule.unmount === 'function') {
    try { currentModule.unmount(); } catch (err) { console.error('unmount failed', err); }
  }

  const html = await loadPartial(segment);
  outlet.innerHTML = html;
  applyI18n(outlet);

  const module = await features.get(segment)();
  currentModule = module;
  currentRoute = segment;
  if (module && typeof module.mount === 'function') {
    await module.mount({ params, outlet });
  }
  document.dispatchEvent(new CustomEvent('route:mounted', { detail: { route: segment } }));

  const targetY = restoreScroll ? (scrollPositions.get(segment) ?? 0) : 0;
  window.scrollTo(0, targetY);

  // Reset focus to the new view so screen readers pick up the change.
  // <main id="main-content"> carries tabindex="-1" so it can receive focus
  // without entering the normal tab order.
  document.getElementById('main-content')?.focus({ preventScroll: true });
}

export function startRouter() {
  // popstate fires before hashchange when the user navigates the history
  // (browser back / forward, in-app history.back). Capturing it lets us
  // distinguish "go back" from "fresh link click" and decide whether to
  // restore the previous scroll position or land at the top.
  window.addEventListener('popstate', () => { isHistoryNav = true; });
  window.addEventListener('hashchange', render);
  if (!location.hash) {
    location.replace('#/home');
  } else {
    render();
  }
}

export function currentRouteName() {
  return currentRoute;
}
