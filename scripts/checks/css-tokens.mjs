// SPDX-License-Identifier: MIT
// Keeps the stylesheets on the design tokens declared in public/css/themes.css.
// A raw color, font size or easing curve in any other stylesheet is a value
// that will drift from the system it was copied from, so it fails here.

import { repoPath, walk, read, rel } from './lib.mjs';

const CSS_DIR = repoPath('public', 'css');
// themes.css declares the tokens; fonts.css only holds @font-face blocks.
const EXEMPT = new Set(['themes.css', 'fonts.css']);

const RULES = [
  { name: 'raw color', pattern: /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i },
  { name: 'raw font-size', pattern: /font-size\s*:[^;]*\d(?:rem|px)/ },
  { name: 'raw easing', pattern: /cubic-bezier\(/ },
];

// Comments and url() payloads (inline SVG icons carry their own colors) are
// blanked out line by line so the reported line numbers stay accurate.
function scrub(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/url\([^)]*\)/g, (m) => m.replace(/[^\n]/g, ' '));
}

export function run() {
  const errors = [];
  const notes = [];
  const files = walk(CSS_DIR, (f) => f.endsWith('.css') && !EXEMPT.has(f.split(/[\\/]/).pop()));
  for (const file of files) {
    const lines = scrub(read(file)).split('\n');
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          errors.push(
            `${rel(file)}:${i + 1}: ${rule.name}, use a token from public/css/themes.css`,
          );
        }
      }
    });
  }
  notes.push(`${files.length} stylesheet(s) checked against themes.css`);
  return { name: 'css-tokens', errors, notes };
}
