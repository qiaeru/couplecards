// SPDX-License-Identifier: MIT
// Short effects synthesized via Web Audio (OscillatorNode + GainNode ADSR).
// No audio files are shipped, so the bundle stays tiny and no license tracking
// is needed. The user toggle in Settings gates every call through guard().

import { areSoundsEnabled } from './shell.js';

let ctx = null;
let masterGain = null;

function ensureContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    ctx = null;
    return null;
  }
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.35;
  masterGain.connect(ctx.destination);
  return ctx;
}

function tone({ freq, start = 0, duration = 0.25, type = 'sine', peak = 0.6, attack = 0.008, release = 0.18, detune = 0 }) {
  if (!ctx || !masterGain) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  osc.connect(gain);
  gain.connect(masterGain);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);
  osc.start(t0);
  osc.stop(t0 + duration + release + 0.05);
}

function resumeIfNeeded() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function guard() {
  if (!areSoundsEnabled()) return false;
  if (!ensureContext()) return false;
  resumeIfNeeded();
  return true;
}

export function playDraw() {
  if (!guard()) return;
  tone({ freq: 180, duration: 0.05, type: 'triangle', peak: 0.55, attack: 0.003, release: 0.1 });
  tone({ freq: 90, duration: 0.08, type: 'sine', peak: 0.35, start: 0.005, attack: 0.005, release: 0.12 });
}

// Major-triad arpeggio on reveal; foil cards get an extra shimmer on top.
export function playReveal(isFoil = false) {
  if (!guard()) return;
  const base = isFoil ? 392 : 329.63; // G4 for foil, E4 otherwise
  const third = base * 1.25;
  const fifth = base * 1.5;
  tone({ freq: base, duration: 0.18, type: 'triangle', peak: 0.45, attack: 0.01, release: 0.22 });
  tone({ freq: third, duration: 0.18, type: 'triangle', peak: 0.40, start: 0.08, attack: 0.01, release: 0.22 });
  tone({ freq: fifth, duration: 0.22, type: 'triangle', peak: 0.38, start: 0.16, attack: 0.01, release: 0.3 });
  if (isFoil) {
    tone({ freq: fifth * 2, duration: 0.35, type: 'sine', peak: 0.18, start: 0.2, attack: 0.02, release: 0.45 });
    tone({ freq: fifth * 3, duration: 0.3, type: 'sine', peak: 0.10, start: 0.26, attack: 0.03, release: 0.5 });
  }
}

export function playBan() {
  if (!guard()) return;
  if (!ctx || !masterGain) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(340, t0);
  osc.frequency.exponentialRampToValueAtTime(110, t0 + 0.28);
  osc.connect(gain);
  gain.connect(masterGain);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
  osc.start(t0);
  osc.stop(t0 + 0.35);
}

export function playReturn() {
  if (!guard()) return;
  if (!ctx || !masterGain) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(260, t0);
  osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.2);
  osc.connect(gain);
  gain.connect(masterGain);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
  osc.start(t0);
  osc.stop(t0 + 0.28);
}

export function playRedraw() {
  if (!guard()) return;
  tone({ freq: 520, duration: 0.06, type: 'square', peak: 0.22, attack: 0.004, release: 0.1 });
}
