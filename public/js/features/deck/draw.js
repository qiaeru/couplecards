// SPDX-License-Identifier: MIT
// Draw screen: reveal animation, holographic effects, swipe-to-ban and
// swipe-to-return. The tilt and swipe gesture live in tilt.js.

import {
  getCardById,
  getCardText,
  drawRandom,
  getHistory,
  banCard,
  unbanCard,
  addHistory,
  removeHistoryByUuid,
  isBanned,
} from '../../core/sync.js';
import { emojiImgHTML } from '../../ui/emoji.js';
import { t } from '../../core/i18n.js';
import { on } from '../../core/events.js';
import { CONFIG } from '../../config.js';
import { vibrate, requestWakeLock, releaseWakeLock, toast } from '../../ui/shell.js';
import { playDraw, playReveal, playBan, playReturn, playRedraw } from '../../ui/sound.js';
import { navigate } from '../../core/router.js';
import { refreshHomeCounts } from '../home/home.js';
import { attachTilt, detachTilt, prefersReducedMotion } from './tilt.js';

let currentCardId = null;
let previewMode = false;
let previewCardId = null;
// Bumped on each startDraw and on unmount, so an in-flight reveal animation can
// detect that the user has left and stop before its tail (sound, vibration,
// ambient dust) fires on a screen that's already gone.
let drawGeneration = 0;

const $ = (id) => document.getElementById(id);

// "Gold dust" reveal: motes converge into the card during the charge, a
// shockwave + ember fallout replace the old white flash at landing, and a
// thin ambient dust keeps drifting up while the revealed card floats.
const DUST_COLORS = ['#ffe2ad', '#ffd3e4', '#fff3d6', '#ffcf8f', '#f7e6ff'];
// Halve the particle counts on low-core phones; the choreography reads the
// same, only the density changes.
const DUST_DENSITY = (navigator.hardwareConcurrency || 8) <= 4 ? 0.5 : 1;

function dustColor() {
  return DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)];
}

function spawnFx(host, className, vars, lifetime) {
  const el = document.createElement('div');
  el.className = className;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  host.appendChild(el);
  setTimeout(() => el.remove(), lifetime);
}

function spawnMote(host, swirl) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 220 + Math.random() * 300;
  // Midpoint pushed sideways so the dust arcs into the card in one shared
  // swirl direction instead of flying in straight lines.
  const midAng = ang + swirl * (0.5 + Math.random() * 0.4);
  const midDist = dist * (0.4 + Math.random() * 0.15);
  const depth = Math.random(); // 0 = near (big, sharp), 1 = far (small, blurred)
  spawnFx(
    host,
    'mote',
    {
      '--x0': `calc(-50% + ${Math.cos(ang) * dist}px)`,
      '--y0': `calc(-55% + ${Math.sin(ang) * dist * 0.8}px)`,
      '--xm': `calc(-50% + ${Math.cos(midAng) * midDist}px)`,
      '--ym': `calc(-55% + ${Math.sin(midAng) * midDist * 0.8}px)`,
      '--s': `${(5.5 - depth * 3.5).toFixed(1)}px`,
      '--b': `${(depth * 1.8).toFixed(1)}px`,
      '--t': `${(0.85 + Math.random() * 0.65).toFixed(2)}s`,
      '--d': `${(Math.random() * 0.15).toFixed(2)}s`,
      '--o': (0.55 + Math.random() * 0.45 - depth * 0.25).toFixed(2),
      '--c': dustColor(),
    },
    2200,
  );
}

let dustInterval = null;
function startDust() {
  // Preview is a static viewer with no ambient effects. Gating here, not just
  // at call sites, keeps that rule in one place for every caller.
  if (previewMode || dustInterval || prefersReducedMotion()) return;
  const host = $('dust');
  if (!host) return;
  const swirl = Math.random() < 0.5 ? 1 : -1;
  for (let i = 0; i < Math.round(70 * DUST_DENSITY); i++) spawnMote(host, swirl);
  // Continuous inflow after the opening burst, so the swirl densifies as the
  // tension rises instead of thinning out.
  const perTick = Math.max(1, Math.round(2 * DUST_DENSITY));
  dustInterval = setInterval(() => {
    for (let i = 0; i < perTick; i++) spawnMote(host, swirl);
  }, 55);
}
function stopDust() {
  if (dustInterval) {
    clearInterval(dustInterval);
    dustInterval = null;
  }
}

// Landing: two expanding rings (pile-tinted, then rose) and a dense golden
// fallout raining below the card.
function spawnLanding(glowColor) {
  const host = $('landing');
  if (!host || prefersReducedMotion()) return;
  spawnFx(host, 'shockwave', { '--c': glowColor }, 1000);
  setTimeout(() => {
    spawnFx(host, 'shockwave', { '--c': 'rgba(255, 180, 210, 0.5)' }, 1000);
  }, 120);
  for (let i = 0; i < Math.round(70 * DUST_DENSITY); i++) {
    const depth = Math.random();
    spawnFx(
      host,
      'ember',
      {
        '--x0': `calc(-50% + ${(Math.random() * 260 - 130).toFixed(0)}px)`,
        '--y0': `calc(-50% + ${(Math.random() * 340 - 180).toFixed(0)}px)`,
        '--dx': `${(Math.random() * 180 - 90).toFixed(0)}px`,
        '--dy': `${(100 + Math.random() * 160).toFixed(0)}px`,
        '--s': `${(5 - depth * 3).toFixed(1)}px`,
        '--t': `${(1.8 + Math.random() * 1.6).toFixed(2)}s`,
        '--d': `${(Math.random() * 0.5).toFixed(2)}s`,
        '--c': dustColor(),
      },
      4200,
    );
  }
}

let ambientInterval = null;
function startAmbient() {
  if (previewMode || ambientInterval || prefersReducedMotion()) return;
  const host = $('ambient');
  if (!host) return;
  // The layer sits behind the card, and on phones the card fills almost the
  // whole stage, so dust born across the full stage width was mostly hidden.
  // Spawn in the visible bands instead: beside and below the actual card.
  const tilt = $('card-tilt');
  const halfW = (tilt?.clientWidth || 300) / 2;
  const halfH = (tilt?.clientHeight || 440) / 2;
  const spawnDrift = () => {
    const depth = Math.random();
    const zone = Math.random();
    let x0;
    let y0;
    if (zone < 0.8) {
      // Side bands, both directions equally likely. Clamped to the viewport
      // edge so narrow phones still get dust inside the visible sliver.
      const dir = zone < 0.4 ? -1 : 1;
      const maxX = window.innerWidth / 2 - 14;
      x0 = dir * Math.min(halfW + 10 + Math.random() * 80, maxX);
      y0 = -halfH * 0.3 + Math.random() * halfH * 1.3;
    } else {
      // Below the card, between it and the action buttons.
      x0 = (Math.random() * 2 - 1) * (halfW + 60);
      y0 = halfH + 10 + Math.random() * 60;
    }
    spawnFx(
      host,
      'drift',
      {
        '--x0': `calc(-50% + ${x0.toFixed(0)}px)`,
        '--y0': `calc(-50% + ${y0.toFixed(0)}px)`,
        '--dx': `${(Math.random() * 60 - 30).toFixed(0)}px`,
        '--dy': `${-(80 + Math.random() * 80).toFixed(0)}px`,
        '--s': `${(3.5 - depth * 2).toFixed(1)}px`,
        '--b': `${(depth * 1.5).toFixed(1)}px`,
        '--t': `${(4 + Math.random() * 2.5).toFixed(2)}s`,
        '--o': (0.55 - depth * 0.3).toFixed(2),
        '--c': dustColor(),
      },
      7000,
    );
  };
  const perTick = Math.max(2, Math.round(3 * DUST_DENSITY));
  ambientInterval = setInterval(() => {
    for (let i = 0; i < perTick; i++) spawnDrift();
  }, 550);
}
function stopAmbient() {
  if (ambientInterval) {
    clearInterval(ambientInterval);
    ambientInterval = null;
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resetStage() {
  stopAmbient();
  const f = $('card-flip');
  if (!f) return;
  const glow = $('bg-glow');
  const dust = $('dust');
  const landing = $('landing');
  const ambient = $('ambient');
  const a = $('draw-actions');
  const tilt = $('card-tilt');
  const front = document.querySelector('#card-flip .card-front');

  f.className = 'card-flip';
  if (glow) glow.className = 'bg-glow';
  if (dust) dust.innerHTML = '';
  if (landing) landing.innerHTML = '';
  if (ambient) ambient.innerHTML = '';
  $('card-ground')?.classList.remove('active');
  $('reveal-streak')?.classList.remove('go');
  if (a) a.hidden = true;
  const preview = $('preview-actions');
  if (preview) preview.hidden = true;
  stopDust();

  detachTilt();
  if (tilt) {
    tilt.classList.remove('interactive', 'swipe-out-right', 'swipe-out-left', 'dragging');
    tilt.style.setProperty('--rx', '0deg');
    tilt.style.setProperty('--ry', '0deg');
    tilt.style.setProperty('--tx', '0px');
    tilt.style.setProperty('--tz', '0deg');
  }
  if (front) {
    front.classList.remove('holo-on', 'idle-shine');
    front.style.setProperty('--px', '50');
    front.style.setProperty('--py', '50');
  }
  const ban = tilt?.querySelector('.swipe-label-ban');
  const ret = tilt?.querySelector('.swipe-label-return');
  if (ban) ban.style.opacity = 0;
  if (ret) ret.style.opacity = 0;
}

function startTilt() {
  attachTilt({
    isPreview: () => previewMode,
    onSwipe: (direction) => (direction > 0 ? doReturn(true) : doBan(true)),
  });
}

function announceCard(card) {
  const el = document.getElementById('card-announce');
  if (!el) return;
  const { title, description } = getCardText(card);
  el.textContent = t('draw.announce', { title, description });
}

// Re-called on reveal and on locale change so the visible card follows
// the active language.
function applyCardText(card) {
  const { title, description, locale } = getCardText(card);
  const titleEl = $('card-title');
  const descEl = $('card-description');
  titleEl.textContent = title;
  descEl.textContent = description;
  // Tag with the effective locale so screen readers switch voice when the
  // card falls back to English because the requested locale is missing.
  titleEl.setAttribute('lang', locale);
  descEl.setAttribute('lang', locale);
}

async function startDraw(pile) {
  previewMode = false;
  // Claim this generation. If unmount or a newer draw bumps the counter while
  // we await, stale() turns true and we bail; the bail itself touches no shared
  // state (wake lock, dust, ambient) so it can't clobber a concurrent draw,
  // unmount having already cleaned those up. Returns true only on full
  // completion, so mount() skips its listener setup when we bailed.
  const myGen = ++drawGeneration;
  const stale = () => myGen !== drawGeneration;
  const recentLimit = CONFIG.recentExclude[pile] || 3;
  const recentIds = getHistory()
    .filter((h) => {
      const c = getCardById(h.cardId);
      return c && c.pile === pile;
    })
    .slice(0, recentLimit)
    .map((h) => h.cardId);
  const card = drawRandom(pile, recentIds);
  if (!card) {
    toast(t('draw.toast.empty'));
    navigate('home');
    return false;
  }
  currentCardId = card.id;

  applyCardText(card);
  $('card-emoji').innerHTML = emojiImgHTML(card.emoji || (pile === 'home' ? 'house' : 'city'));
  $('card-pile-label').textContent = card.foil
    ? `${t(`piles.${pile}.label`)} · ${t('draw.foil.rare')}`
    : t(`piles.${pile}.label`);
  const frontEl = document.querySelector('#card-flip .card-front');
  frontEl.classList.remove('for-home', 'for-outdoor', 'is-foil');
  frontEl.classList.add(pile === 'home' ? 'for-home' : 'for-outdoor');
  if (card.foil) frontEl.classList.add('is-foil');
  // Tint the back flash with the pile the user just tapped.
  const backEl = document.querySelector('#card-flip .card-back');
  backEl.classList.remove('for-home', 'for-outdoor');
  backEl.classList.add(pile === 'home' ? 'for-home' : 'for-outdoor');

  resetStage();
  await requestWakeLock();
  if (stale()) return false;
  playDraw();

  const f = $('card-flip');
  const glow = $('bg-glow');
  const a = $('draw-actions');

  f.classList.add(pile === 'home' ? 'glow-home' : 'glow-outdoor');
  const glowColor = pile === 'home' ? '#ffb47a' : '#8ab4ff';

  const reduced = prefersReducedMotion();
  void f.offsetWidth;

  await wait(30);
  if (stale()) return false;
  f.classList.add('enter');
  await wait(reduced ? 250 : CONFIG.draw.enterDuration);
  if (stale()) return false;

  if (reduced) {
    f.classList.add('flipping');
    await wait(400);
    if (stale()) return false;
  } else {
    // Charge: the card levitates while gold dust swirls into it.
    glow.classList.add('active');
    f.classList.add('charging');
    startDust();
    await wait(CONFIG.draw.chargeDuration);
    if (stale()) return false;
    // Inhale: one sharp contraction before the release.
    stopDust();
    f.classList.remove('charging');
    f.classList.add('climax');
    await wait(CONFIG.draw.climaxDuration);
    if (stale()) return false;
    // Flip, with a light streak sweeping the face as it turns.
    f.classList.remove('climax');
    f.classList.add('flipping');
    $('reveal-streak')?.classList.add('go');
    await wait(CONFIG.draw.flipDuration);
    if (stale()) return false;
  }

  f.classList.add('settled');
  f.classList.remove('flipping', 'enter');
  glow.classList.remove('active');
  stopDust();
  if (!reduced) {
    spawnLanding(glowColor);
    // Cascade the card text in and let the card float above its shadow.
    f.classList.add('reveal-cascade', 'floaty');
    $('card-ground')?.classList.add('active');
  }

  const front = document.querySelector('#card-flip .card-front');
  front.classList.add('idle-shine');

  await wait(reduced ? CONFIG.draw.reducedMotionShort : CONFIG.draw.revealDelay);
  if (stale()) return false;
  vibrate(CONFIG.vibrations.reveal);
  playReveal(!!card.foil);
  announceCard(card);
  a.hidden = false;
  startTilt();
  startAmbient();
  return true;
}

async function doReturn(animated = false) {
  if (!currentCardId) return;
  const id = currentCardId;
  currentCardId = null;
  const entry = await addHistory({
    cardId: id,
    drawnAt: new Date().toISOString(),
    action: 'returned',
  });
  vibrate(CONFIG.vibrations.returnAction);
  playReturn();
  finishWith(animated ? 'swipe-out-right' : null, {
    message: t('draw.toast.returned'),
    action: {
      label: t('common.undo'),
      onClick: () => {
        if (entry?.clientUuid) removeHistoryByUuid(entry.clientUuid);
      },
    },
  });
}

async function doBan(animated = false) {
  if (!currentCardId) return;
  const id = currentCardId;
  currentCardId = null;
  banCard(id);
  const entry = await addHistory({
    cardId: id,
    drawnAt: new Date().toISOString(),
    action: 'banned',
  });
  vibrate(CONFIG.vibrations.banAction);
  playBan();
  finishWith(animated ? 'swipe-out-left' : null, {
    message: t('draw.toast.banned'),
    action: {
      label: t('common.undo'),
      onClick: () => {
        unbanCard(id);
        if (entry?.clientUuid) removeHistoryByUuid(entry.clientUuid);
      },
    },
  });
}

function doRedraw() {
  if (!currentCardId) return;
  const id = currentCardId;
  const card = getCardById(id);
  const pile = card ? card.pile : null;
  currentCardId = null;
  addHistory({ cardId: id, drawnAt: new Date().toISOString(), action: 'returned' });
  vibrate(CONFIG.vibrations.redrawAction);
  playRedraw();
  stopAmbient();
  if (pile) startDraw(pile);
}

// toastArg is either a string (plain toast) or { message, action } for a
// snackbar with an action button.
function finishWith(swipeClass, toastArg) {
  stopAmbient();
  refreshHomeCounts();
  releaseWakeLock();
  const tilt = $('card-tilt');
  const a = $('draw-actions');
  if (a) a.hidden = true;
  const backToHome = () => {
    if (tilt) tilt.classList.remove('swipe-out-right', 'swipe-out-left');
    // The undo toast is shown once Home is mounted: the route change itself
    // dismisses action toasts, so one shown before it would vanish at once.
    document.addEventListener(
      'route:mounted',
      () => {
        if (typeof toastArg === 'string') toast(toastArg);
        else if (toastArg) toast(toastArg.message, { action: toastArg.action });
      },
      { once: true },
    );
    navigate('home');
  };
  if (swipeClass && tilt) {
    tilt.classList.add(swipeClass);
    setTimeout(backToHome, CONFIG.swipe.exitDuration);
  } else {
    backToHome();
  }
}

// In preview mode the ban/unban controls reflect the card's current state.
// Toggling them mutates state without leaving the screen, so the button
// swaps in place and the close button takes the user back to where they
// came from (history, collection, etc.).
function updatePreviewActions(cardId) {
  const banBtn = document.getElementById('preview-action-ban');
  const unbanBtn = document.getElementById('preview-action-unban');
  if (!banBtn || !unbanBtn) return;
  const banned = isBanned(cardId);
  banBtn.hidden = banned;
  unbanBtn.hidden = !banned;
}

// Invoked from the history feature to open a card in read-only preview.
function showCardDirectly(cardId) {
  const card = getCardById(cardId);
  if (!card) return false;
  // The preview URL (#/draw?preview=<id>) is user-editable, so only cards the
  // user actually drew may open: an unguarded lookup would expose the whole
  // deck one id at a time. Same discovery rule as the Collection grid.
  if (!getHistory().some((e) => e.cardId === cardId)) return false;
  previewMode = true;
  currentCardId = null;
  previewCardId = cardId;
  const pile = card.pile;
  applyCardText(card);
  $('card-emoji').innerHTML = emojiImgHTML(card.emoji || (pile === 'home' ? 'house' : 'city'));
  $('card-pile-label').textContent = card.foil
    ? `${t(`piles.${pile}.label`)} · ${t('draw.foil.rare')}`
    : t(`piles.${pile}.label`);
  const frontEl = document.querySelector('#card-flip .card-front');
  frontEl.classList.remove('for-home', 'for-outdoor', 'is-foil');
  frontEl.classList.add(pile === 'home' ? 'for-home' : 'for-outdoor');
  if (card.foil) frontEl.classList.add('is-foil');
  const backEl = document.querySelector('#card-flip .card-back');
  backEl.classList.remove('for-home', 'for-outdoor');
  backEl.classList.add(pile === 'home' ? 'for-home' : 'for-outdoor');
  resetStage();
  const f = $('card-flip');
  const preview = $('preview-actions');
  f.classList.add(pile === 'home' ? 'glow-home' : 'glow-outdoor');
  f.classList.add('settled');
  // The previewed card floats over its shadow like a freshly revealed one,
  // so the object feels alive everywhere it appears. The one-shot effects
  // (dust, landing shockwave, text cascade) stay reserved for the live
  // reveal: replaying them on every card opened from Collection or History
  // would turn them into noise.
  if (!prefersReducedMotion()) {
    f.classList.add('floaty');
    $('card-ground')?.classList.add('active');
  }
  frontEl.classList.add('idle-shine');
  announceCard(card);
  if (preview) preview.hidden = false;
  updatePreviewActions(cardId);
  startTilt();
  return true;
}

async function previewBan() {
  const id = previewCardId;
  if (!id || !previewMode) return;
  await banCard(id);
  vibrate(CONFIG.vibrations.banAction);
  playBan();
  updatePreviewActions(id);
  refreshHomeCounts();
  toast(t('collection.toast.banned'), {
    action: {
      label: t('common.undo'),
      onClick: async () => {
        await unbanCard(id);
        if (previewMode && previewCardId === id) updatePreviewActions(id);
        refreshHomeCounts();
      },
    },
  });
}

async function previewUnban() {
  const id = previewCardId;
  if (!id || !previewMode) return;
  await unbanCard(id);
  vibrate(CONFIG.vibrations.returnAction);
  playReturn();
  updatePreviewActions(id);
  refreshHomeCounts();
  toast(t('collection.toast.restored'));
}

// ArrowLeft bans, ArrowRight returns to the pile. Preview mode is read-only,
// so only Escape is active there (handled in onDrawKeydown).
function isActionable() {
  if (previewMode) return false;
  if (!currentCardId) return false;
  const actions = document.getElementById('draw-actions');
  return actions && !actions.hidden;
}
function onDrawKeydown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  // Escape closes the preview, even before the draw-action buttons appear.
  if (event.key === 'Escape' && previewMode) {
    event.preventDefault();
    navigate('home');
    return;
  }
  if (!isActionable()) return;
  const animated = !prefersReducedMotion();
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    doBan(animated);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    doReturn(animated);
  }
}

let inactivityTimer = 0;
let lastInactivityBump = 0;
function bumpInactivity() {
  // Preview is a read-only viewer: no wake lock, no draw, so never auto-navigate
  // the user away. The inactivity timeout is only meaningful for a live draw.
  if (previewMode) return;
  // pointermove fires up to ~60 Hz during a tilt drag; coalesce to one bump
  // per ~500 ms so we don't clearTimeout/setTimeout on every frame.
  const now = performance.now();
  if (now - lastInactivityBump < 500) return;
  lastInactivityBump = now;
  if (inactivityTimer) clearTimeout(inactivityTimer);
  // No point starting the timer when the tab is backgrounded: the wake
  // lock is already released and there is no live activity to gate on.
  if (document.hidden) return;
  inactivityTimer = setTimeout(() => {
    toast(t('draw.inactivity'));
    releaseWakeLock();
    navigate('home');
  }, CONFIG.inactivityTimeoutMs);
}
const inactivityListeners = ['pointerdown', 'pointermove', 'keydown', 'touchstart'];

function onVisibilityChange() {
  if (document.hidden) {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = 0;
    }
    // Stop the ambient effects while the tab is backgrounded. Browsers
    // throttle background timers but still execute each tick (DOM node
    // create / setTimeout queue), and the visuals are invisible anyway.
    stopAmbient();
    stopDust();
    return;
  }
  bumpInactivity();
  // Resume the ambient dust when the user is back and a card has been
  // revealed (the settled class means the flip animation has landed). The
  // converging dust stays off: it only runs during the pre-reveal build-up.
  // startAmbient no-ops in preview, so no guard is needed here.
  if ($('card-flip')?.classList.contains('settled')) {
    startAmbient();
  }
}

let localeUnsubscribers = [];

function onLocaleChange() {
  const id = currentCardId || previewCardId;
  if (!id) return;
  const card = getCardById(id);
  if (!card) return;
  applyCardText(card);
  announceCard(card);
}

export async function mount({ params }) {
  document.getElementById('action-ban')?.addEventListener('click', () => doBan(false));
  document.getElementById('action-return')?.addEventListener('click', () => doReturn(false));
  document.getElementById('action-redraw')?.addEventListener('click', doRedraw);
  document.getElementById('action-close')?.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('home');
  });
  document.getElementById('preview-action-ban')?.addEventListener('click', previewBan);
  document.getElementById('preview-action-unban')?.addEventListener('click', previewUnban);

  const pile = params.get ? params.get('pile') : params.pile;
  const preview = params.get ? params.get('preview') : params.preview;
  if (preview) {
    // Stale deep link or deleted card: don't strand the user on a blank screen.
    if (!showCardDirectly(preview)) {
      navigate('home');
      return;
    }
  } else if (pile === 'home' || pile === 'outdoor') {
    // If the user navigates away mid-reveal, startDraw bails and returns false;
    // skip the listener setup so we don't re-add document listeners after the
    // unmount that the new navigation already ran.
    if (!(await startDraw(pile))) return;
  } else {
    navigate('home');
    return;
  }

  bumpInactivity();
  inactivityListeners.forEach((ev) =>
    document.addEventListener(ev, bumpInactivity, { passive: true }),
  );
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onDrawKeydown);
  // Two steps on a language change: the cached deck answers first, then the
  // deck refetched in the new language lands and the card text settles.
  localeUnsubscribers = [on('i18n:change', onLocaleChange), on('deck:changed', onLocaleChange)];
}

export function unmount() {
  document.removeEventListener('keydown', onDrawKeydown);
  stopAmbient();
  stopDust();
  detachTilt();
  releaseWakeLock();
  drawGeneration++; // invalidate any reveal animation still mid-await
  currentCardId = null;
  previewMode = false;
  previewCardId = null;
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = 0;
  }
  inactivityListeners.forEach((ev) => document.removeEventListener(ev, bumpInactivity));
  document.removeEventListener('visibilitychange', onVisibilityChange);
  for (const fn of localeUnsubscribers) fn();
  localeUnsubscribers = [];
}
