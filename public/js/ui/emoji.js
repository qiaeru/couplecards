// SPDX-License-Identifier: MIT
// Fluent UI Emoji icons served locally as <img>. Slugs match the SVG
// filenames under /icons/emoji/.

const BASE = '/icons/emoji';

// The full slug list (~1 KB) lives in features/admin/emoji-slugs.js so
// player bundles do not pay the parse cost. The renderer accepts any
// matching slug regardless of where the list comes from.

export const HEART_KEYS = [
  'heart-ribbon',
  'growing-heart',
  'sparkling-heart',
  'two-hearts',
  'heart-arrow',
  'red-heart',
];

export function emojiUrl(slug) {
  return slug ? `${BASE}/${slug}.svg` : '';
}

export function emojiImgHTML(slug, alt = '') {
  const url = emojiUrl(slug);
  if (!url) return '';
  return `<img class="emoji" src="${url}" alt="${alt}" draggable="false">`;
}

export function createEmojiImg(slug, alt = '', { lazy = false } = {}) {
  const img = document.createElement('img');
  img.className = 'emoji';
  // `loading` must be set before `src` for the lazy hint to take effect.
  if (lazy) img.loading = 'lazy';
  img.alt = alt;
  img.draggable = false;
  img.src = emojiUrl(slug);
  return img;
}
