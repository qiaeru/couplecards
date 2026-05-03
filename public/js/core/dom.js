// SPDX-License-Identifier: MIT
// Tiny DOM helpers shared across feature modules.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Escape a string for safe interpolation into an HTML template literal.
// Use this any time a user-supplied value flows into innerHTML; for plain
// textContent assignments the browser already escapes correctly.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
