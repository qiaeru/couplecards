// SPDX-License-Identifier: MIT
// Floating "back to top" button. Appears once the page is scrolled past
// a threshold; scrolls the window to the top when clicked.

const THRESHOLD = 320;

export function initScrollToTop(buttonId = 'scroll-to-top') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  const update = () => {
    btn.classList.toggle('visible', window.scrollY > THRESHOLD);
  };

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', update, { passive: true });
  update();
}
