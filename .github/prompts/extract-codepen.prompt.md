---
name: extract-codepen
description: Convert a CodePen prototype into the current repository's frontend architecture safely.
---

Use the Frontend CodePen Extractor workflow to convert this prototype into the current project.

**Prototype URL or source:** [Paste a CodePen URL or describe the provided source files]

Requirements:
- Inspect existing architecture and Git status first.
- Identify which source panels, preprocessors, settings, dependencies, and assets were actually accessible.
- Preserve the intended design and behavior while following current framework/styling conventions.
- Scope CSS, use accessible semantic markup, and clean up all listeners/timers/observers/animation frames.
- Do not install packages or download assets without asking.
- Implement focused changes and run available relevant checks.
- Report changed files, dependency/asset caveats, and PASS/FAIL/NOT RUN verification results.
