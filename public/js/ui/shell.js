// SPDX-License-Identifier: MIT
// App chrome: toast, modal dialogs, vibration preference, inactivity timer,
// PWA install prompt, service worker registration and update banner.

import { t } from '../core/i18n.js';
import { on } from '../core/events.js';
import { pendingOutboxCount } from '../core/sync.js';

const VIBRATION_KEY = 'couplecards:vibrations-enabled';
const SOUND_KEY = 'couplecards:sounds-enabled';
let vibrationsEnabled = true;
let soundsEnabled = true;
try { vibrationsEnabled = localStorage.getItem(VIBRATION_KEY) !== '0'; } catch {}
try { soundsEnabled = localStorage.getItem(SOUND_KEY) !== '0'; } catch {}

export function vibrate(pattern) {
  if (!vibrationsEnabled) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

export function areVibrationsEnabled() { return vibrationsEnabled; }

export function setVibrationsEnabled(on) {
  vibrationsEnabled = !!on;
  try { localStorage.setItem(VIBRATION_KEY, on ? '1' : '0'); } catch {}
}

export function areSoundsEnabled() { return soundsEnabled; }

export function setSoundsEnabled(on) {
  soundsEnabled = !!on;
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch {}
}

// Optional `action` is { label, onClick } and renders a trailing button;
// clicking it dismisses the toast and invokes onClick. Default duration
// doubles to 5s when an action is present so the user has time to react.
export function toast(message, options = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toast._timer);
  const action = options.action || null;
  const duration = options.duration ?? (action ? 5000 : 1800);
  el.replaceChildren(document.createTextNode(message));
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      clearTimeout(toast._timer);
      el.hidden = true;
      try { action.onClick(); } catch {}
    });
    el.appendChild(btn);
  }
  el.hidden = false;
  toast._timer = setTimeout(() => { el.hidden = true; }, duration);
}

// Generic confirmation modal with a focus trap. Resolves to true/false.
export function showConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal');
    if (!modal) { resolve(false); return; }
    const previouslyFocused = document.activeElement;
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title ?? t('common.confirm');
    bodyEl.textContent = body ?? '';
    confirmBtn.textContent = confirmLabel ?? t('common.confirm');
    cancelBtn.textContent = cancelLabel ?? t('common.cancel');
    confirmBtn.classList.toggle('btn-danger', danger);
    confirmBtn.classList.toggle('btn-primary', !danger);
    confirmBtn.disabled = false;
    cancelBtn.hidden = !cancelLabel && cancelLabel !== undefined
      ? false
      : cancelLabel === '' ? true : false;

    const focusables = () => [cancelBtn, confirmBtn].filter((b) => !b.hidden);

    const close = (result) => {
      modal.hidden = true;
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      modal.querySelector('[data-modal-close]')?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch {}
      }
      resolve(result);
    };
    const onConfirm = () => close(true);
    const onCancel = () => close(false);
    const onKey = (e) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key === 'Enter' && document.activeElement !== cancelBtn) {
        onConfirm();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (items.length < 2) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    modal.querySelector('[data-modal-close]')?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);

    modal.hidden = false;
    setTimeout(() => confirmBtn.focus(), 50);
  });
}

// Lower-level modal helper for richer dialogs (custom body, async confirm,
// optional cancel button). Like showConfirm but caller-driven: returns
// { close } and the body can hold any markup. Pass cancelLabel: null to
// hide the cancel button for one-button dialogs. Pass dismissable: false
// to disable Escape and backdrop-click closing (used when accidental
// dismissal would lose unrecoverable state, e.g. a generated password
// shown only once).
export function withModal({ title, bodyHtml, confirmLabel, cancelLabel, danger, onConfirm, onBodyReady, dismissable = true }) {
  const host = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  const backdrop = host?.querySelector('[data-modal-close]');
  if (!host) return { close: () => {} };

  const previouslyFocused = document.activeElement;

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  confirmBtn.textContent = confirmLabel;
  confirmBtn.classList.toggle('btn-danger', !!danger);
  confirmBtn.classList.toggle('btn-primary', !danger);
  confirmBtn.disabled = false;
  const showCancel = cancelLabel != null;
  cancelBtn.hidden = !showCancel;
  if (showCancel) cancelBtn.textContent = cancelLabel;
  host.hidden = false;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const getFocusables = () => Array.from(host.querySelectorAll(FOCUSABLE))
    .filter((el) => !el.hidden && el.offsetParent !== null);

  const close = () => {
    host.hidden = true;
    confirmBtn.removeEventListener('click', handler);
    cancelBtn.removeEventListener('click', cancel);
    backdrop?.removeEventListener('click', cancel);
    document.removeEventListener('keydown', onKey);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus(); } catch {}
    }
  };
  const cancel = () => close();
  const handler = async () => {
    try { await onConfirm?.({ close, confirmBtn }); }
    catch {}
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      if (!dismissable) return;
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = getFocusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  confirmBtn.addEventListener('click', handler);
  cancelBtn.addEventListener('click', cancel);
  if (dismissable) backdrop?.addEventListener('click', cancel);
  document.addEventListener('keydown', onKey);
  onBodyReady?.({ close });

  setTimeout(() => {
    const [first] = getFocusables();
    (first || confirmBtn).focus();
  }, 50);

  return { close };
}

// Screen-wake lock while a draw animation is in progress.
let wakeLockSentinel = null;
export async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    }
  } catch {}
}
export async function releaseWakeLock() {
  try {
    if (wakeLockSentinel) { await wakeLockSentinel.release(); wakeLockSentinel = null; }
  } catch {}
}

// PWA install affordance.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.dispatchEvent(new CustomEvent('pwa-install-available'));
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.dispatchEvent(new CustomEvent('pwa-installed'));
});
export function canInstall() { return deferredInstallPrompt !== null; }
export async function triggerInstall() {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  try {
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return outcome === 'accepted';
  } catch { return false; }
}

// Service worker registration + update-available banner.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:'
    && location.hostname !== 'localhost'
    && location.hostname !== '127.0.0.1') return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (reg.waiting) showUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(installing);
          }
        });
      });
    } catch {}
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdateBanner(worker) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.hidden = false;
  document.getElementById('update-reload')?.addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  }, { once: true });
}

// Sync banner: shows "Offline" when navigator reports no connection, or
// "Syncing your changes…" when the outbox has pending writes that have not
// reached the server yet. Hidden once everything settles.
let syncPending = 0;

function refreshSyncBanner() {
  const banner = document.getElementById('sync-banner');
  const text = document.getElementById('sync-banner-text');
  if (!banner || !text) return;
  const offline = !navigator.onLine;
  if (offline) {
    text.textContent = t('common.offline');
    banner.classList.remove('is-syncing');
    banner.classList.add('is-offline');
    banner.hidden = false;
    return;
  }
  if (syncPending > 0) {
    text.textContent = t('common.syncPending');
    banner.classList.remove('is-offline');
    banner.classList.add('is-syncing');
    banner.hidden = false;
    return;
  }
  banner.hidden = true;
}

export function initSyncBanner() {
  pendingOutboxCount().then((count) => { syncPending = count; refreshSyncBanner(); });
  window.addEventListener('online', refreshSyncBanner);
  window.addEventListener('offline', refreshSyncBanner);
  on('sync:outbox-changed', ({ count } = { count: 0 }) => {
    syncPending = count;
    refreshSyncBanner();
  });
  on('i18n:change', refreshSyncBanner);
}
