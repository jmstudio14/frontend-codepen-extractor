# Evaluation fixture: leaky animation card

Maintainer notes for the `web-extraction-regression` case. This file stays on the host (`host_only_files` in `fixture.json`), so the agent never sees the defect list below.

## Seeded defects

- Global `*`, `body`, and element selectors leak into the host page.
- Fixed-width layout overflows a 360px viewport.
- Button and canvas lack accessible name/description relationships.
- The global `resize` listener is never removed.
- The recursive `requestAnimationFrame` loop is never cancelled.
- The animation ignores reduced-motion preferences.
- An external CDN library is referenced without a pinned version or dependency review.
- `innerHTML` interpolates a label (static today, but the pattern is unsafe for dynamic data).

## How it is scored

- `scripts/evaluation/check-web-fixture.mjs` checks animation and listener cleanup, reduced motion, safe text, scoped CSS and accessibility attributes.
- The browser check (`browser` in `fixture.json`) checks visibility, 360px overflow and the button's accessible name. It then calls `window.orbitDemo.destroy()`, which the prompt asks the agent to expose, and verifies that no animation frame or window/document listener survives.
- `tests/fixture-solutions/leaky-animation-prototype/` is a reference solution that passes every check.

Run it with `node scripts/evaluation/manual-eval.mjs prepare web-extraction-regression` (see `docs/measurement-protocol.md`).
