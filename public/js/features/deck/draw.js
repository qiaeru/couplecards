// SPDX-License-Identifier: MIT
// Draw screen: reveal animation, tilt, holographic effects, swipe-to-ban and
// swipe-to-return.

import { getCardById, getCardText, drawRandom, getHistory, banCard, unbanCard, addHistory, removeHistoryByUuid, isBanned } from '../../core/sync.js';
import { emojiImgHTML, createEmojiImg, HEART_KEYS } from '../../ui/emoji.js';
import { t } from '../../core/i18n.js';
import { on } from '../../core/events.js';
import { CONFIG } from '../../config.js';
import { vibrate, requestWakeLock, releaseWakeLock, toast } from '../../ui/shell.js';
import { playDraw, playReveal, playBan, playReturn, playRedraw } from '../../ui/sound.js';
import { navigate } from '../../core/router.js';
import { refreshHomeCounts } from '../home/home.js';

let currentCardId = null;
let previewMode = false;
let previewCardId = null;

const $ = (id) => document.getElementById(id);

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createParticles(color) {
  const host = $('particles');
  if (!host) return;
  host.innerHTML = '';
  const count = prefersReducedMotion() ? 0 : 8;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const dist = 150 + Math.random() * 90;
    p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
    p.style.animationDelay = `${Math.random() * 0.8}s`;
    p.style.color = color;
    p.style.background = color;
    host.appendChild(p);
  }
}

let heartsInterval = null;
function spawnHeart() {
  const host = $('hearts');
  if (!host) return;
  const h = document.createElement('div');
  h.className = 'heart';
  const img = createEmojiImg(HEART_KEYS[Math.floor(Math.random() * HEART_KEYS.length)]);
  h.appendChild(img);
  const startX = (Math.random() - 0.5) * 240;
  const startY = 250 + Math.random() * 50;
  h.style.left = `calc(50% + ${startX}px)`;
  h.style.top = `calc(50% + ${startY}px)`;
  const dx = (Math.random() - 0.5) * 120;
  const dy = -520 - Math.random() * 180;
  h.style.setProperty('--dx1', `${dx}px`);
  h.style.setProperty('--dy1', `${dy}px`);
  h.style.setProperty('--r', `${(Math.random() - 0.5) * 30}deg`);
  h.style.fontSize = `${1.8 + Math.random() * 1.2}rem`;
  host.appendChild(h);
  setTimeout(() => h.remove(), CONFIG.hearts.lifetime);
}
function startHearts() {
  if (heartsInterval || prefersReducedMotion()) return;
  const tick = () => {
    spawnHeart();
    if (Math.random() < CONFIG.hearts.doubleBeatChance) setTimeout(spawnHeart, 120);
  };
  tick();
  heartsInterval = setInterval(tick, CONFIG.hearts.interval);
}
function stopHearts() {
  if (heartsInterval) { clearInterval(heartsInterval); heartsInterval = null; }
}

let rippleInterval = null;
const RIPPLE_VARIANTS = ['', 'variant-a', 'variant-b'];
let rippleVariantIdx = 0;
function spawnRipple() {
  const host = $('ripples');
  if (!host) return;
  const r = document.createElement('div');
  const variant = RIPPLE_VARIANTS[rippleVariantIdx++ % RIPPLE_VARIANTS.length];
  r.className = 'ripple' + (variant ? ' ' + variant : '');
  host.appendChild(r);
  setTimeout(() => r.remove(), 1500);
}
function startRipples(interval) {
  stopRipples();
  if (prefersReducedMotion()) return;
  spawnRipple();
  rippleInterval = setInterval(spawnRipple, interval);
}
function stopRipples() {
  if (rippleInterval) { clearInterval(rippleInterval); rippleInterval = null; }
}

function createBurst(color) {
  const host = $('burst');
  if (!host) return;
  host.innerHTML = '';
  host.classList.remove('active');
  if (prefersReducedMotion()) return;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const shard = document.createElement('div');
    shard.className = 'shard';
    const angle = (360 * i) / count + (Math.random() * 12 - 6);
    const dist = 180 + Math.random() * 120;
    shard.style.setProperty('--a', `${angle}deg`);
    shard.style.setProperty('--d', `${dist}px`);
    shard.style.height = `${60 + Math.random() * 60}px`;
    if (Math.random() < 0.3) shard.style.background = `linear-gradient(180deg, ${color}, transparent)`;
    host.appendChild(shard);
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function resetStage() {
  stopHearts();
  const f = $('card-flip');
  if (!f) return;
  const p = $('particles');
  const b = $('burst');
  const glow = $('bg-glow');
  const ripples = $('ripples');
  const hearts = $('hearts');
  const s = $('screen-draw');
  const a = $('draw-actions');
  const tilt = $('card-tilt');
  const front = document.querySelector('#card-flip .card-front');

  f.className = 'card-flip';
  if (p) { p.className = 'particles'; p.innerHTML = ''; }
  if (b) { b.className = 'burst'; b.innerHTML = ''; }
  if (glow) glow.className = 'bg-glow';
  if (ripples) ripples.innerHTML = '';
  if (hearts) hearts.innerHTML = '';
  if (s) s.classList.remove('flash', 'preflash');
  if (a) a.hidden = true;
  const preview = $('preview-actions');
  if (preview) preview.hidden = true;
  stopRipples();

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

// iOS 13+ gyroscope permission.
let orientationPermission = null;
function orientationNeedsPermission() {
  return typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
}
export async function requestOrientationIfNeeded() {
  if (orientationPermission !== null) return;
  if (!('DeviceOrientationEvent' in window)) { orientationPermission = 'unsupported'; return; }
  if (!orientationNeedsPermission()) { orientationPermission = 'granted'; return; }
  try {
    const r = await DeviceOrientationEvent.requestPermission();
    orientationPermission = r === 'granted' ? 'granted' : 'denied';
  } catch { orientationPermission = 'denied'; }
}

let tiltActive = false;
let tiltPointerDown = null;
let tiltPointerMove = null;
let tiltPointerUp = null;
let orientationAttached = false;
let orientationHandler = null;
let isReturning = false;
let returnRaf = 0;

function applyTilt(rx, ry) {
  if (prefersReducedMotion()) return;
  const tilt = $('card-tilt');
  const front = document.querySelector('#card-flip .card-front');
  if (!tilt || !front) return;
  const MAX = CONFIG.tilt.maxDegrees;
  const clampedRx = Math.max(-MAX, Math.min(MAX, rx));
  const clampedRy = Math.max(-MAX, Math.min(MAX, ry));
  tilt.style.setProperty('--rx', `${clampedRx}deg`);
  tilt.style.setProperty('--ry', `${clampedRy}deg`);
  const px = 50 + (clampedRy / MAX) * 40;
  const py = 50 - (clampedRx / MAX) * 40;
  front.style.setProperty('--px', px.toFixed(1));
  front.style.setProperty('--py', py.toFixed(1));
  front.classList.add('holo-on');
  front.classList.remove('idle-shine');
}

function smoothReturnToCenter() {
  const tilt = $('card-tilt');
  if (!tilt) return;
  const banLabel = tilt.querySelector('.swipe-label-ban');
  const returnLabel = tilt.querySelector('.swipe-label-return');
  if (returnRaf) cancelAnimationFrame(returnRaf);
  const parse = (name) => parseFloat(tilt.style.getPropertyValue(name) || '0');
  const rx0 = parse('--rx');
  const ry0 = parse('--ry');
  const tx0 = parse('--tx');
  const tz0 = parse('--tz');
  const ban0 = banLabel ? parseFloat(banLabel.style.opacity || '0') : 0;
  const ret0 = returnLabel ? parseFloat(returnLabel.style.opacity || '0') : 0;
  if (Math.abs(rx0) < 0.1 && Math.abs(ry0) < 0.1 && Math.abs(tx0) < 0.5
      && Math.abs(tz0) < 0.1 && ban0 < 0.01 && ret0 < 0.01) {
    tilt.style.setProperty('--rx', '0deg');
    tilt.style.setProperty('--ry', '0deg');
    tilt.style.setProperty('--tx', '0px');
    tilt.style.setProperty('--tz', '0deg');
    if (banLabel) banLabel.style.opacity = 0;
    if (returnLabel) returnLabel.style.opacity = 0;
    return;
  }
  isReturning = true;
  const t0 = performance.now();
  const DUR = 320;
  const step = (now) => {
    const p = Math.min((now - t0) / DUR, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const k = 1 - eased;
    tilt.style.setProperty('--rx', `${(rx0 * k).toFixed(3)}deg`);
    tilt.style.setProperty('--ry', `${(ry0 * k).toFixed(3)}deg`);
    tilt.style.setProperty('--tx', `${(tx0 * k).toFixed(2)}px`);
    tilt.style.setProperty('--tz', `${(tz0 * k).toFixed(3)}deg`);
    if (banLabel) banLabel.style.opacity = (ban0 * k).toFixed(3);
    if (returnLabel) returnLabel.style.opacity = (ret0 * k).toFixed(3);
    if (p < 1) returnRaf = requestAnimationFrame(step);
    else { returnRaf = 0; isReturning = false; }
  };
  returnRaf = requestAnimationFrame(step);
}

function resetTilt() {
  const front = document.querySelector('#card-flip .card-front');
  if (front) { front.classList.remove('holo-on'); front.classList.add('idle-shine'); }
  smoothReturnToCenter();
}

function attachTilt() {
  if (tiltActive) return;
  tiltActive = true;
  const tilt = $('card-tilt');
  if (!tilt) return;
  tilt.classList.add('interactive');

  const MAX = CONFIG.tilt.maxDegrees;
  const DRAG_THRESHOLD = 8;
  const SWIPE_FULL_DISTANCE = 120;
  const VELOCITY_THRESHOLD = 0.45;

  let raf = 0;
  let pendingX = 0, pendingY = 0;
  let pointerDown = false;
  let mode = 'idle';
  let startX = 0, startY = 0, startTime = 0;
  let velocitySamples = [];
  // Tracks whether the current drag has already crossed the commit threshold,
  // so we only vibrate on the transition (not every frame past it).
  let swipePastThreshold = false;

  const banLabel = tilt.querySelector('.swipe-label-ban');
  const returnLabel = tilt.querySelector('.swipe-label-return');

  const updateTiltFromPointer = () => {
    const rect = tilt.getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((pendingX - rect.left) / rect.width) * 100));
    const py = Math.max(0, Math.min(100, ((pendingY - rect.top) / rect.height) * 100));
    const rx = -((py - 50) / 50) * MAX;
    const ry = ((px - 50) / 50) * MAX;
    applyTilt(rx, ry);
  };

  const applySwipe = (dx) => {
    tilt.style.setProperty('--tx', `${dx}px`);
    tilt.style.setProperty('--tz', `${dx * 0.08}deg`);
    tilt.style.setProperty('--rx', '0deg');
    tilt.style.setProperty('--ry', '0deg');
    const past = Math.abs(dx) >= CONFIG.swipe.minDistance;
    if (past !== swipePastThreshold) {
      swipePastThreshold = past;
      if (past) vibrate(CONFIG.vibrations.swipeThreshold);
    }
    const intensity = Math.min(Math.abs(dx) / SWIPE_FULL_DISTANCE, 1);
    if (dx > 0) {
      if (returnLabel) returnLabel.style.opacity = intensity;
      if (banLabel) banLabel.style.opacity = 0;
    } else if (dx < 0) {
      if (banLabel) banLabel.style.opacity = intensity;
      if (returnLabel) returnLabel.style.opacity = 0;
    } else {
      if (banLabel) banLabel.style.opacity = 0;
      if (returnLabel) returnLabel.style.opacity = 0;
    }
  };

  tiltPointerDown = (e) => {
    pointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    mode = 'idle';
    swipePastThreshold = false;
    velocitySamples = [{ x: e.clientX, t: performance.now() }];
    try { tilt.setPointerCapture(e.pointerId); } catch {}
  };

  tiltPointerMove = (e) => {
    if (isReturning) return;
    const isMouse = e.pointerType === 'mouse';
    if (isMouse && !pointerDown) {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; updateTiltFromPointer(); });
      return;
    }
    if (!pointerDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (mode === 'idle') {
      if (ax < DRAG_THRESHOLD && ay < DRAG_THRESHOLD) return;
      if (previewMode) mode = 'tilt';
      else if (!isMouse || ax > ay * 1.2) { mode = 'swipe'; tilt.classList.add('dragging'); }
      else mode = 'tilt';
    }
    if (mode === 'swipe') {
      const nowT = performance.now();
      velocitySamples.push({ x: e.clientX, t: nowT });
      velocitySamples = velocitySamples.filter((s) => nowT - s.t < 120);
      pendingX = dx;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; applySwipe(pendingX); });
    } else if (mode === 'tilt') {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; updateTiltFromPointer(); });
    }
  };

  tiltPointerUp = (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    const wasMode = mode;
    mode = 'idle';
    if (wasMode === 'swipe') {
      tilt.classList.remove('dragging');
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dt = Date.now() - startTime;
      let velocity = 0;
      if (velocitySamples.length >= 2) {
        const first = velocitySamples[0];
        const last = velocitySamples[velocitySamples.length - 1];
        const dts = last.t - first.t;
        if (dts > 0) velocity = (last.x - first.x) / dts;
      }
      const isFlick = Math.abs(velocity) > VELOCITY_THRESHOLD
        && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy);
      const isDistanceSwipe = Math.abs(dx) > CONFIG.swipe.minDistance
        && Math.abs(dx) > Math.abs(dy) * CONFIG.swipe.horizontalRatio
        && dt < CONFIG.swipe.maxDuration;
      if (isFlick || isDistanceSwipe) {
        const direction = isFlick ? (velocity > 0 ? 1 : -1) : (dx > 0 ? 1 : -1);
        if (direction > 0) doReturn(true);
        else doBan(true);
      } else {
        void tilt.offsetWidth;
        smoothReturnToCenter();
      }
    } else if (wasMode === 'tilt' || !orientationAttached) {
      resetTilt();
    }
  };

  tilt.addEventListener('pointermove', tiltPointerMove);
  tilt.addEventListener('pointerdown', tiltPointerDown);
  tilt.addEventListener('pointerup', tiltPointerUp);
  tilt.addEventListener('pointercancel', tiltPointerUp);
  tilt.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointerDown && !orientationAttached) resetTilt();
  });

  if (orientationPermission === 'granted') attachOrientation();
}

function attachOrientation() {
  if (orientationAttached) return;
  if (prefersReducedMotion()) return;
  orientationAttached = true;
  let baseBeta = null, baseGamma = null;
  const CLAMP = CONFIG.tilt.orientationClampDeg;
  const MAX = CONFIG.tilt.maxDegrees;
  let raf = 0;
  let pending = null;
  const apply = () => {
    raf = 0;
    if (isReturning || !pending) return;
    const { beta, gamma } = pending;
    if (beta === null || gamma === null) return;
    if (baseBeta === null) { baseBeta = beta; baseGamma = gamma; return; }
    let dBeta = Math.max(-CLAMP, Math.min(CLAMP, beta - baseBeta));
    let dGamma = Math.max(-CLAMP, Math.min(CLAMP, gamma - baseGamma));
    const rx = -(dBeta / CLAMP) * MAX;
    const ry = (dGamma / CLAMP) * MAX;
    applyTilt(rx, ry);
  };
  orientationHandler = (e) => {
    pending = { beta: e.beta, gamma: e.gamma };
    if (raf) return;
    raf = requestAnimationFrame(apply);
  };
  window.addEventListener('deviceorientation', orientationHandler);
}

function detachTilt() {
  if (!tiltActive) return;
  const tilt = $('card-tilt');
  if (tilt && tiltPointerMove) {
    tilt.removeEventListener('pointermove', tiltPointerMove);
    tilt.removeEventListener('pointerdown', tiltPointerDown);
    tilt.removeEventListener('pointerup', tiltPointerUp);
    tilt.removeEventListener('pointercancel', tiltPointerUp);
  }
  tiltPointerMove = tiltPointerDown = tiltPointerUp = null;
  tiltActive = false;
  if (orientationAttached && orientationHandler) {
    window.removeEventListener('deviceorientation', orientationHandler);
    orientationAttached = false;
    orientationHandler = null;
  }
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

export async function startDraw(pile) {
  previewMode = false;
  const recentLimit = CONFIG.recentExclude[pile] || 3;
  const recentIds = getHistory()
    .filter((h) => { const c = getCardById(h.cardId); return c && c.pile === pile; })
    .slice(0, recentLimit)
    .map((h) => h.cardId);
  const card = drawRandom(pile, recentIds);
  if (!card) {
    toast(t('draw.toast.empty'));
    navigate('home');
    return;
  }
  currentCardId = card.id;

  applyCardText(card);
  $('card-emoji').innerHTML = emojiImgHTML(card.emoji || (pile === 'home' ? 'house' : 'city'));
  $('card-pile-label').textContent = t(`piles.${pile}.label`);
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
  playDraw();

  const f = $('card-flip');
  const p = $('particles');
  const b = $('burst');
  const glow = $('bg-glow');
  const s = $('screen-draw');
  const a = $('draw-actions');

  f.classList.add(pile === 'home' ? 'glow-home' : 'glow-outdoor');
  const glowColor = pile === 'home' ? '#ffb47a' : '#8ab4ff';
  createParticles(glowColor);
  createBurst(glowColor);

  const reduced = prefersReducedMotion();
  void f.offsetWidth;

  await wait(30);
  f.classList.add('enter');
  await wait(reduced ? 250 : CONFIG.draw.enterDuration);

  if (reduced) {
    f.classList.add('flipping');
    await wait(400);
  } else {
    glow.classList.add('active');
    p.classList.add('active');
    f.classList.add('pulsing');
    startRipples(CONFIG.ripples.normalInterval);
    await wait(CONFIG.draw.pulsingDuration);
    glow.classList.add('boost');
    f.classList.remove('pulsing');
    f.classList.add('climax');
    s.classList.add('preflash');
    startRipples(CONFIG.ripples.boostInterval);
    await wait(CONFIG.draw.climaxDuration);
    stopRipples();
    f.classList.remove('climax');
    f.classList.add('flipping');
    await wait(CONFIG.draw.flipDuration);
  }

  f.classList.add('settled');
  f.classList.remove('flipping', 'enter');
  s.classList.add('flash');
  s.classList.remove('preflash');
  b.classList.add('active');
  p.classList.remove('active');
  glow.classList.remove('active', 'boost');
  stopRipples();

  const front = document.querySelector('#card-flip .card-front');
  front.classList.add('idle-shine');

  await wait(reduced ? CONFIG.draw.reducedMotionShort : CONFIG.draw.revealDelay);
  vibrate(CONFIG.vibrations.reveal);
  playReveal(!!card.foil);
  announceCard(card);
  a.hidden = false;
  attachTilt();
  startHearts();
}

function doReturn(animated = false) {
  if (!currentCardId) return;
  const id = currentCardId;
  currentCardId = null;
  addHistory({ cardId: id, drawnAt: new Date().toISOString(), action: 'returned' });
  vibrate(CONFIG.vibrations.returnAction);
  playReturn();
  finishWith(animated ? 'swipe-out-right' : null, t('draw.toast.returned'));
}

async function doBan(animated = false) {
  if (!currentCardId) return;
  const id = currentCardId;
  currentCardId = null;
  banCard(id);
  const entry = await addHistory({ cardId: id, drawnAt: new Date().toISOString(), action: 'banned' });
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
  stopHearts();
  if (pile) startDraw(pile);
}

// toastArg is either a string (plain toast) or { message, action } for a
// snackbar with an action button.
function finishWith(swipeClass, toastArg) {
  stopHearts();
  refreshHomeCounts();
  releaseWakeLock();
  const tilt = $('card-tilt');
  const a = $('draw-actions');
  if (a) a.hidden = true;
  const backToHome = () => {
    if (tilt) tilt.classList.remove('swipe-out-right', 'swipe-out-left');
    navigate('home');
    if (typeof toastArg === 'string') toast(toastArg);
    else if (toastArg) toast(toastArg.message, { action: toastArg.action });
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
export function showCardDirectly(cardId) {
  const card = getCardById(cardId);
  if (!card) return;
  previewMode = true;
  currentCardId = null;
  previewCardId = cardId;
  const pile = card.pile;
  applyCardText(card);
  $('card-emoji').innerHTML = emojiImgHTML(card.emoji || (pile === 'home' ? 'house' : 'city'));
  $('card-pile-label').textContent = t(`piles.${pile}.label`);
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
  frontEl.classList.add('idle-shine');
  announceCard(card);
  if (preview) preview.hidden = false;
  updatePreviewActions(cardId);
  attachTilt();
  // Skip the floating hearts and ambient ripples in preview mode: those are
  // tuned for the dramatic reveal flow, and replaying them every time the
  // user opens an already-known card from Collection or History feels heavy.
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
function bumpInactivity() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    toast(t('draw.inactivity'));
    releaseWakeLock();
    navigate('home');
  }, CONFIG.inactivityTimeoutMs);
}
const inactivityListeners = ['pointerdown', 'pointermove', 'keydown', 'touchstart'];

let unsubscribeLocale = null;

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
    currentCardId = preview;
    showCardDirectly(preview);
  } else if (pile === 'home' || pile === 'outdoor') {
    await startDraw(pile);
  } else {
    navigate('home');
    return;
  }

  bumpInactivity();
  inactivityListeners.forEach((ev) => document.addEventListener(ev, bumpInactivity, { passive: true }));
  document.addEventListener('keydown', onDrawKeydown);
  unsubscribeLocale = on('i18n:change', onLocaleChange);
}

export function unmount() {
  document.removeEventListener('keydown', onDrawKeydown);
  stopHearts();
  stopRipples();
  detachTilt();
  releaseWakeLock();
  currentCardId = null;
  previewMode = false;
  previewCardId = null;
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = 0; }
  inactivityListeners.forEach((ev) => document.removeEventListener(ev, bumpInactivity));
  if (unsubscribeLocale) { unsubscribeLocale(); unsubscribeLocale = null; }
}
