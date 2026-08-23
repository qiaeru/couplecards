// SPDX-License-Identifier: MIT
// Tiny i18n helper: JSON catalogues, {{param}} interpolation, Intl.PluralRules,
// Intl date/number formatting, live re-render via the `i18n:change` event.

import { emit, on } from './events.js';

const LOCALE_KEY = 'couplecards:locale';
const SUPPORTED = new Set(['en', 'fr', 'de', 'it', 'es']);
const FALLBACK = 'en';

let current = FALLBACK;
let catalogue = {};
let fallbackCatalogue = {};

function detect() {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved && SUPPORTED.has(saved)) return saved;
  } catch {}
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  return SUPPORTED.has(nav) ? nav : FALLBACK;
}

async function load(locale) {
  const resp = await fetch(`/locales/${locale}.json`, { credentials: 'same-origin' });
  if (!resp.ok) throw new Error(`locale ${locale} failed to load`);
  return resp.json();
}

export async function initI18n(preferred) {
  const target = preferred && SUPPORTED.has(preferred) ? preferred : detect();
  if (target === FALLBACK) {
    const data = await load(FALLBACK);
    catalogue = data;
    fallbackCatalogue = data;
  } else {
    const [main, fall] = await Promise.all([load(target), load(FALLBACK)]);
    catalogue = main;
    fallbackCatalogue = fall;
  }
  current = target;
  document.documentElement.setAttribute('lang', current);
  emit('i18n:change', current);
}

export async function setLocale(locale) {
  if (!SUPPORTED.has(locale)) return;
  if (locale === current) return;
  try { localStorage.setItem(LOCALE_KEY, locale); } catch {}
  await initI18n(locale);
}

export function getLocale() {
  return current;
}

export function supportedLocales() {
  return [...SUPPORTED];
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = params[key];
    return val === undefined || val === null ? `{{${key}}}` : String(val);
  });
}

export function t(key, params) {
  const value = catalogue[key] ?? fallbackCatalogue[key];
  if (value === undefined) return key;
  return interpolate(value, params);
}

export function tn(key, count, params) {
  const rules = new Intl.PluralRules(current);
  const category = rules.select(count);
  const variant = `${key}.${category}`;
  const otherKey = `${key}.other`;
  const str = catalogue[variant] ?? catalogue[otherKey] ?? fallbackCatalogue[variant] ?? fallbackCatalogue[otherKey] ?? key;
  return interpolate(str, { count, ...params });
}

export function fmtDate(date, options) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(current, options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

// Contextual date format for list entries. Month spelled in full, joined to
// the time via a locale-specific separator ("à" / "at") from common.dateAtTime.
// Example: "23 avril 2026 à 12:29" (FR).
export function fmtDateLong(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const datePart = new Intl.DateTimeFormat(current, { dateStyle: 'long' }).format(d);
  const timePart = new Intl.DateTimeFormat(current, { timeStyle: 'short' }).format(d);
  return t('common.dateAtTime', { date: datePart, time: timePart });
}

// Apply translations to static HTML nodes carrying `data-i18n` / `data-i18n-attr`.
// Format: data-i18n="key" (replaces text) or data-i18n-attr="placeholder:key,aria-label:key".
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const map = el.getAttribute('data-i18n-attr');
    map.split(',').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

// Announce the new locale via the shared #screen-announce live region so a
// screen-reader user gets feedback after picking a language. Native display
// name is enough; no extra i18n key needed.
function announceLocale(locale) {
  const el = document.getElementById('screen-announce');
  if (!el) return;
  let name = locale;
  try { name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) || locale; } catch {}
  el.textContent = name;
  setTimeout(() => { el.textContent = ''; }, 1500);
}

// Re-apply static translations whenever the locale changes, and announce the
// new locale (after the initial boot) so screen-reader users get feedback when
// they pick a language.
let announceArmed = false;
on('i18n:change', (locale) => {
  applyI18n(document);
  if (announceArmed) announceLocale(locale);
  announceArmed = true;
});
