// SPDX-License-Identifier: MIT
// Deck maintenance flows: export (ZIP), sync from server-side JSON files,
// import an uploaded backup. fflate is loaded lazily when importing.

import { request, ApiError } from '../../core/api.js';
import { t, supportedLocales } from '../../core/i18n.js';
import { toast } from '../../ui/shell.js';
import { escapeHtml } from '../../core/dom.js';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const SUPPORTED_LOCALES = supportedLocales();
let fflatePromise = null;

function errorMessage(err) {
  if (err instanceof ApiError) {
    const localised = t(`errors.${err.code}`);
    if (localised && localised !== `errors.${err.code}`) return localised;
  }
  return t('errors.generic');
}

async function loadFflate() {
  if (!fflatePromise) {
    fflatePromise = import('/vendor/fflate.js');
  }
  return fflatePromise;
}

export async function exportDeck() {
  const resp = await fetch('/api/admin/cards/export', { credentials: 'same-origin' });
  if (!resp.ok) {
    toast(t('errors.generic'));
    return;
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get('content-disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : `couplecards-deck-${new Date().toISOString().slice(0, 10)}.zip`;
  triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderSummary(result) {
  if (!result) return '';
  const { added, updated, removed, unchanged, keptOutsideFile } = result;
  if (added === 0 && updated === 0 && removed === 0) {
    return `<div class="deck-sync-summary is-quiet">${escapeHtml(t('admin.deckSync.summary.noChange'))}</div>`;
  }
  const parts = [];
  parts.push(`<div><strong>${escapeHtml(t('admin.deckSync.summary.added', { count: added }))}</strong></div>`);
  parts.push(`<div><strong>${escapeHtml(t('admin.deckSync.summary.updated', { count: updated }))}</strong></div>`);
  if (removed > 0) {
    parts.push(`<div class="is-danger"><strong>${escapeHtml(t('admin.deckSync.summary.removed', { count: removed }))}</strong></div>`);
  }
  parts.push(`<div>${escapeHtml(t('admin.deckSync.summary.unchanged', { count: unchanged }))}</div>`);
  if (keptOutsideFile > 0) {
    parts.push(`<div>${escapeHtml(t('admin.deckSync.summary.kept', { count: keptOutsideFile }))}</div>`);
  }
  return `<div class="deck-sync-summary"><h4>${escapeHtml(t('admin.deckSync.summary.title'))}</h4>${parts.join('')}</div>`;
}

function renderModeOptions(selectedMode) {
  return `
    <fieldset class="field-group">
      <legend>${escapeHtml(t('admin.deckSync.mode'))}</legend>
      <label class="radio-row">
        <input type="radio" name="deck-sync-mode" value="mirror" ${selectedMode === 'mirror' ? 'checked' : ''}>
        <span>
          <strong>${escapeHtml(t('admin.deckSync.mode.mirror'))}</strong>
          <small>${escapeHtml(t('admin.deckSync.mode.mirror.hint'))}</small>
        </span>
      </label>
      <label class="radio-row">
        <input type="radio" name="deck-sync-mode" value="upsert" ${selectedMode === 'upsert' ? 'checked' : ''}>
        <span>
          <strong>${escapeHtml(t('admin.deckSync.mode.upsert'))}</strong>
          <small>${escapeHtml(t('admin.deckSync.mode.upsert.hint'))}</small>
        </span>
      </label>
    </fieldset>
  `;
}

function withModal({ title, bodyHtml, confirmLabel, cancelLabel, danger, onConfirm, onBodyReady }) {
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
  cancelBtn.hidden = false;
  cancelBtn.textContent = cancelLabel;
  host.hidden = false;

  // Every focusable control currently inside the modal (body inputs +
  // confirm/cancel). Queried on each Tab so dynamic bodies (preview summary,
  // mode switches) stay in the trap.
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
    try { await onConfirm({ close, confirmBtn }); }
    catch {}
  };
  const onKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
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
  backdrop?.addEventListener('click', cancel);
  document.addEventListener('keydown', onKey);
  onBodyReady?.({ close });

  // Defer initial focus so the body has rendered its first focusable control.
  setTimeout(() => {
    const [first] = getFocusables();
    (first || confirmBtn).focus();
  }, 50);

  return { close };
}

function openSyncDialog() {
  let mode = 'mirror';
  let lastPreview = null;

  const renderBody = () => `
    <p class="deck-sync-intro">${escapeHtml(t('admin.deckSync.intro'))}</p>
    ${renderModeOptions(mode)}
    <div class="deck-sync-backup">
      <p class="deck-sync-backup-hint">${escapeHtml(t('admin.deckSync.backupHint'))}</p>
      <button type="button" class="btn" id="deck-sync-backup-btn">${escapeHtml(t('admin.cards.tools.export'))}</button>
    </div>
    <div class="deck-sync-actions">
      <button type="button" class="btn" id="deck-sync-preview-btn">${escapeHtml(t('admin.deckSync.preview'))}</button>
    </div>
    <div id="deck-sync-summary-host"></div>
    <div class="cp-error" id="deck-sync-error" role="alert"></div>
  `;

  const ctrl = withModal({
    title: t('admin.deckSync.title'),
    bodyHtml: renderBody(),
    confirmLabel: t('admin.deckSync.apply'),
    cancelLabel: t('common.cancel'),
    onBodyReady: ({ close }) => wireBody(close),
    onConfirm: async ({ close, confirmBtn }) => {
      confirmBtn.disabled = true;
      try {
        const result = await request('/api/admin/cards/sync', {
          method: 'POST',
          body: { mode, dryRun: false },
        });
        close();
        toast(t('admin.deckSync.toast.done'));
        window.dispatchEvent(new CustomEvent('admin:cards-refresh'));
        return result;
      } catch (err) {
        const host = document.getElementById('deck-sync-error');
        if (host) host.textContent = errorMessage(err);
        confirmBtn.disabled = false;
        throw err;
      }
    },
  });

  function wireBody(close) {
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.disabled = true;

    document.querySelectorAll('input[name="deck-sync-mode"]').forEach((el) => {
      el.addEventListener('change', () => {
        mode = el.value;
        lastPreview = null;
        rebuild();
      });
    });
    document.getElementById('deck-sync-backup-btn')?.addEventListener('click', async () => {
      try {
        await exportDeck();
        toast(t('admin.deckSync.backupDone'));
      } catch {
        toast(t('errors.generic'));
      }
    });
    document.getElementById('deck-sync-preview-btn')?.addEventListener('click', async () => {
      const errHost = document.getElementById('deck-sync-error');
      errHost.textContent = '';
      try {
        const summary = await request('/api/admin/cards/sync', {
          method: 'POST',
          body: { mode, dryRun: true },
        });
        lastPreview = summary;
        document.getElementById('deck-sync-summary-host').innerHTML = renderSummary(summary);
        confirmBtn.disabled = false;
      } catch (err) {
        errHost.textContent = errorMessage(err);
        confirmBtn.disabled = true;
      }
    });

    function rebuild() {
      document.getElementById('modal-body').innerHTML = renderBody();
      document.getElementById('deck-sync-summary-host').innerHTML = lastPreview ? renderSummary(lastPreview) : '';
      wireBody(close);
    }
  }

  return ctrl;
}

function openImportDialog(deck, filename) {
  let mode = 'mirror';
  let lastPreview = null;

  const renderBody = () => `
    <p class="deck-sync-intro">${escapeHtml(t('admin.deckImport.intro'))}</p>
    <p class="deck-sync-filename">${escapeHtml(t('admin.deckImport.selected', { name: filename }))}</p>
    ${renderModeOptions(mode)}
    <div class="deck-sync-actions">
      <button type="button" class="btn" id="deck-sync-preview-btn">${escapeHtml(t('admin.deckSync.preview'))}</button>
    </div>
    <div id="deck-sync-summary-host"></div>
    <div class="cp-error" id="deck-sync-error" role="alert"></div>
  `;

  const ctrl = withModal({
    title: t('admin.deckImport.title'),
    bodyHtml: renderBody(),
    confirmLabel: t('admin.deckSync.apply'),
    cancelLabel: t('common.cancel'),
    onBodyReady: ({ close }) => wireBody(close),
    onConfirm: async ({ close, confirmBtn }) => {
      confirmBtn.disabled = true;
      try {
        const result = await request('/api/admin/cards/import', {
          method: 'POST',
          body: { deck, mode, dryRun: false },
        });
        close();
        toast(t('admin.deckImport.toast.done'));
        window.dispatchEvent(new CustomEvent('admin:cards-refresh'));
        return result;
      } catch (err) {
        const host = document.getElementById('deck-sync-error');
        if (host) host.textContent = errorMessage(err);
        confirmBtn.disabled = false;
        throw err;
      }
    },
  });

  function wireBody(close) {
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.disabled = true;

    document.querySelectorAll('input[name="deck-sync-mode"]').forEach((el) => {
      el.addEventListener('change', () => {
        mode = el.value;
        lastPreview = null;
        rebuild();
      });
    });
    document.getElementById('deck-sync-preview-btn')?.addEventListener('click', async () => {
      const errHost = document.getElementById('deck-sync-error');
      errHost.textContent = '';
      try {
        const summary = await request('/api/admin/cards/import', {
          method: 'POST',
          body: { deck, mode, dryRun: true },
        });
        lastPreview = summary;
        document.getElementById('deck-sync-summary-host').innerHTML = renderSummary(summary);
        confirmBtn.disabled = false;
      } catch (err) {
        errHost.textContent = errorMessage(err);
        confirmBtn.disabled = true;
      }
    });

    function rebuild() {
      document.getElementById('modal-body').innerHTML = renderBody();
      document.getElementById('deck-sync-summary-host').innerHTML = lastPreview ? renderSummary(lastPreview) : '';
      wireBody(close);
    }
  }

  return ctrl;
}

// Accepts a ZIP with one cards.<locale>.json per locale, or a single JSON
// in the legacy flat shape (mapped to the English bucket).
async function parseBackup(file) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('INVALID_DECK');
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.zip') || file.type === 'application/zip') {
    const { unzipSync, strFromU8 } = await loadFflate();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(bytes);
    const cardsByLocale = {};
    for (const [name, data] of Object.entries(entries)) {
      const match = /^cards\.([a-z]{2})\.json$/i.exec(name.split('/').pop());
      if (!match) continue;
      const locale = match[1].toLowerCase();
      if (!SUPPORTED_LOCALES.includes(locale)) continue;
      const payload = JSON.parse(strFromU8(data));
      if (!Array.isArray(payload?.cards)) throw new Error('INVALID_DECK');
      cardsByLocale[locale] = payload.cards;
    }
    if (Object.keys(cardsByLocale).length === 0) throw new Error('INVALID_DECK');
    return { cardsByLocale };
  }
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!Array.isArray(payload?.cards)) throw new Error('INVALID_DECK');
  return { cardsByLocale: { en: payload.cards } };
}

async function pickAndImport() {
  const input = document.getElementById('admin-deck-import-input');
  if (!input) return;
  input.value = '';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const deck = await parseBackup(file);
      openImportDialog(deck, file.name);
    } catch {
      toast(t('errors.INVALID_DECK'));
    }
  };
  input.click();
}

export function mountDeckTools(onAfterChange) {
  document.getElementById('admin-deck-export')?.addEventListener('click', async () => {
    try { await exportDeck(); }
    catch { toast(t('errors.generic')); }
  });
  document.getElementById('admin-deck-sync')?.addEventListener('click', () => openSyncDialog());
  document.getElementById('admin-deck-import')?.addEventListener('click', () => pickAndImport());

  window.addEventListener('admin:cards-refresh', () => onAfterChange?.());
}
