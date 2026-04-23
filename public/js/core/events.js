// SPDX-License-Identifier: MIT
// Tiny event bus used for cross-module coordination (auth changes, i18n,
// sync flushes). Keep the namespace flat; handler count is small by design.

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`event handler for ${event} failed`, err);
    }
  });
}
