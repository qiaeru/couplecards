// SPDX-License-Identifier: MIT
// App chrome: toast, modal dialogs, vibration preference, inactivity timer,
// PWA install prompt, service worker registration and update banner.

import { t } from '../core/i18n.js';

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

export function toast(message, duration = 1800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._timer);
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
