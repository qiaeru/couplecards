// SPDX-License-Identifier: MIT
// Draw screen card tilt: pointer hover and drag, gyroscope, and the swipe
// gesture that bans or returns the card. The draw screen decides what a swipe
// does; this module only reports its direction.

import { CONFIG } from '../../config.js';
import { vibrate } from '../../ui/shell.js';

const $ = (id) => document.getElementById(id);

// Cached once at module load and refreshed via the MQL change event. Avoids
// hundreds of matchMedia() calls per second when the tilt rAF loop and the
// dust spawner ticks each ask whether reduced motion is on.
const reducedMotionMQL = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionMQL.matches;
reducedMotionMQL.addEventListener('change', (e) => {
  reducedMotion = e.matches;
});
export function prefersReducedMotion() {
  return reducedMotion;
}

// iOS 13+ gyroscope permission.
let orientationPermission = null;
function orientationNeedsPermission() {
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  );
}
export async function requestOrientationIfNeeded() {
  if (orientationPermission !== null) return;
  if (!('DeviceOrientationEvent' in window)) {
    orientationPermission = 'unsupported';
    return;
  }
  if (!orientationNeedsPermission()) {
    orientationPermission = 'granted';
    return;
  }
  try {
    const r = await DeviceOrientationEvent.requestPermission();
    orientationPermission = r === 'granted' ? 'granted' : 'denied';
  } catch {
    orientationPermission = 'denied';
  }
}

let tiltActive = false;
let tiltPointerDown = null;
let tiltPointerMove = null;
let tiltPointerUp = null;
let tiltPointerLeave = null;
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
  // holo-on also fades the idle shine out through CSS; removing the class
  // here instead would cut the streak mid-sweep with no transition.
  front.classList.add('holo-on');
}

function smoothReturnToCenter() {
  const tilt = $('card-tilt');
  if (!tilt) return;
  const banLabel = tilt.querySelector('.swipe-label-ban');
  const returnLabel = tilt.querySelector('.swipe-label-return');
  if (returnRaf) cancelAnimationFrame(returnRaf);
  returnRaf = 0;
  const parse = (name) => parseFloat(tilt.style.getPropertyValue(name) || '0');
  const rx0 = parse('--rx');
  const ry0 = parse('--ry');
  const tx0 = parse('--tx');
  const tz0 = parse('--tz');
  const ban0 = banLabel ? parseFloat(banLabel.style.opacity || '0') : 0;
  const ret0 = returnLabel ? parseFloat(returnLabel.style.opacity || '0') : 0;
  if (
    Math.abs(rx0) < 0.1 &&
    Math.abs(ry0) < 0.1 &&
    Math.abs(tx0) < 0.5 &&
    Math.abs(tz0) < 0.1 &&
    ban0 < 0.01 &&
    ret0 < 0.01
  ) {
    tilt.style.setProperty('--rx', '0deg');
    tilt.style.setProperty('--ry', '0deg');
    tilt.style.setProperty('--tx', '0px');
    tilt.style.setProperty('--tz', '0deg');
    if (banLabel) banLabel.style.opacity = 0;
    if (returnLabel) returnLabel.style.opacity = 0;
    isReturning = false;
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
    else {
      returnRaf = 0;
      isReturning = false;
    }
  };
  returnRaf = requestAnimationFrame(step);
}

function resetTilt() {
  const front = document.querySelector('#card-flip .card-front');
  if (front) {
    front.classList.remove('holo-on');
    front.classList.add('idle-shine');
  }
  smoothReturnToCenter();
}

// `isPreview()` is read at the start of each drag: in preview the card only
// tilts. `onSwipe(direction)` gets 1 for a swipe right, -1 for a swipe left.
export function attachTilt({ isPreview, onSwipe }) {
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
  let pendingX = 0,
    pendingY = 0;
  let pointerDown = false;
  let mode = 'idle';
  let startX = 0,
    startY = 0,
    startTime = 0;
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
    try {
      tilt.setPointerCapture(e.pointerId);
    } catch {}
  };

  tiltPointerMove = (e) => {
    const isMouse = e.pointerType === 'mouse';
    if (isMouse && !pointerDown) {
      // Desktop hover: the cursor is back over the card, so cancel any
      // in-flight smooth-return and let the pointer drive the tilt again.
      // Otherwise a return started on pointerleave keeps the isReturning
      // guard raised and the follow effect stays frozen.
      if (isReturning) {
        if (returnRaf) {
          cancelAnimationFrame(returnRaf);
          returnRaf = 0;
        }
        isReturning = false;
      }
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateTiltFromPointer();
      });
      return;
    }
    if (isReturning) return;
    if (!pointerDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const ax = Math.abs(dx),
      ay = Math.abs(dy);
    if (mode === 'idle') {
      if (ax < DRAG_THRESHOLD && ay < DRAG_THRESHOLD) return;
      if (isPreview()) mode = 'tilt';
      else if (!isMouse || ax > ay * 1.2) {
        mode = 'swipe';
        tilt.classList.add('dragging');
      } else mode = 'tilt';
    }
    if (mode === 'swipe') {
      const nowT = performance.now();
      velocitySamples.push({ x: e.clientX, t: nowT });
      velocitySamples = velocitySamples.filter((s) => nowT - s.t < 120);
      pendingX = dx;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applySwipe(pendingX);
      });
    } else if (mode === 'tilt') {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateTiltFromPointer();
      });
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
      const isFlick =
        Math.abs(velocity) > VELOCITY_THRESHOLD && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy);
      const isDistanceSwipe =
        Math.abs(dx) > CONFIG.swipe.minDistance &&
        Math.abs(dx) > Math.abs(dy) * CONFIG.swipe.horizontalRatio &&
        dt < CONFIG.swipe.maxDuration;
      if (isFlick || isDistanceSwipe) {
        onSwipe(isFlick ? (velocity > 0 ? 1 : -1) : dx > 0 ? 1 : -1);
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
  tiltPointerLeave = (e) => {
    if (e.pointerType === 'mouse' && !pointerDown && !orientationAttached) resetTilt();
  };
  tilt.addEventListener('pointerleave', tiltPointerLeave);

  if (orientationPermission === 'granted') attachOrientation();
}

function attachOrientation() {
  if (orientationAttached) return;
  if (prefersReducedMotion()) return;
  orientationAttached = true;
  let baseBeta = null,
    baseGamma = null;
  const CLAMP = CONFIG.tilt.orientationClampDeg;
  const MAX = CONFIG.tilt.maxDegrees;
  let raf = 0;
  let pending = null;
  const apply = () => {
    raf = 0;
    if (isReturning || !pending) return;
    const { beta, gamma } = pending;
    if (beta === null || gamma === null) return;
    if (baseBeta === null) {
      baseBeta = beta;
      baseGamma = gamma;
      return;
    }
    const dBeta = Math.max(-CLAMP, Math.min(CLAMP, beta - baseBeta));
    const dGamma = Math.max(-CLAMP, Math.min(CLAMP, gamma - baseGamma));
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

export function detachTilt() {
  if (!tiltActive) return;
  const tilt = $('card-tilt');
  if (tilt && tiltPointerMove) {
    tilt.removeEventListener('pointermove', tiltPointerMove);
    tilt.removeEventListener('pointerdown', tiltPointerDown);
    tilt.removeEventListener('pointerup', tiltPointerUp);
    tilt.removeEventListener('pointercancel', tiltPointerUp);
    tilt.removeEventListener('pointerleave', tiltPointerLeave);
  }
  tiltPointerMove = tiltPointerDown = tiltPointerUp = tiltPointerLeave = null;
  tiltActive = false;
  // Kill a return-to-center animation still in flight: a stale rAF would
  // write to detached nodes, and if the tab was hidden mid-return the paused
  // animation would keep isReturning stuck and block tilt on the next mount.
  if (returnRaf) {
    cancelAnimationFrame(returnRaf);
    returnRaf = 0;
  }
  isReturning = false;
  if (orientationAttached && orientationHandler) {
    window.removeEventListener('deviceorientation', orientationHandler);
    orientationAttached = false;
    orientationHandler = null;
  }
}
