// SPDX-License-Identifier: MIT
// SPA router: loads HTML partials from /views/<name>.html into <main id="view">,
// invokes mount/unmount hooks on the matching feature module.

import { applyI18n } from './i18n.js';

const partialCache = new Map();
const features = new Map();
let currentRoute = null;
let currentModule = null;
let outlet = null;

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
  window.scrollTo(0, 0);
}

export function startRouter() {
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
