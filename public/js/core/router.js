// SPDX-License-Identifier: MIT
// SPA router: loads HTML partials from /views/<name>.html into <main id="view">,
// invokes mount/unmount hooks on the matching feature module.

import { applyI18n } from './i18n.js';

// The view partials are same-origin files from public/views/, written by the
// project itself: this policy hands them to innerHTML under Trusted Types.
const partialPolicy = globalThis.trustedTypes?.createPolicy('couplecards-partial', {
  createHTML: (s) => s,
});
const partialCache = new Map();
const features = new Map();
// Per-route scroll positions, restored only when the navigation comes from
// the browser history (back/forward). Fresh nav (link click, navigate())
// always lands at the top.
const scrollPositions = new Map();
let currentRoute = null;
let currentModule = null;
let outlet = null;
// Bumped on every render() call. Each await inside render() re-checks it so a
// render overtaken by a newer navigation stops instead of overwriting the
// newer view with its own stale partial, module, scroll reset, and focus.
let renderGen = 0;

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
  const text = await resp.text();
  const html = partialPolicy ? partialPolicy.createHTML(text) : text;
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
  const hash =
    '#/' + name + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
  if (location.hash === hash) {
    await render({ fresh: true });
  } else {
    location.hash = hash;
  }
}

// popstate cannot tell back/forward apart: it also fires on every hash change,
// link taps included. A fresh navigation creates a history entry with no
// state, so stamping entries on first render means that meeting a stamp again
// can only be a trip through the history. The stamp is a position, one above
// the entry it was reached from, so comparing it with the current one tells a
// trip back from a trip forward.
let currentIndex = 0;
function stampEntry() {
  const stamped = history.state?.navIndex;
  if (stamped != null) return { revisit: true, index: stamped };
  const index = currentIndex + 1;
  history.replaceState({ ...history.state, navIndex: index }, '');
  return { revisit: false, index };
}

// Which side the next screen slides in from. A trip back through the history,
// or a return to home (the root, reached again after a draw or from a tab),
// comes from the left; between two screens of the bottom nav, the side follows
// their order, like swiping between pages; everything else is a step forward,
// from the right.
function navDirection(from, to, step) {
  if (step.revisit) return step.index < currentIndex ? 'back' : 'forward';
  if (to === 'home' && from && from !== 'home') return 'back';
  const order = [
    'home',
    ...[...document.querySelectorAll('[data-nav-route]')].map((a) => a.dataset.navRoute),
  ];
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  return a >= 0 && b >= 0 && b < a ? 'back' : 'forward';
}

async function render({ fresh = false } = {}) {
  if (!outlet) return;
  const { segment, params } = parsePath();
  if (!features.has(segment)) return;
  const gen = ++renderGen;

  // Snapshot the scroll position of the screen we are about to leave, so a
  // future browser back can restore it.
  if (currentRoute) scrollPositions.set(currentRoute, window.scrollY);
  const step = stampEntry();
  const restoreScroll = step.revisit && !fresh;
  const direction = navDirection(currentRoute, segment, step);
  currentIndex = step.index;

  if (currentModule && typeof currentModule.unmount === 'function') {
    try {
      currentModule.unmount();
    } catch (err) {
      console.error('unmount failed', err);
    }
  }
  // Null right away so an overlapping render cannot unmount the same module twice.
  currentModule = null;

  const html = await loadPartial(segment);
  if (gen !== renderGen) return;
  // Animate the swap through the View Transitions API where available (the
  // ::view-transition rules in style.css do the crossfade). The update
  // callback runs asynchronously, so wait for it before mounting into the
  // new DOM. Reduced motion and unsupported browsers keep the instant swap.
  const swap = () => {
    outlet.innerHTML = html;
    applyI18n(outlet);
  };
  if (
    document.startViewTransition &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    // An attribute rather than view transition types: startViewTransition()
    // only takes an options object since Chrome 125 and Safari 18.2, and the
    // older ones would throw on it.
    const root = document.documentElement;
    root.dataset.navDirection = direction;
    const transition = document.startViewTransition(swap);
    transition.finished.finally(() => {
      if (gen === renderGen) delete root.dataset.navDirection;
    });
    await transition.updateCallbackDone;
    if (gen !== renderGen) return;
  } else {
    swap();
  }

  const module = await features.get(segment)();
  if (gen !== renderGen) return;
  currentModule = module;
  currentRoute = segment;
  if (module && typeof module.mount === 'function') {
    await module.mount({ params, outlet });
    if (gen !== renderGen) return;
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
  window.addEventListener('hashchange', () => render());
  if (!location.hash) {
    location.replace('#/home');
  } else {
    render();
  }
}
