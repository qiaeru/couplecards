// SPDX-License-Identifier: MIT
// Admin users tab: list, create, reset password, delete, unlock.

import { request, errorMessage } from '../../core/api.js';
import { t, tn, fmtDateLong } from '../../core/i18n.js';
import { on } from '../../core/events.js';
import { toast, showConfirm, withModal } from '../../ui/shell.js';
import { escapeHtml, copyToClipboard, selectText } from '../../core/dom.js';

let allUsers = [];
let usersQuery = '';

async function loadUsers() {
  return request('/api/admin/users');
}

function filterUsers() {
  const q = usersQuery.trim().toLowerCase();
  if (!q) return allUsers;
  return allUsers.filter((u) => u.username.toLowerCase().includes(q));
}

function renderUsersList(users) {
  const host = document.getElementById('admin-users-list');
  if (!host) return;
  host.innerHTML = '';
  if (users.length === 0) {
    host.innerHTML = `<div class="empty">
      <div class="empty-icon" aria-hidden="true">🔍</div>
      <div class="empty-title">${escapeHtml(t('admin.users.search.empty.title'))}</div>
      <div class="empty-hint">${escapeHtml(t('admin.users.search.empty.hint'))}</div>
    </div>`;
    return;
  }
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
    // Demo account can only be deleted; its password, username, and lock state
    // are managed by the seed / login logic.
    const showUnlock = isLocked && !isAdmin && !isDemo;
    const showRename = !isAdmin && !isDemo;
    const showReset = !isAdmin && !isDemo;
    const showDelete = !isAdmin;
    const actions = [
      showUnlock ? `<button class="btn btn-sm" data-action="unlock" data-id="${u.id}">${escapeHtml(t('admin.users.unlock'))}</button>` : '',
      showRename ? `<button class="btn btn-sm" data-action="rename" data-id="${u.id}" data-username="${escapeHtml(u.username)}">${escapeHtml(t('admin.users.rename'))}</button>` : '',
      showReset ? `<button class="btn btn-sm" data-action="reset" data-id="${u.id}" data-username="${escapeHtml(u.username)}">${escapeHtml(t('admin.users.reset'))}</button>` : '',
      showDelete ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${u.id}" data-username="${escapeHtml(u.username)}">${escapeHtml(t('common.delete'))}</button>` : '',
    ].filter(Boolean).join('');
    row.innerHTML = `
      <div class="list-item-main">
        <div class="list-item-title">${escapeHtml(u.username)}</div>
        <div class="list-item-meta">${escapeHtml(t('admin.users.createdAt', { when: fmtDateLong(u.createdAt + 'Z') }))}</div>
        <div class="list-item-meta">${escapeHtml(u.lastLoginAt ? t('admin.users.lastLogin', { when: fmtDateLong(u.lastLoginAt + 'Z') }) : t('admin.users.neverLogged'))}</div>
        <div class="list-item-badges">${badges.join('')}</div>
      </div>
      ${actions ? `<div class="list-item-actions">${actions}</div>` : ''}
    `;
    host.appendChild(row);
  }
}

function showInitialPassword(username, password) {
  withModal({
    title: t('admin.users.initialPassword.title', { username }),
    bodyHtml: `
      <p>${escapeHtml(t('admin.users.initialPassword.warn'))}</p>
      <div class="initial-password-box">
        <code id="initial-password-value">${escapeHtml(password)}</code>
        <button type="button" class="btn" id="initial-password-copy">${escapeHtml(t('admin.users.initialPassword.copy'))}</button>
      </div>
    `,
    confirmLabel: t('admin.users.initialPassword.close'),
    cancelLabel: null,
    dismissable: false,
    onBodyReady: () => {
      document.getElementById('initial-password-copy')?.addEventListener('click', async () => {
        if (await copyToClipboard(password)) {
          toast(t('common.copied'));
        } else {
          selectText(document.getElementById('initial-password-value'));
          toast(t('common.copyManual'));
        }
      });
    },
    onConfirm: ({ close }) => close(),
  });
}

async function renderUsers() {
  allUsers = await loadUsers();
  renderUsersList(filterUsers());
}

async function createUser(username) {
  const created = await request('/api/admin/users', { method: 'POST', body: { username } });
  showInitialPassword(created.username, created.initialPassword);
  await renderUsers();
}

// The server normalizes (trim + lowercase) and validates the new name; the
// modal mirrors the create-user flow and surfaces 409s (taken / reserved)
// inline instead of closing.
function renameUser(id, username) {
  withModal({
    title: t('admin.users.rename.title', { username }),
    bodyHtml: `
      <form id="rename-user-form" class="card-form">
        <label class="field">
          <span>${escapeHtml(t('admin.users.rename.label'))}</span>
          <input type="text" id="rename-user-input" value="${escapeHtml(username)}"
                 required minlength="3" maxlength="32" pattern="[a-z0-9._\\-]+"
                 autocomplete="off">
          <small>${escapeHtml(t('admin.users.create.usernameHint'))}</small>
        </label>
        <div class="cp-error" id="rename-user-error" role="alert"></div>
      </form>
    `,
    confirmLabel: t('common.save'),
    cancelLabel: t('common.cancel'),
    onConfirm: async ({ close, confirmBtn }) => {
      const err = document.getElementById('rename-user-error');
      err.textContent = '';
      const next = document.getElementById('rename-user-input').value.trim().toLowerCase();
      if (!next || next === username) { close(); return; }
      confirmBtn.disabled = true;
      try {
        await request(`/api/admin/users/${id}`, { method: 'PATCH', body: { username: next } });
        close();
        toast(t('admin.users.rename.toast'));
        await renderUsers();
      } catch (e) {
        err.textContent = errorMessage(e);
      } finally {
        confirmBtn.disabled = false;
      }
    },
  });
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
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    danger: true,
  });
  if (!ok) return;
  await request(`/api/admin/users/${id}`, { method: 'DELETE' });
  toast(t('admin.users.delete.toast'));
  await renderUsers();
}

async function unlockUser(id) {
  await request(`/api/admin/users/${id}/unlock`, { method: 'POST' });
  toast(t('admin.users.unlock.toast'));
  await renderUsers();
}

// Cutoff date for a given inactivity period, mirroring the server's SQLite
// calendar modifiers (-3 months / -6 months / -1 year).
function inactiveCutoff(period) {
  const d = new Date();
  if (period === '3m') d.setMonth(d.getMonth() - 3);
  else if (period === '6m') d.setMonth(d.getMonth() - 6);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

// Preview count, computed from the already-loaded list. The server recomputes
// authoritatively on delete; this only feeds the confirmation dialog. Activity
// falls back to creation for accounts that never logged in, like the server.
function countInactive(period) {
  const cutoff = inactiveCutoff(period);
  return allUsers.filter((u) => u.role === 'user' && !u.isDemo
    && new Date((u.lastLoginAt || u.createdAt) + 'Z') < cutoff).length;
}

async function pruneInactive(period) {
  const count = countInactive(period);
  if (count === 0) { toast(t('admin.users.inactive.none')); return; }
  const periodLabel = t(`admin.users.inactive.period.${period}`);
  const ok = await showConfirm({
    title: t('admin.users.inactive.confirm'),
    body: tn('admin.users.inactive.body', count, { period: periodLabel }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    danger: true,
  });
  if (!ok) return;
  const res = await request('/api/admin/users/prune-inactive', { method: 'POST', body: { period } });
  toast(tn('admin.users.inactive.toast', res.deleted));
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
      toast(errorMessage(err));
    } finally {
      btn.disabled = false;
    }
  });

  const toggle = document.getElementById('admin-registration-toggle');
  if (toggle) {
    request('/api/admin/registration').then((d) => { toggle.checked = !!d.enabled; }).catch(() => {});
    toggle.addEventListener('change', async () => {
      const enabled = toggle.checked;
      try {
        await request('/api/admin/registration', { method: 'PUT', body: { enabled } });
        toast(t(enabled ? 'admin.registration.toast.on' : 'admin.registration.toast.off'));
      } catch (err) {
        toggle.checked = !enabled;
        toast(errorMessage(err));
      }
    });
  }

  document.getElementById('admin-prune-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const period = document.getElementById('admin-prune-period').value;
    const btn = document.getElementById('admin-prune-submit');
    btn.disabled = true;
    try {
      await pruneInactive(period);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      btn.disabled = false;
    }
  });

  // Re-render from the cached list: usernames are locale-independent, only
  // the labels and date formats change, so no refetch is needed.
  on('i18n:change', () => { renderUsersList(filterUsers()); });

  document.getElementById('admin-users-search')?.addEventListener('input', (e) => {
    usersQuery = e.target.value;
    renderUsersList(filterUsers());
  });

  document.getElementById('admin-users-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const username = btn.dataset.username;
    try {
      if (btn.dataset.action === 'rename') renameUser(id, username);
      else if (btn.dataset.action === 'reset') await resetUser(id, username);
      else if (btn.dataset.action === 'delete') await deleteUser(id, username);
      else if (btn.dataset.action === 'unlock') await unlockUser(id);
    } catch (err) {
      toast(errorMessage(err));
    }
  });

  await renderUsers();
}
