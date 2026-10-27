# Evaluation fixture: leaky animation card

This is an intentionally flawed prototype for manual agent evaluation. Do not ship it unchanged.

## Defects the agent should identify

- Global `*`, `body`, and element selectors leak into the host page.
- Fixed-width layout is likely to overflow narrow viewports.
- Button and canvas lack accessible name/description relationships.
- Global window listener is never removed.
- Recursive `requestAnimationFrame` loop is never cancelled.
- Animation does not respect reduced-motion preferences.
- External CDN library is referenced without a pinned version or dependency review.
- `innerHTML` is used to interpolate a label (the fixture currently uses a static value, but refactoring should not preserve this unsafe pattern for dynamic data).

## Evaluation task

Ask Claude Code to convert this fixture into the target project's existing framework. Evaluate it with the checklist in `.claude/skills/frontend-codepen-extractor/references/quality-checklist.md`. The expected output depends on the target project; this fixture intentionally has no single generated component implementation.
