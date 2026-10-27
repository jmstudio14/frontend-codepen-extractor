# Changelog

## Unreleased

- The repository is public: updated README, INSTALL, the plugin README and the marketplace description, which still described it as private and required Git credentials to install.
- Added a **Test report** issue form (`.github/ISSUE_TEMPLATE/test-report.yml`) and `docs/testing-guide.md`, so anyone testing the agent can report results in a comparable format: scenario, result, failures, false claims, cost, environment and evidence, plus a required confirmation that secrets were removed.
- Removed every evaluation path that needs a paid API key, by owner decision:
  - the Claude Agent SDK adapter;
  - the live planner evaluator;
  - the DeepEval judge, which needed `OPENAI_API_KEY`;
  - the repeat/baseline tooling for paid runs;
  - the `live-agent-evaluation` and `runtime-selection-pending` CI jobs.
- Removed the runtime compatibility assessment and the SDK import smoke tests, whose only purpose was choosing an SDK for paid evaluation. CI now runs a single `validate` job, and none of it needs an API key.
- Added `scripts/evaluation/manual-eval.mjs` (`npm run evaluate:manual`). `prepare` creates a fixture workspace and prints the exact prompt to run in Claude Code with a normal subscription. `score` runs the syntax, fixture, browser, whitespace and edited-files checks and writes `report.json`. Tests cover a FAIL on each untouched fixture and a PASS on each reference solution.
- Removed the `agent-model-evaluator` agent, its doc and its cases. It compared runtimes and models for paid evaluation. It is also gone from the coordinator's delegates and the build queue.
- Agent docs, case files and the build loop now say that live evaluation is a manual Claude Code run with no API key, instead of waiting for configured credentials.
- Rewrote `docs/agent-evaluation.md` and `docs/measurement-protocol.md` for the manual mode. A smoke test now fails if any file references a paid API key again.
- Added three executable evaluation fixtures (`dynamic-js-widget`, `broken-html-card`, `external-deps-gallery`) with objective assertion scripts, `fixture.json` manifests and three matching suite cases. Reference solutions in `tests/fixture-solutions/` prove that every assertion can be met.
- The Claude Agent SDK adapter now selects the fixture, allowed files, assertions and prompt from the manifest instead of hard-coding one fixture. Manifests and assertion scripts are not copied into the agent workspace.
- Added `scripts/evaluation/browser-check.mjs`, an optional Playwright check with the network blocked. It covers page errors, visibility, overflow at 360px, accessible names, interactions, literal text and teardown of timers and listeners, and saves screenshots. Without Playwright it records NOT RUN.
- Host-check failures now fail the evaluation case. Previously a failing fixture assertion still let the case pass.
- `run-repeated.mjs --case` accepts a comma-separated list.
- Added `docs/measurement-protocol.md` for the first measured live evaluation.
- Added `package-lock.json`, which pins the `yaml` devDependency with its integrity hash. CI now installs with `npm ci --ignore-scripts`, and `npm ci --ignore-scripts` is the first local validation step.
- The architect-plan YAML test now fails with an actionable message when `yaml` is not installed, instead of a module-resolution stack trace.
- Ignored `node_modules/`.

## 2.13.0

- Bundled eight specialist agents in the Claude Code plugin: `frontend-architect-planner`, `frontend-qa-test-engineer`, `frontend-security-reviewer`, `frontend-extractor-validation-agent`, `frontend-performance-optimizer`, `frontend-documentation-maintainer`, `frontend-code-auditor`, and `agent-ecosystem-coordinator`. Plugin users get them without cloning the repository.
- `scripts/sync-plugin-agents.mjs` generates the plugin copies from `.claude/agents`. Specialists are copied verbatim. The plugin coordinator uses plugin-scoped delegate names (`frontend-codepen-extractor:<name>`), lists only bundled delegates, and is invoked with `claude --agent frontend-codepen-extractor:agent-ecosystem-coordinator`. The plugin validator rejects copies that drift.
- The coordinator's delivery gate now runs the target project's own validation and security checks, which are `npm run validate:all` and `npm run security` in this repository, and records NOT RUN when none exist.
- The security gate now also checks plugin agents: write tools, and delegates that are missing or writable.
- Turned `agent-ecosystem-coordinator` into a working coordinator: it runs as the main-thread agent, can launch only an explicit allowlist of the read-only specialists (never the implementation agent), routes by changed paths, bounds retries to run failures, and delivers only on independent security, QA and audit PASS verdicts plus its own `validate:all` and `security` runs.
- The security gate now rejects delegation to missing or writable agents and `Agent` without an explicit list.
- Added `scripts/security-gate.mjs` (`npm run security`), a deterministic CI gate that fails on committed secrets, `eval`/`new Function` in scripts, unapproved `shell: true`, workflow write permissions, and write tools on any subagent other than `frontend-codepen-extractor`. It enforces blocking without relying on an LLM verdict.
- Replaced generic `description` fields on seven specialist agents with role-specific text so Claude Code can route tasks to them.
- Fixed the smoke-test summary, which was printed before the final tests ran and under-reported the total.
- Added a separate read-only Claude Code auditor subagent with evidence-based PASS / FAIL / BLOCKED verdicts, severity-ranked findings, and a bounded correction/re-audit protocol.
- Documented that the profile is not an automated CI gate until a live evaluation workspace is exported and the auditor is explicitly invoked.
- Added structural validation and regression tests for the auditor's read-only tool contract.


## 2.12.0

- Added isolated, credential-free import smoke tests for four candidate SDK runtimes, recording exact npm versions and import outcomes without invoking a model.
- Disabled package lifecycle scripts during runtime probes and kept the selected runtime unset until a dedicated-fixture live evaluation is reviewed.
- Added dry-run coverage for the smoke-test report and uploaded runtime compatibility artifacts from GitHub Actions.


## 2.11.0

- Added a documented, weighted compatibility assessment for Claude Agent SDK, OpenAI Agents SDK, Google ADK JS, and LangGraph.js before runtime selection.
- Added a credential-free environment probe that checks runtime/package availability without installing SDKs, reading credential values, or invoking a model.
- Added GitHub Actions artifacts for compatibility reports and gated live evaluation behind an explicit runtime-selection repository variable.
- Kept the runtime unselected until an exact-version smoke test and dedicated-fixture live run have been reviewed.


## 2.10.0

- Connected the evaluation harness to an opt-in Claude Agent SDK adapter for the dedicated web-extraction fixture, capturing actual SDK tool events and command results in an isolated temporary Git repository.
- Added objective fixture assertions, repeated-run summaries, token/cost accounting when the provider returns usage, JSONL history, approved-baseline regression checks, and an optional DeepEval semantic-judge bridge.
- Added manual and weekly GitHub Actions live-evaluation flow with explicit NOT RUN reports when credentials are missing; deterministic CI remains separate from live model evaluation.
- Documented the initial scope honestly: only the web-extraction scenario has a built-in workspace fixture; other scenarios require dedicated fixtures before live scoring.


## 2.9.0

- Added an adapter-driven runtime evaluation harness that executes one real host-adapter run per scenario and writes a JSON report.
- Records stack/version detection, source provenance and required external fallback, repository change scope, actual project check statuses, honesty assertions, wall-clock time, and tool-call counts.
- Rejects unsupported PASS claims, missing evidence fields, skipped required external search, unchecked Git status, unexpected file changes, and incomplete reports.
- Added a documented adapter contract, deterministic fixture adapter for harness testing, and a CI fixture run; explicitly distinguishes harness tests from live LLM evaluations.
- Updated package documentation and bumped metadata to 2.9.0.


## 2.8.0

- Added a shared architecture contract inspired by LangChain's separation of stable core abstractions, orchestration, and replaceable integrations—documented as a logical design, not a claim that an autonomous runtime already exists.
- Defined consistent task routing, evidence/provenance records, cross-cutting safety checkpoints, verification reporting, and extension guidelines.
- Added structured regression evaluation scenarios spanning multilanguage work, monorepos, mandatory external fallback, partial source, verification honesty, dependencies, prompt injection, and web-component extraction.
- Wired the architecture guide into all three skill distributions and agent profiles.
- Strengthened validators to require architecture guidance, scenario coverage, and distribution parity; upgraded the regression test to validate scenario structure.
- Bumped package/plugin metadata to 2.8.0 and updated the display name to reflect the broader scope.


## 2.7.0

- Expanded the agent from frontend-focused reconstruction to repository-aware multilanguage and multiframework engineering while retaining all CodePen, UIverse, CodeMyUI, CSS-Tricks, GitHub, and mandatory external-fallback workflows.
- Added a shared multilanguage engineering guide covering stack/version detection, monorepo boundaries, authoritative technical research, language-native implementation, stack-specific verification, and safety boundaries.
- Updated portable skill, Claude Code standalone/plugin skill, Claude Code agent, and GitHub Copilot agent to route general programming tasks through the new guide instead of forcing frontend assumptions.
- Strengthened validators to require the new guide and check its content and distribution parity.
- Bumped package and plugin metadata to 2.7.0.


## 2.6.2

- Made external fallback a mandatory step whenever predefined sources do not provide a convincing match, usable original source, or sufficiently complete implementation.
- Clarified that the agent must not stop after searching CodePen, UIverse, CodeMyUI, and CSS-Tricks, and must not ask the user whether to perform this normal external search.
- Strengthened automated validators to check mandatory fallback wording in the progressive-search guide and portable/plugin distribution.

## 2.6.1

- Added a dedicated CodeMyUI ingestion guide to the portable Agent Skill, Claude Code skill, and packaged plugin skill.
- Documented exact-title discovery, verification of canonical pages and source links, source availability classification, code/assets/dependency inventory, reconstruction boundaries, licensing, attribution, security review, and validation/reporting.
- Wired CodeMyUI-specific instructions into all three skill copies and strengthened validation to require the guide, check its key requirements, and verify distribution parity.
- Bumped package and plugin metadata to 2.6.1.


## 2.6.0

- Added a progressive search workflow: search exact names in predefined sources first, then expand to external web sources and GitHub when evidence is weak or source is unavailable.
- Added candidate evaluation across identity, visual/behavior match, source quality, project fit, provenance, and licensing, with explicit observed/inferred/unknown evidence labels.
- Added stopping criteria and guidance to distinguish original source extraction, adaptation, and reconstruction from previews.
- Mirrored the new guide across portable Agent Skills and both Claude Code skill distributions; updated Claude Code and GitHub Copilot agent profiles, package metadata, plugin metadata, and documentation.


## 2.5.0

- Added CSS-Tricks as a technical encyclopedia/reference workflow for CSS and frontend concepts, implementation patterns, and debugging.
- Added guidance for research, browser-support cross-checks, original implementation, source linking, and copyright-safe summaries.
- Synced portable, Claude standalone/plugin, and Copilot agent instructions; documented the reference workflow.


## 2.4.0

- Added UIverse.io component ingestion and conversion support alongside CodePen.
- Added source identification, framework/style variant analysis, component extraction, integration, attribution/license, asset, accessibility, and visual validation guidance.
- Added combined UIverse + CodePen workflow guidance.
- Synced portable, Claude standalone/plugin, and GitHub Copilot agent profiles; documented UIverse support in README.

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
