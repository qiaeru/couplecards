// SPDX-License-Identifier: MIT
// Parallax of emojis behind the auth card, and in the side margins of the app.
// Single depth value per icon drives size/blur/opacity together.

import { createEmojiImg } from './emoji.js';

const SLUGS = [
  'red-heart',
  'growing-heart',
  'sparkling-heart',
  'two-hearts',
  'heart-arrow',
  'heart-ribbon',
  'kiss-mark',
  'couple-with-heart',
  'love-letter',
  'bottle-with-popping-cork',
  'cocktail-glass',
  'popcorn',
  'shortcake',
  'guitar',
  'musical-notes',
  'soccer-ball',
  'hiking-boot',
  'crystal-ball',
  'game-die',
];

let mounted = false;
let sidesMounted = false;

function createIcon(
  slug,
  left,
  top,
  { maxSize, minSize, nearOpacity, farOpacity, centered = false },
) {
  const item = document.createElement('span');
  item.className = 'floating-icon';

  const depth = Math.random();
  const size = Math.round(maxSize - depth * (maxSize - minSize));
  const blur = (depth * 3.5).toFixed(2);
  const baseOpacity = (nearOpacity - depth * (nearOpacity - farOpacity)).toFixed(2);
  const duration = 14 + depth * 20;
  const delay = -Math.random() * duration;
  const drift = (Math.random() * 40 - 20).toFixed(1);
  const rotate = (Math.random() * 30 - 15).toFixed(1);

  item.style.left = `${left}%`;
  item.style.top = `${top}%`;
  // Centered icons sit on their point, so a narrow band can bound them.
  if (centered) {
    const half = `calc(${-size / 2}px * var(--icon-scale, 1))`;
    item.style.margin = `${half} 0 0 ${half}`;
  }
  item.style.animationDuration = `${duration.toFixed(1)}s`;
  item.style.animationDelay = `${delay.toFixed(1)}s`;
  item.style.setProperty('--drift', `${drift}px`);
  item.style.setProperty('--rotate', `${rotate}deg`);
  item.style.setProperty('--blur', `${blur}px`);
  item.style.setProperty('--base-opacity', baseOpacity);
  item.style.zIndex = String(Math.round((1 - depth) * 10));

  const img = createEmojiImg(slug);
  // --icon-scale lets the stylesheet shrink the side icons on smaller screens.
  img.style.width = `calc(${size}px * var(--icon-scale, 1))`;
  img.style.height = img.style.width;
  item.appendChild(img);
  return item;
}

function repelFromPointer(items) {
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

export function mountFloatingBackground(count = 18) {
  if (mounted) return;
  mounted = true;

  const wrap = document.createElement('div');
  wrap.className = 'floating-bg';
  wrap.setAttribute('aria-hidden', 'true');

  const items = [];
  for (let i = 0; i < count; i++) {
    // Anywhere but the band where the wordmark sits.
    let left = Math.random() * 100;
    let top = Math.random() * 100;
    while (top < 22 && left > 12 && left < 88) {
      left = Math.random() * 100;
      top = Math.random() * 100;
    }
    const item = createIcon(SLUGS[i % SLUGS.length], left, top, {
      maxSize: 120,
      minSize: 50,
      nearOpacity: 0.38,
      farOpacity: 0.12,
    });
    wrap.appendChild(item);
    items.push(item);
  }

  document.body.insertBefore(wrap, document.body.firstChild);
  repelFromPointer(items);
}

// The app keeps its screens in a narrow column, so on a tablet or a computer
// the margins on each side stay empty. Fills them with a quieter version of the
// auth background, kept out of the column so it never sits behind text. The
// stylesheet decides where it shows (.floating-sides): every screen when the
// margins are wide enough, the strips beside the piles of home on a phone.
export function mountSideBackground(perSide = 6) {
  if (sidesMounted) return;
  sidesMounted = true;

  const wrap = document.createElement('div');
  wrap.className = 'floating-bg floating-sides';
  wrap.setAttribute('aria-hidden', 'true');

  // Shuffled so the two sides don't show the same icons in the same order.
  const slugs = [...SLUGS].sort(() => Math.random() - 0.5);
  const items = [];
  for (const side of ['left', 'right']) {
    const band = document.createElement('div');
    band.className = `floating-band floating-band-${side}`;
    for (let i = 0; i < perSide; i++) {
      // One icon per horizontal slice keeps them spread down the whole
      // height instead of clumping.
      const top = ((i + 0.2 + Math.random() * 0.6) / perSide) * 100;
      const left = 25 + Math.random() * 50;
      const item = createIcon(slugs[items.length % slugs.length], left, top, {
        maxSize: 84,
        minSize: 40,
        nearOpacity: 0.24,
        farOpacity: 0.08,
        centered: true,
      });
      band.appendChild(item);
      items.push(item);
    }
    wrap.appendChild(band);
  }

  document.body.insertBefore(wrap, document.body.firstChild);
  repelFromPointer(items);
}
