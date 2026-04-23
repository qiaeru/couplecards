// SPDX-License-Identifier: MIT
// Fluent UI Emoji icons served locally as <img>.

const BASE = '/icons/emoji';

const MAP = {
  house:          'house.svg',
  city:           'city.svg',
  heartRibbon:    'heart-ribbon.svg',
  growingHeart:   'growing-heart.svg',
  sparklingHeart: 'sparkling-heart.svg',
  twoHearts:      'two-hearts.svg',
  heartArrow:     'heart-arrow.svg',
  redHeart:       'red-heart.svg',
};

export const HEART_KEYS = ['heartRibbon', 'growingHeart', 'sparklingHeart', 'twoHearts', 'heartArrow', 'redHeart'];

export function emojiUrl(key) {
  const path = MAP[key];
  return path ? `${BASE}/${path}` : '';
}

export function emojiImgHTML(key, alt = '') {
  const url = emojiUrl(key);
  if (!url) return '';
  return `<img class="emoji" src="${url}" alt="${alt}" draggable="false">`;
}

export function createEmojiImg(key, alt = '') {
  const img = document.createElement('img');
  img.className = 'emoji';
  img.src = emojiUrl(key);
  img.alt = alt;
  img.draggable = false;
  return img;
}
