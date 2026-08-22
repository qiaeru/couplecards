# Accessibility

Audience: maintainers and contributors. This page summarizes what the app implements today and how to keep it that way.

## Goals

- Meet WCAG 2.1 AA contrast ratios for text and interactive elements.
- Guarantee full keyboard operability. No screen in the app relies on a mouse-only interaction path.
- Respect `prefers-reduced-motion` by disabling the 3D tilt, the gold-dust and ember particles, the card levitation, the screen transitions, and every other decorative animation.
- The app ships a single dark theme by design; there is no light variant, and `prefers-color-scheme` is intentionally not consulted. The global `color-scheme: dark` declaration keeps native form controls and scrollbars consistent with it.
- Announce important state changes to screen readers through `aria-live` regions.

## Implementation notes

### Global

The `<html lang>` attribute is updated whenever the i18n locale changes, and the new locale's native name is pushed to a shared `#screen-announce` live region so screen-reader users hear feedback after picking a language. The Collection search pushes its result count to the same region, since the grid rebuild is otherwise silent. Every interactive control is focusable and exposes a visible ring through `:focus-visible`. The first tab stop on both the SPA shell and the admin page is a "Skip to main content" link: on the SPA it moves focus to `<main id="main-content" tabindex="-1">` (and focus is moved to that same element after every route change so the new view is announced to screen readers), on admin it jumps past the tablist to the default users panel. Toasts, card announcements and the empty-pile notice on Home live in `role="status"` regions. `prefers-reduced-motion` disables decorative animations including the parallax card tilt, and `prefers-reduced-transparency` removes backdrop blurs.

### Forms

Every `<input>` has an explicit `<label>`. Error messages render inside a `role="alert"` region with `aria-live`; on the sign-in and change-password forms, each input points at that region via `aria-describedby` and carries `aria-invalid="true"` while the form holds an error. Required fields use the standard `required` attribute. The password strength meter is purely informational: the form never blocks submission based on a visual score alone, because the server is the authority on password validity. The meter's current tier is exposed as an `aria-live="polite"` region that only mutates when the tier actually changes, so screen readers hear each transition between Weak, Fair, Good, and Strong without spamming every keystroke.

### Draw screen

The card title and description are announced through `#card-announce`, and both elements are tagged with a `lang` attribute reflecting the translation that was actually used, so screen readers switch voice when a card falls back to English under a non-English UI. Every swipe gesture has a visible button equivalent (Ban, Return, and Redraw) that is keyboard-friendly. Arrow keys act as shortcuts while the card is revealed: left arrow bans it, right arrow returns it to the pile. The shortcuts are ignored in preview mode, while the reveal animation is playing, and whenever focus sits inside a text input. Screen readers are informed through `aria-keyshortcuts` on the matching buttons, and the shortcuts honor `prefers-reduced-motion` by skipping the swipe-out animation. `Escape` closes the read-only preview opened from the history screen.

### Modals

Every modal uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the visible title. Focus is trapped inside the modal's focusables, so `Tab` cycles across every button, input, select, and checkbox in the body in addition to the cancel and confirm buttons. `Escape` and a click on the backdrop close the modal, and focus is returned to the element that opened it once it closes. On the shared confirmation dialog, `Enter` also confirms when focus is not on the Cancel button.

### Navigation

The bottom navigation is a `<nav>` element with a translated `aria-label` in every supported locale, wrapping an `<ul>` / `<li>` structure so assistive technology announces it as "Main navigation, list of N items". `aria-current="page"` is set on the link of the currently mounted route, updated by the SPA router on every navigation.

The admin page exposes a `role="tablist"` that follows the WAI-ARIA APG tabs pattern: the active tab carries `tabindex="0"` and the others `tabindex="-1"`, so `Tab` moves from the tablist straight into the visible panel rather than cycling across the three headers. `ArrowLeft` / `ArrowRight` wrap around the tablist, `Home` jumps to the first tab and `End` to the last, and every move also focuses the newly selected tab.

## Manual verification

No automated accessibility tooling ships with the repo; contributor tooling is kept minimal by design. When editing accessibility-critical code, run Axe DevTools inside the browser and confirm zero violations on each screen:

- `/` (home)
- `/#/draw?pile=home`
- `/#/history`
- `/#/collection`
- `/#/settings`
- `/#/rules`
- `/login.html` (both the login and forced-change stages)
- `/admin.html` (each tab)

## Reporting issues

Accessibility regressions are treated as bugs. When filing one, please include the affected screen, the browser, and the assistive technology in use, if any.
