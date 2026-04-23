// SPDX-License-Identifier: MIT
// Centralized timing / animation config. Tweak here to adjust feel globally.

export const CONFIG = {
  draw: {
    enterDuration: 600,
    pulsingDuration: 1400,
    climaxDuration: 450,
    flipDuration: 750,
    revealDelay: 900,
    reducedMotionShort: 150,
  },
  recentExclude: { home: 3, outdoor: 5 },
  tilt: { maxDegrees: 14, orientationClampDeg: 22 },
  swipe: { minDistance: 90, maxDuration: 700, horizontalRatio: 1.5, exitDuration: 360 },
  hearts: { interval: 1100, doubleBeatChance: 0.3, lifetime: 3200 },
  ripples: { normalInterval: 460, boostInterval: 180 },
  pileLaunchDuration: 380,
  vibrations: {
    pileTap: 20,
    reveal: [30, 40, 60],
    returnAction: 25,
    banAction: [20, 40, 20],
    redrawAction: 15,
  },
  inactivityTimeoutMs: 10 * 60 * 1000,
};
