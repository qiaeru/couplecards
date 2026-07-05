// SPDX-License-Identifier: MIT
// Centralized timing / animation config. Tweak here to adjust feel globally.

export const CONFIG = {
  draw: {
    enterDuration: 700,
    chargeDuration: 1900,
    climaxDuration: 500,
    flipDuration: 700,
    revealDelay: 900,
    reducedMotionShort: 150,
  },
  recentExclude: { home: 3, outdoor: 5 },
  tilt: { maxDegrees: 14, orientationClampDeg: 22 },
  swipe: { minDistance: 90, maxDuration: 700, horizontalRatio: 1.5, exitDuration: 360 },
  pileLaunchDuration: 380,
  vibrations: {
    pileTap: 20,
    reveal: [30, 40, 60],
    returnAction: 25,
    banAction: [20, 40, 20],
    redrawAction: 15,
    swipeThreshold: 8,
  },
  inactivityTimeoutMs: 30 * 60 * 1000,
};
