# Reconstruction and quality playbook

Use this guide for CodePen recovery, standalone project generation, integration, refactoring, and validation. It describes the host coding agent workflow; it does not guarantee browser/network/API availability.

## 1. Choose output mode
Extract only, reconstruct standalone, integrate, refactor, explain, audit, or repair. Confirm explicit stack/output constraints. If absent, infer only from reliable source/repository evidence; otherwise ask before scaffolding.

## 2. Extraction manifest
Record source URL/export/files and retrieval method; markup/style/script dialect and preprocessors; dependencies/globals; assets/fonts/URLs and license status; behavior map and breakpoints; known/unknown source gaps. Preserve original source before transformation. Do not commit sensitive work notes unless requested.

## 3. Framework and project generation
Detect actual framework/version from manifests, lockfiles, config, and adjacent files. Use framework-patterns for React, Vue, Svelte, vanilla TS/JS, Angular, Solid, Lit, styling systems, animation/canvas lifecycle.
For standalone projects:
- Prefer smallest stack supported by source and user preference.
- Keep scripts, entry points, and config minimal and coherent.
- Use TypeScript only when requested or appropriate; do not fabricate type certainty.
- Provide clear source/assets/tests structure and README setup/run/build instructions.
- Do not install dependencies or edit lockfiles without approval; never mix package managers.

## 4. Conversion and refactoring
Separate view/state/styles/data where helpful. Convert preprocessors fully. Replace CodePen globals with explicit imports/config where feasible. Preserve selectors only when behavior requires them. Use safe DOM APIs; avoid dynamic execution/unsafe injection. Refactor carefully and disclose behavior that cannot be reproduced.

## 5. Tests
Use existing tooling first. Add meaningful tests for rendering/core interactions, validation/form states, keyboard behavior, loading/error/empty states, lifecycle cleanup, and responsive behavior where supported. Avoid snapshot-only coverage and do not add test frameworks without approval.

## 6. Repair loop
Capture exact error and context; distinguish introduced from pre-existing; make focused fix; rerun failed check. Stop when access, approval, or architecture decision is required. Never hide flaky failures or mark skipped checks passed.

## 7. Visual QA
If browser/screenshot tools exist, capture source and target at comparable viewport/device scale/state; inspect hierarchy, spacing, typography, color, sizing, imagery, overflow, interactions, and reduced motion. Test narrow and wide layouts. Screenshot-only input is visual intent, not source truth. If tooling is absent, mark NOT RUN and do not claim pixel-perfect fidelity.

## 8. Accessibility, security, resilience
Check semantics, labels, names, keyboard, focus, ARIA, alt text, reduced motion; unsafe HTML/dynamic execution, secrets, dependency risks, URL schemes, external resources; loading/error/empty/unavailable states, network failures, async cancellation, cleanup, repeated mounts, and SSR safety. Automated checks have limits.

## 9. Evidence ledger
Mark each applicable criterion:
- **PASS** — exact command, output, test, or browser evidence
- **FAIL** — reproducible issue and diagnostic
- **NOT RUN** — unavailable tool/source, approval needed, or out of scope

Never turn NOT RUN into PASS. Include final diff review.
