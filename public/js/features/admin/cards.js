// SPDX-License-Identifier: MIT
// Admin cards tab: list, create, edit, delete. The editor has one input block
// per supported locale so both translations can be filled in a single pass.

import { request } from '../../core/api.js';
import { t, getLocale } from '../../core/i18n.js';
import { getCardText } from '../../core/sync.js';
import { on } from '../../core/events.js';
import { toast, showConfirm } from '../../ui/shell.js';
import { mountDeckTools } from './deck-sync.js';

const SUPPORTED_LOCALES = ['en', 'fr'];
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function localeLabel(locale) {
  return t(`settings.language.${locale}`);
}

let allCards = [];
let cardsQuery = '';

async function loadCards() {
  const data = await request('/api/cards');
  return data?.cards || [];
}

// Match against every locale's title + description so users can find a card
// by a word from either translation.
function filterCards() {
  const q = cardsQuery.trim().toLowerCase();
  if (!q) return allCards;
  return allCards.filter((card) => {
    const translations = card.translations || {};
    for (const locale of Object.keys(translations)) {
      const tr = translations[locale];
      if (!tr) continue;
      if ((tr.title || '').toLowerCase().includes(q)) return true;
      if ((tr.description || '').toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

function renderCardsList(cards) {
  const host = document.getElementById('admin-cards-list');
  if (!host) return;
  host.innerHTML = '';
  if (cards.length === 0) {
    host.innerHTML = `<div class="empty">
      <div class="empty-icon" aria-hidden="true">🃏</div>
      <div class="empty-title">${escapeHtml(t('admin.cards.empty.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('admin.cards.empty.hint'))}</div>
    </div>`;
    return;
  }
  const locale = getLocale();
  for (const card of cards) {
    const { title, description } = getCardText(card, locale);
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-header">
          <span class="pile-badge ${card.pile}">${escapeHtml(t(`piles.${card.pile}.label`))}</span>
          <span class="list-item-title">${escapeHtml(title)}${card.foil ? ' ✦' : ''}</span>
        </div>
        <div class="list-item-meta">${escapeHtml(description)}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm" data-action="edit" data-id="${escapeHtml(card.id)}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${escapeHtml(card.id)}">${escapeHtml(t('common.delete'))}</button>
      </div>
    `;
    host.appendChild(row);
  }
}

function renderTranslationSection(locale, existing) {
  const data = existing?.translations?.[locale] || { title: '', description: '' };
  return `
    <fieldset class="field-group card-translation">
      <legend>${escapeHtml(localeLabel(locale))}</legend>
      <label class="field">
        <span>${escapeHtml(t('admin.cards.cardTitle'))}</span>
        <input type="text" name="title-${locale}" maxlength="${TITLE_MAX}" required
               value="${escapeHtml(data.title)}">
      </label>
      <label class="field">
        <span>${escapeHtml(t('admin.cards.description'))}</span>
        <textarea name="description-${locale}" maxlength="${DESCRIPTION_MAX}" required rows="3">${escapeHtml(data.description)}</textarea>
      </label>
    </fieldset>
  `;
}

function collectTranslations(form) {
  const translations = {};
  for (const locale of SUPPORTED_LOCALES) {
    const title = form.querySelector(`[name="title-${locale}"]`)?.value.trim() ?? '';
    const description = form.querySelector(`[name="description-${locale}"]`)?.value.trim() ?? '';
    if (title && description) translations[locale] = { title, description };
  }
  return translations;
}

function openCardDialog({ card = null } = {}) {
  const host = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  if (!host) return;

  const isEdit = !!card;
  titleEl.textContent = isEdit ? t('admin.cards.edit') : t('admin.cards.create');
  bodyEl.innerHTML = `
    <form id="card-form" class="card-form">
      <label class="field">
        <span>${escapeHtml(t('admin.cards.id'))}</span>
        <input type="text" id="card-id" value="${card ? escapeHtml(card.id) : ''}"
               ${isEdit ? 'readonly' : ''} required
               pattern="[a-z0-9\\-]{1,64}">
        <small>${escapeHtml(t('admin.cards.idHint'))}</small>
      </label>
      <label class="field">
        <span>${escapeHtml(t('admin.cards.pile'))}</span>
        <select id="card-pile" required>
          <option value="home" ${card?.pile === 'home' ? 'selected' : ''}>${escapeHtml(t('piles.home.label'))}</option>
          <option value="outdoor" ${card?.pile === 'outdoor' ? 'selected' : ''}>${escapeHtml(t('piles.outdoor.label'))}</option>
        </select>
      </label>
      ${SUPPORTED_LOCALES.map((loc) => renderTranslationSection(loc, card)).join('')}
      <label class="field-inline">
        <input type="checkbox" id="card-foil" ${card?.foil ? 'checked' : ''}>
        <span>${escapeHtml(t('admin.cards.foil'))}</span>
      </label>
      <div class="cp-error" id="card-error" role="alert"></div>
    </form>
  `;
  confirmBtn.textContent = t('admin.cards.save');
  confirmBtn.classList.add('btn-primary');
  confirmBtn.classList.remove('btn-danger');
  cancelBtn.hidden = false;
  cancelBtn.textContent = t('common.cancel');
  host.hidden = false;

  const close = () => {
    host.hidden = true;
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
  };
  const onCancel = () => close();
  const onConfirm = async () => {
    const form = document.getElementById('card-form');
    const err = document.getElementById('card-error');
    err.textContent = '';
    const translations = collectTranslations(form);
    if (Object.keys(translations).length === 0) {
      err.textContent = t('errors.VALIDATION_ERROR');
      return;
    }
    const payload = {
      pile: document.getElementById('card-pile').value,
      foil: document.getElementById('card-foil').checked,
      translations,
    };
    confirmBtn.disabled = true;
    try {
      if (isEdit) {
        await request(`/api/cards/${encodeURIComponent(card.id)}`, { method: 'PATCH', body: payload });
      } else {
        payload.id = document.getElementById('card-id').value.trim();
        await request('/api/cards', { method: 'POST', body: payload });
      }
      close();
      toast(t('admin.cards.save'));
      await renderCards();
    } catch (e) {
      err.textContent = t(`errors.${e.code}`) || t('errors.generic');
    } finally {
      confirmBtn.disabled = false;
    }
  };
  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  setTimeout(() => (isEdit
    ? document.querySelector('[name="title-' + getLocale() + '"]')
    : document.getElementById('card-id'))?.focus(), 50);
}

export async function renderCards() {
  allCards = await loadCards();
  renderCardsList(filterCards());
}

async function deleteCard(id, title) {
  const ok = await showConfirm({
    title: t('admin.cards.delete.confirm', { title }),
    body: t('admin.cards.delete.body'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    danger: true,
  });
  if (!ok) return;
  await request(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await renderCards();
}

export async function mount() {
  mountDeckTools(() => { renderCards().catch(() => {}); });
  on('i18n:change', () => { renderCards().catch(() => {}); });

  document.getElementById('admin-cards-search')?.addEventListener('input', (e) => {
    cardsQuery = e.target.value;
    renderCardsList(filterCards());
  });
  document.getElementById('admin-create-card-btn')?.addEventListener('click', () => openCardDialog());
  document.getElementById('admin-cards-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      if (btn.dataset.action === 'edit') {
        const cards = await loadCards();
        const card = cards.find((c) => c.id === id);
        if (card) openCardDialog({ card });
      } else if (btn.dataset.action === 'delete') {
        const cards = await loadCards();
        const card = cards.find((c) => c.id === id);
        if (card) {
          const { title } = getCardText(card, getLocale());
          await deleteCard(id, title || id);
        }
      }
    } catch (err) {
      toast(t(`errors.${err.code}`) || t('errors.generic'));
    }
  });
  await renderCards();
}

export function unmount() {}
