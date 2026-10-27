---
name: extract-codepen
description: Extract, reconstruct or adapt a CodePen, UIverse.io or CodeMyUI component into the current repository safely.
---

Use the `frontend-codepen-extractor` custom agent and follow `.agents/skills/frontend-codepen-extractor/SKILL.md` to bring this component into the current project.

**Component name, URL or code:** [Paste a CodePen/UIverse/CodeMyUI URL, name the component, or describe the provided source files]

Requirements:
- Inspect Git status and the existing architecture first: package manager, framework and version, styling system, tests and scripts.
- For a named component, follow `references/progressive-search.md`: search the predefined sources (CodePen, UIverse.io, CodeMyUI) first, then automatically continue with external web and GitHub search if no convincing match is found. Record the evidence for the chosen candidate.
- Identify which source panels, preprocessors, settings, dependencies and assets were actually accessible. For CodeMyUI, verify the original demo or repository; a preview alone means reconstruction.
- Preserve source attribution and license information; do not claim hidden source access or authorship.
- Preserve the intended design and behavior while following the project's framework and styling conventions.
- Scope CSS, use accessible semantic markup, and clean up all listeners, timers, observers and animation frames.
- Do not install packages or download assets without asking.
- Implement focused changes and run the relevant project checks.
- Report changed files, dependency and asset caveats, whether the code was extracted, adapted or reconstructed, and PASS/FAIL/NOT RUN verification results.
