# Changelog

## 2.15.0

Fixes from a full review of the repository: three independent read-only reviews of the scripts and tests, of agent and skill consistency, and of the documentation.

### Fixed
- **Windows.**
  - Validation no longer fails on Windows checkouts with `core.autocrlf=true`. `.gitattributes` keeps LF everywhere, and the plugin sync and the validators compare text after normalising line endings, so older CRLF clones pass too.
  - `validate-agent.ps1` now reaches its exit codes; `Write-Error` under `Stop` used to end it early. It runs the same four validators as `npm run validate:all`, and `-Quiet` no longer turns stderr into errors in Windows PowerShell 5.1.
  - The Windows path guard in the smoke tests now matches real paths such as `C:\Users\...`.
  - Manual scoring treats a CRLF line ending as a line ending, not trailing whitespace, so Windows edits are not failed for it; real trailing spaces still fail.
- **Manual measurement integrity.**
  - `manual-eval prepare` creates the workspace in a new private folder (`mkdtemp`) in the system temporary folder and refuses one inside the clone. Inside the clone, Claude Code loaded this repository's `CLAUDE.md` and the reference solutions were a few folders away. It warns when a `CLAUDE.md` sits in any folder above the workspace.
  - Scoring compares against the prepared commit, so changes the agent commits are still scored and checked for unexpected files.
  - The guard against a workspace inside the clone also resolves symlinked ancestors that point into the clone, and it treats folder names that start with `..` correctly.
  - The initial commit ignores global signing and hooks. If `prepare` fails, it removes only what that run created. An existing `--dir` and its files are never deleted.
  - `score` requires a valid `base_commit` in `meta.json`, so workspaces prepared by older versions must be prepared again. It also fails the case when the workspace history no longer starts at the prepared commit.
  - A score with no failures but a NOT RUN check is `INCOMPLETE` (exit code 3), not PASS.
  - The `web-extraction-regression` fixture README, which listed every seeded defect, now stays on the host (`host_only_files`, which must be plain file names) and is written for maintainers.
- **Browser check.**
  - A missing Chromium download is NOT RUN instead of FAIL. Any other launch error, including missing system libraries (`npx playwright install-deps`), is still FAIL.
  - Clicks must change the page: the expected result is checked absent before and present after. `dynamic-js-widget` checks Alpha's own vote count, so a ticking clock can no longer satisfy it.
  - The listener tracker counts each listener once, ignores removals of listeners that were never added, and treats `once` listeners that fired and `signal` listeners whose signal aborted as removed.
  - `web-extraction-regression` now asks for `window.orbitDemo.destroy()` and verifies its teardown in the browser.
- **Evaluation harness.**
  - On timeout, interrupt (Ctrl-C, SIGTERM, SIGHUP) or any other exit, the harness kills the adapter's whole process tree. It used to wait for orphaned processes holding the pipes.
  - It reports timeouts and signals and rejects an invalid `--timeout-ms`. Malformed `checks` or `tool_calls` entries fail the case instead of crashing the run.
- **Smoke tests.**
  - Async tests are awaited, so a failing async test is reported as FAIL instead of PASS.
  - Browser tests that cannot run are reported as NOT RUN and counted separately, not as PASS.
  - A malformed fixture manifest no longer stops the whole suite, and tests that cannot create symlinks report NOT RUN.
  - Every logic fix in this release has a test that fails without it; mutation runs confirmed it for the main ones.
- **Hook and sync script.** `block-dangerous-commands.mjs` and `sync-plugin-agents.mjs` compared paths without resolving symlinks. Run through a symlinked or junction checkout, the hook silently did nothing and `--check` passed without checking. They now compare real paths.
- **Agent frontmatter.** `frontend-documentation-maintainer` had invalid YAML: an unquoted colon in its description. It is now quoted.
- **Plugin coordinator.** It no longer promises reviewers it cannot launch. Unbundled specialists (dependency/license, privacy, release, run diagnostics) are recorded as NOT RUN and need human acceptance; the removed model evaluator is no longer mentioned.
- **Plugin docs and links.**
  - The plugin README counts seven specialists and a coordinator.
  - Plugin agents link to the measurement protocol by URL, because `docs/` is not shipped with the plugin.
- **Documentation.**
  - The README no longer shows a literal `\n\n`.
  - INSTALL uses the plugin's real display name and validates with `npm ci` plus `npm run validate:all`.
  - The measurement protocol installs Playwright after `npm ci`, which used to delete it.
  - Update commands use the qualified plugin name.
  - The planner guide lists `approved_by: null` and the `npm ci` prerequisite.
  - Agent docs no longer merge the "NOT RUN" sentence into the last bullet, and the QA and security docs separate allowed tools from prohibitions.
  - The build loop no longer says the auditor PR is open.
  - CHANGELOG 2.14.0 is grouped and no longer describes removed tooling as added. The 2.13.0 entry now counts seven specialists plus the coordinator.

### Changed
- **Security gate.**
  - Agent frontmatter is parsed as YAML, so tools given as a list are understood. A byte-order mark no longer hides it, nested agent folders are checked, and an agent file without frontmatter is a finding.
  - Scoped write tools such as `Edit(src/**)`, `MultiEdit` and `Write(*)` count as write access. Only an unscoped `disallowedTools` entry removes a tool.
  - An agent whose `tools` is missing, empty or `*` is blocked, because it inherits Edit and Write. `Task` is checked like `Agent`.
  - Code rules run on code with comments and string, template and regex literals masked, so they match code rather than prose. In any file that loads `child_process`, every code reference to `exec`/`execSync` (call, alias, property access, destructuring) is blocked like `shell: true`. So are a `shell` option other than `false` (quoted key or not), spawning a shell binary by name or path, `Function()` with or without `new`, and string callbacks to timers. These are documented heuristics, not a parser.
  - The code rules cover all Node code, including hooks and the `.mjs` helpers under `tests/`, but not the browser files of the fixtures.
  - New token formats: OpenAI project keys, GitHub fine-grained tokens, Slack, Google, npm and PGP private keys. An OpenAI-style match needs mixed case and a digit, so long hyphenated CSS class names are not reported.
  - UTF-16 files are scanned. Symlinks, files over 2 MB and binaries without a binary extension are findings rather than silently skipped. Ignored folder names (`node_modules`, `.git`, `evaluation-results`, `__pycache__`) are skipped only at the repository root.
- **Skill copies.** The plugin validator compares the three skill copies file by file, including `css-tricks-reference.md`, and takes the expected version from `package.json`.
- **Agent cases.** Every review agent must have evaluation cases; `frontend-code-auditor` now has them. Case files and fixture manifests are parsed, and errors are reported instead of crashing.
- **Build queue.** `evaluation/agent-build-queue.json` lists the files each agent delivered, numbers the agents without gaps, and drops the superseded `planned_files`.
- **CI.** CI also runs on Windows, including the PowerShell wrapper in PowerShell 7 and Windows PowerShell 5.1.
- **Skill and Copilot prompts.** `SKILL.md` steps are numbered without duplicates. The Copilot prompt covers CodeMyUI, progressive search, multilanguage tasks and the custom agent, and the developer agent lists CodeMyUI as a source type.

## 2.14.0

Released so that `claude plugin update` delivers the plugin changes made after 2.13.0 (coordinator delegates, license), which had shipped without a version bump.

### Added
- MIT License (`LICENSE`, copyright jmstudio14), declared in `package.json`, the plugin manifest and the README.
- A **Test report** issue form (`.github/ISSUE_TEMPLATE/test-report.yml`) and `docs/testing-guide.md`, so anyone testing the agent can report scenario, result, failures, false claims, cost, environment and evidence in a comparable format, with a required confirmation that secrets were removed.
- `scripts/evaluation/manual-eval.mjs` (`npm run evaluate:manual`) for measuring the real agent without an API key. `prepare` creates a fixture workspace and prints the exact prompt to run in Claude Code with a normal subscription; `score` runs the syntax, fixture, browser, whitespace and edited-files checks and writes `report.json`. Tests cover a FAIL on each untouched fixture and a PASS on each reference solution.
- Three executable evaluation fixtures (`dynamic-js-widget`, `broken-html-card`, `external-deps-gallery`) with assertion scripts, `fixture.json` manifests and matching suite cases. Reference solutions in `tests/fixture-solutions/` prove that every assertion can be met.
- `scripts/evaluation/browser-check.mjs`, an optional Playwright check with the network blocked: page errors, visibility, overflow at 360px, accessible names, interactions, literal text, teardown of timers and listeners, and screenshots. Without Playwright it records NOT RUN.
- `docs/measurement-protocol.md`, the step-by-step manual measurement procedure.
- `package-lock.json`, pinning the `yaml` devDependency with its integrity hash. CI installs with `npm ci --ignore-scripts`, which is also the first local validation step.
- Smoke tests that keep the package, lockfile, marketplace, plugin, README badge and CHANGELOG versions identical; that fail if any file references a paid API key or keeps stale setup wording (including untracked files, and failing if `git grep` itself errors); and that fail if a build-queue entry is left `in_pr`.

### Changed
- `docs/agent-evaluation.md` describes the manual mode. Agent docs, case files and the build loop say that live evaluation is a manual Claude Code run with no API key.
- The package description no longer mentions runtime evaluation.
- The repository is public: README, INSTALL, the plugin README and the marketplace description no longer describe it as private or ask for Git credentials.
- The required Node.js version is 22 (the version CI uses) in `package.json` engines, the README, INSTALL, the plugin README and `validate-agent.ps1`.
- `evaluation/agent-build-queue.json` records every agent as merged.
- The README repository layout lists `docs/`, `evaluation/`, the `tests/` case files, fixtures and solutions, `.github/ISSUE_TEMPLATE/` and `LICENSE`.

### Removed
- Every evaluation path that needs a paid API key, by owner decision: the Claude Agent SDK adapter, the live planner evaluator, the DeepEval judge (which needed `OPENAI_API_KEY`), the repeat and baseline tooling for paid runs, and the `live-agent-evaluation` and `runtime-selection-pending` CI jobs. CI now runs a single `validate` job that needs no API key.
- The runtime compatibility assessment and the SDK import smoke tests, whose only purpose was choosing an SDK for paid evaluation.
- The `agent-model-evaluator` agent, its doc and its cases, including its place among the coordinator's delegates and in the build queue.

### Fixed
- Host-check failures now fail the evaluation case; previously a failing fixture assertion still let the case pass.
- The architect-plan YAML test fails with an actionable message when `yaml` is not installed, instead of a module-resolution stack trace.
- Stale text that said live evaluation needs a configured runtime, credentials or an authenticated model.
- `node_modules/` is ignored.

## 2.13.0

- Bundled seven specialist agents and the coordinator in the Claude Code plugin: `frontend-architect-planner`, `frontend-qa-test-engineer`, `frontend-security-reviewer`, `frontend-extractor-validation-agent`, `frontend-performance-optimizer`, `frontend-documentation-maintainer`, `frontend-code-auditor`, and `agent-ecosystem-coordinator`. Plugin users get them without cloning the repository.
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
