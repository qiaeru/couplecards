# Accessibility

Audience: maintainers and contributors. This page summarises what the app implements today and how to keep it that way.

## Goals

- Meet WCAG 2.1 AA contrast ratios for text and interactive elements.
- Guarantee full keyboard operability. No screen in the app relies on a mouse-only interaction path.
- Respect `prefers-reduced-motion` by disabling the 3D tilt, sparkle animations and ripple effects.
- Respect `prefers-color-scheme`. The dark theme is the default and no screen forces a specific colour scheme.
- Announce important state changes to screen readers through `aria-live` regions.

## Implementation notes

### Global

The `<html lang>` attribute is updated whenever the i18n locale changes. Every interactive control is focusable and exposes a visible ring through `:focus-visible`. A skip link sits at the top of the SPA shell. Toasts and card announcements live in `role="status"` regions. `prefers-reduced-motion` disables decorative animations, and `prefers-reduced-transparency` removes backdrop blurs.

### Forms

Every `<input>` has an explicit `<label>`. Error messages render inside a `role="alert"` region with `aria-live`. Required fields use the standard `required` attribute. The password strength meter is purely informational: the form never blocks submission based on a visual score alone, because the server is the authority on password validity.

### Draw screen

The card title and description are announced through `#card-announce`. Every swipe gesture has a visible button equivalent (Ban, Return and Redraw) that is keyboard-friendly. Arrow keys act as shortcuts while the card is revealed: left arrow bans it, right arrow returns it to the pile. The shortcuts are ignored in preview mode, while the reveal animation is playing, and whenever focus sits inside a text input. Screen readers are informed through `aria-keyshortcuts` on the matching buttons, and the shortcuts honour `prefers-reduced-motion` by skipping the swipe-out animation. `Escape` closes the read-only preview opened from the history screen.

### Modals

Every modal uses `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing to the visible title. Focus is trapped inside the modal and `Tab` cycles between the cancel and confirm buttons. `Escape` closes the modal, `Enter` confirms (except when focus is on the Cancel button), and focus is returned to the element that opened the modal once it closes.

### Navigation

The bottom navigation is a `<nav>` element with a translated `aria-label` in English and French, wrapping an `<ul>` / `<li>` structure so assistive technology announces it as "Main navigation, list of N items". `aria-current="page"` is set on the link of the currently mounted route, updated by the SPA router on every navigation.

## Manual verification

No automated accessibility tooling ships with the repo; contributor tooling is kept minimal by design. When editing accessibility-critical code, run Axe DevTools inside the browser and confirm zero violations on each screen:

- `/` (home)
- `/#/draw?pile=home`
- `/#/history`
- `/#/bans`
- `/#/settings`
- `/#/rules`
- `/login.html` (both the login and forced-change stages)
- `/admin.html` (each tab)

## Reporting issues

Accessibility regressions are treated as bugs. When filing one, please include the affected screen, the browser, and the assistive technology in use, if any.
