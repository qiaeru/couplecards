// SPDX-License-Identifier: MIT
// Admin users tab: list, create, reset password, delete, unlock.

import { request } from '../../core/api.js';
import { t, fmtDateLong } from '../../core/i18n.js';
import { on } from '../../core/events.js';
import { toast, showConfirm } from '../../ui/shell.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function loadUsers() {
  return request('/api/admin/users');
}

function renderUsersList(users) {
  const host = document.getElementById('admin-users-list');
  if (!host) return;
  host.innerHTML = '';
  for (const u of users) {
    const isAdmin = u.role === 'admin';
    const isDemo = !!u.isDemo;
    const row = document.createElement('div');
    row.className = 'list-item';
    const locked = u.lockedUntil ? new Date(u.lockedUntil + 'Z') : null;
    const isLocked = locked && locked > new Date();
    const badges = [];
    if (isAdmin) badges.push(`<span class="action-tag admin-role">${escapeHtml(t('admin.users.admin'))}</span>`);
    if (isDemo) badges.push(`<span class="action-tag demo-role">${escapeHtml(t('admin.users.demo'))}</span>`);
    if (isLocked) badges.push(`<span class="action-tag banned">${escapeHtml(t('admin.users.locked'))}</span>`);
    if (u.mustChangePassword) badges.push(`<span class="action-tag returned">${escapeHtml(t('admin.users.mustChange'))}</span>`);
    // Demo account can only be deleted — its password, username and lock state
    // are managed by the seed / login logic.
    const showUnlock = isLocked && !isAdmin && !isDemo;
    const showReset = !isAdmin && !isDemo;
    const showDelete = !isAdmin;
    row.innerHTML = `
      <div class="list-item-row">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(u.username)}</div>
          <div class="list-item-meta">${escapeHtml(t('admin.users.createdAt', { when: fmtDateLong(u.createdAt) }))}</div>
          <div class="list-item-badges">${badges.join('')}</div>
        </div>
        <div class="list-item-right">
          ${showUnlock ? `<button class="btn btn-sm" data-action="unlock" data-id="${u.id}">${escapeHtml(t('admin.users.unlock'))}</button>` : ''}
          ${showReset ? `<button class="btn btn-sm" data-action="reset" data-id="${u.id}" data-username="${escapeHtml(u.username)}">${escapeHtml(t('admin.users.reset'))}</button>` : ''}
          ${showDelete ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${u.id}" data-username="${escapeHtml(u.username)}">${escapeHtml(t('admin.users.delete'))}</button>` : ''}
        </div>
      </div>
    `;
    host.appendChild(row);
  }
}

function showInitialPassword(username, password) {
  const host = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  if (!host || !titleEl || !bodyEl || !confirmBtn || !cancelBtn) return;

  titleEl.textContent = t('admin.users.initialPassword.title', { username });
  bodyEl.innerHTML = `
    <p>${escapeHtml(t('admin.users.initialPassword.warn'))}</p>
    <div class="initial-password-box">
      <code id="initial-password-value">${escapeHtml(password)}</code>
      <button type="button" class="btn" id="initial-password-copy">${escapeHtml(t('admin.users.initialPassword.copy'))}</button>
    </div>
  `;
  confirmBtn.textContent = t('admin.users.initialPassword.close');
  cancelBtn.hidden = true;
  confirmBtn.classList.add('btn-primary');
  confirmBtn.classList.remove('btn-danger');
  host.hidden = false;

  document.getElementById('initial-password-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast(t('common.copied'));
    } catch { /* clipboard may be blocked */ }
  });
  const onClose = () => { host.hidden = true; confirmBtn.removeEventListener('click', onClose); };
  confirmBtn.addEventListener('click', onClose);
}

export async function renderUsers() {
  const users = await loadUsers();
  renderUsersList(users);
}

async function createUser(username) {
  const created = await request('/api/admin/users', { method: 'POST', body: { username } });
  showInitialPassword(created.username, created.initialPassword);
  await renderUsers();
}

async function resetUser(id, username) {
  const ok = await showConfirm({
    title: t('admin.users.reset.confirm', { username }),
    body: t('admin.users.reset.body'),
    confirmLabel: t('admin.users.reset'),
    cancelLabel: t('common.cancel'),
  });
  if (!ok) return;
  const updated = await request(`/api/admin/users/${id}/reset-password`, { method: 'POST' });
  showInitialPassword(updated.username, updated.initialPassword);
  await renderUsers();
}

async function deleteUser(id, username) {
  const ok = await showConfirm({
    title: t('admin.users.delete.confirm', { username }),
    body: t('admin.users.delete.body'),
    confirmLabel: t('admin.users.delete'),
    cancelLabel: t('common.cancel'),
    danger: true,
  });
  if (!ok) return;
  await request(`/api/admin/users/${id}`, { method: 'DELETE' });
  toast(t('common.copied'));
  await renderUsers();
}

async function unlockUser(id) {
  await request(`/api/admin/users/${id}/unlock`, { method: 'POST' });
  await renderUsers();
}

export async function mount() {
  const form = document.getElementById('admin-create-user-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('admin-create-user-input');
    const username = input.value.trim().toLowerCase();
    if (!username) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await createUser(username);
      input.value = '';
    } catch (err) {
      toast(t(`errors.${err.code}`) || t('errors.generic'));
    } finally {
      btn.disabled = false;
    }
  });

  on('i18n:change', () => { renderUsers().catch(() => {}); });

  document.getElementById('admin-users-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const username = btn.dataset.username;
    try {
      if (btn.dataset.action === 'reset') await resetUser(id, username);
      else if (btn.dataset.action === 'delete') await deleteUser(id, username);
      else if (btn.dataset.action === 'unlock') await unlockUser(id);
    } catch (err) {
      toast(t(`errors.${err.code}`) || t('errors.generic'));
    }
  });

  await renderUsers();
}

export function unmount() {}
