---
name: extract-codepen
description: Convert a CodePen prototype or UIverse.io component into the current repository's frontend architecture safely.
---

Use the Frontend CodePen Extractor workflow to convert this prototype into the current project.

**Source URL or code:** [Paste a CodePen/UIverse URL or describe the provided source files]

Requirements:
- Identify whether the source is CodePen, UIverse.io, a combined demo, or supplied files.
- For UIverse, preserve source attribution/license information where available; do not claim hidden source access.
- Inspect existing architecture and Git status first.
- Identify which source panels, preprocessors, settings, dependencies, and assets were actually accessible.
- Preserve the intended design and behavior while following current framework/styling conventions.
- Scope CSS, use accessible semantic markup, and clean up all listeners/timers/observers/animation frames.
- Do not install packages or download assets without asking.
- Implement focused changes and run available relevant checks.
- Report changed files, dependency/asset caveats, and PASS/FAIL/NOT RUN verification results.
