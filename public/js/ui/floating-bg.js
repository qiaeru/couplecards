// SPDX-License-Identifier: MIT
// Parallax of emojis behind the auth card. Single depth value per icon drives size/blur/opacity together.

import { createEmojiImg } from './emoji.js';

const SLUGS = [
  'red-heart', 'growing-heart', 'sparkling-heart', 'two-hearts',
  'heart-arrow', 'heart-ribbon', 'kiss-mark', 'couple-with-heart',
  'love-letter', 'bottle-with-popping-cork', 'cocktail-glass',
  'popcorn', 'shortcake', 'guitar', 'musical-notes', 'soccer-ball',
  'hiking-boot', 'crystal-ball', 'game-die',
];

let mounted = false;

export function mountFloatingBackground(count = 22) {
  if (mounted) return;
  mounted = true;

  const wrap = document.createElement('div');
  wrap.className = 'floating-bg';
  wrap.setAttribute('aria-hidden', 'true');

  const items = [];
  for (let i = 0; i < count; i++) {
    const slug = SLUGS[i % SLUGS.length];
    const item = document.createElement('span');
    item.className = 'floating-icon';

    const depth = Math.random();
    const size = Math.round(120 - depth * 70);
    const blur = (depth * 3.5).toFixed(2);
    const baseOpacity = (0.5 - depth * 0.35).toFixed(2);
    const duration = 14 + depth * 20;
    const delay = -Math.random() * duration;
    const drift = (Math.random() * 40 - 20).toFixed(1);
    const rotate = (Math.random() * 30 - 15).toFixed(1);

    item.style.left = `${Math.random() * 100}%`;
    item.style.top = `${Math.random() * 100}%`;
    item.style.animationDuration = `${duration.toFixed(1)}s`;
    item.style.animationDelay = `${delay.toFixed(1)}s`;
    item.style.setProperty('--drift', `${drift}px`);
    item.style.setProperty('--rotate', `${rotate}deg`);
    item.style.setProperty('--blur', `${blur}px`);
    item.style.setProperty('--base-opacity', baseOpacity);
    item.style.zIndex = String(Math.round((1 - depth) * 10));

    const img = createEmojiImg(slug);
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    item.appendChild(img);
    wrap.appendChild(item);
    items.push(item);
  }

  document.body.insertBefore(wrap, document.body.firstChild);

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  const REPEL_RADIUS = 180;
  const REPEL_MAX = 32;
  let rafId = 0;
  let mx = -9999;
  let my = -9999;

  const apply = () => {
    rafId = 0;
    // Read all rects first, then write styles: interleaving the two forces a
    // layout recalculation per item on every frame.
    const rects = items.map((el) => el.getBoundingClientRect());
    items.forEach((el, i) => {
      const r = rects[i];
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - mx;
      const dy = cy - my;
      const dist = Math.hypot(dx, dy);
      if (dist < REPEL_RADIUS && dist > 0.1) {
        const force = (1 - dist / REPEL_RADIUS) * REPEL_MAX;
        el.style.setProperty('--repel-x', `${((dx / dist) * force).toFixed(1)}px`);
        el.style.setProperty('--repel-y', `${((dy / dist) * force).toFixed(1)}px`);
        el.style.setProperty('--repel-opacity', '0.55');
      } else {
        el.style.setProperty('--repel-x', '0px');
        el.style.setProperty('--repel-y', '0px');
        el.style.setProperty('--repel-opacity', '');
      }
    });
  };

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    if (!rafId) rafId = requestAnimationFrame(apply);
  });
}
