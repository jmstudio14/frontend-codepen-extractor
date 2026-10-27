# Changelog

## 2.3.0

- Expanded the agent into extract, reconstruct, integrate, refactor, explain, audit, and repair modes.
- Added framework-aware standalone project generation guidance and expanded framework coverage.
- Added dependency/asset recovery inventories, preprocessor conversion, and approval guardrails.
- Added behavior-preserving refactoring, TypeScript adaptation, and project-native testing.
- Added evidence-based repair loop, visual QA, accessibility/security/resilience audits, and PASS/FAIL/NOT RUN reporting.
- Synced portable skill and Claude Code agent instructions across distributions.

## 2.2.0

- Added a portable Agent Skills copy under `.agents/skills/` for Codex, GitHub Copilot, Cursor, Gemini CLI, Windsurf, and other compatible coding agents.
- Added a GitHub Copilot custom agent profile, repository instructions, and reusable prompt template.
- Added a cross-agent installation guide using the `skills` CLI and per-host installation notes.
- Expanded automated validation to cover portable skill copies, Copilot adapter files, and multi-agent metadata.

## 2.1.0

- Packaged the existing extractor as a native Claude Code plugin with `.claude-plugin/plugin.json`.
- Added a GitHub-hosted private marketplace at `.claude-plugin/marketplace.json`.
- Added the plugin-native `agents/` and `skills/` structure while preserving the standalone `.claude/` setup.
- Documented installation from a Claude Code session and the shell CLI, including private-repository authentication.
- Added plugin packaging validation to the repository checks.

## 2.0.0

- Explicitly preload the matching skill in the agent frontmatter.
- Added source-ingestion guidance for inaccessible CodePen panels and honest handling of unknowns.
- Added framework-specific conversion patterns for React, Vue 3, Svelte, and vanilla TypeScript/JavaScript.
- Added a dependency/resource policy and an evidence-based quality checklist.
- Added a deliberately flawed animation fixture for manual evaluation.
- Added dependency-free validation/smoke-test scripts and a Windows PowerShell wrapper.
- Added GitHub Actions validation on push and pull request.
- Strengthened Git hygiene, untrusted-input handling, cleanup requirements, and final reporting.
