// SPDX-License-Identifier: MIT
// Tiny DOM helpers shared across feature modules.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// The CSP enforces Trusted Types (server/src/plugins/helmet.js): innerHTML
// only takes markup from this policy, so the html`` tag below is the one way
// to write HTML, and it escapes every interpolated value. Browsers without
// Trusted Types get a plain wrapper that stringifies the same way.
const policy = globalThis.trustedTypes?.createPolicy('couplecards', { createHTML: (s) => s });

class SafeHTML {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const isSafe = (v) => v instanceof SafeHTML || !!globalThis.trustedTypes?.isHTML(v);

// Nested html`` results and arrays of them go in as markup; everything else
// (user data, translations, numbers) is escaped. null, undefined and false
// render nothing, so `${cond && html`...`}` reads naturally.
function fragment(value) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(fragment).join('');
  if (isSafe(value)) return String(value);
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += fragment(value) + strings[i + 1];
  });
  return policy ? policy.createHTML(out) : new SafeHTML(out);
}

// navigator.clipboard is gated to HTTPS/localhost; fall back to execCommand for plain-HTTP LAN deploys.
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function selectText(el) {
  if (!el) return;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {}
}
