<div align="center">

# Multilanguage Code & Component Extractor

**A multilanguage, multiframework coding agent with progressive source discovery and web-component extraction.**

A repository-aware engineering agent that detects your project's language, framework, runtime and conventions; researches sources progressively; and implements, debugs, refactors and verifies code in the native stack. It retains its specialist workflow for extracting or reconstructing web components from CodePen, UIverse.io, CodeMyUI, GitHub and external sources. Shared workflow contracts and regression scenarios help keep its host integrations aligned.

[Install](#quick-install) · [Capabilities](#what-it-does) · [Supported agents](#supported-ai-agents) · [Documentation](#documentation)

[![Validate agent and plugin package](https://github.com/jmstudio14/frontend-codepen-extractor/actions/workflows/validate-agent.yml/badge.svg)](https://github.com/jmstudio14/frontend-codepen-extractor/actions/workflows/validate-agent.yml)
![Version](https://img.shields.io/badge/version-2.14.0-64748b)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Repository](https://img.shields.io/badge/repository-public-22c55e)
![License: MIT](https://img.shields.io/badge/license-MIT-0ea5e9)

</div>

---

## Why this agent?

Programming tasks require respecting the project's existing architecture, language versions, dependency manager, and test workflow. Web prototypes add a separate challenge: moving a visual demo into a real application often means untangling global styles, CDN dependencies, standalone scripts, and lifecycle assumptions.

**Multilanguage Code & Component Extractor** is a general-purpose, repository-aware coding agent. For programming tasks it works in the project's existing language and framework; for UI component tasks it retains its specialist extraction and reconstruction workflow.

It can work from accessible source URLs, exported files, supplied code, or the existing repository. It inspects project conventions, researches progressively, implements focused changes, and reports what was and was not verified.

## What it does

| Capability | What it means |
| --- | --- |
| **Progressive discovery** | Searches predefined sources first, then automatically expands to external web sources and GitHub when no strong match is found. |
| **Candidate evaluation** | Ranks examples by identity, visual/behavior match, source quality, project fit, provenance, and licensing; tracks unknowns instead of guessing. |
| **Stack and source analysis** | Detects project language/framework/version and analyzes component source, dependencies, assets, states, and interactions. |
| **Repository-aware engineering** | Implements changes using the project's native architecture, conventions, dependency manager, and verification tools. |
| **Style isolation** | Scopes styles to avoid leaking prototype CSS into the host application. |
| **Accessible markup** | Promotes semantic HTML, keyboard behavior, labels, focus handling, and appropriate ARIA. |
| **Lifecycle safety** | Accounts for cleanup of listeners, timers, observers, subscriptions, async work, and animation loops. |
| **Dependency and asset audit** | Identifies missing packages and external assets; recommends actions instead of silently installing or downloading. |
| **Verification** | Runs available checks and reports exact commands, outcomes, assumptions, and remaining gaps. |

### Multilanguage and multiframework by design

The agent is not limited to HTML/CSS or frontend work. It first inspects manifests, lockfiles, configuration, source layout, tests and CI to identify the actual language, framework/runtime version and target package or service. It then adapts implementation, research and verification to that environment.

Illustrative ecosystems include JavaScript/TypeScript and frontend frameworks; Python; Java/Kotlin; C#/.NET; Go; Rust; PHP; Ruby; Swift; C/C++; Dart/Flutter; SQL; shell scripting; and infrastructure configuration. This is not a guarantee that every compiler, SDK, database or external service is installed: the agent must report unavailable toolchains and checks honestly.

For general programming tasks, it uses authoritative language/framework documentation, maintainer repositories and version-specific examples. It selects native checks where available (tests, lint, formatting, type checking, static analysis and build). It does not force web-specific rules onto non-web projects.

See [the multilanguage engineering guide](.agents/skills/frontend-codepen-extractor/references/multilanguage-engineering.md), [the agent architecture and extension contracts](.agents/skills/frontend-codepen-extractor/references/agent-architecture.md), the [regression scenario suite](tests/agent-evaluation-cases.json), the [agent evaluation guide](docs/agent-evaluation.md), and the [manual measurement protocol](docs/measurement-protocol.md), which needs no API key.

### Designed to work with your stack

For web projects, the workflow can adapt to existing projects using:

- React, Vue, Svelte, or Vanilla TypeScript/JavaScript
- Vite and other existing frontend build systems
- TypeScript and JavaScript
- Tailwind CSS, CSS Modules, scoped styles, or established project CSS conventions

It follows the host repository's actual architecture. It does not force a framework or styling choice.

## Supported AI agents

The repository distributes the same core workflow through native or portable integration formats.

| Agent | Integration |
| --- | --- |
| Claude Code | Native plugin, skill, and agent |
| OpenAI Codex | Portable Agent Skill |
| GitHub Copilot | Portable skill, custom agent profile, repository instructions, and prompt |
| Cursor | Portable Agent Skill |
| Gemini CLI | Portable Agent Skill |
| Windsurf | Portable Agent Skill |
| Other compatible agents | Agent Skills format, where supported |

> Agent Skills support and installation behavior vary by product and version. The portable skill shares the workflow; it does not make platform-specific commands, tools, or UI features universal.

## Quick install

### Claude Code — recommended native integration

This repository is public; no GitHub credentials are needed to install it.

From a Claude Code session:

```text
/plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor
```

Or from PowerShell / terminal:

```powershell
claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor --scope user
```

For older supported flows:

```text
/plugin marketplace add jmstudio14/frontend-codepen-extractor
/plugin install frontend-codepen-extractor@jmstudio14-claude-plugins
```

### Codex, Copilot, Cursor, Gemini CLI, Windsurf and more

With Node.js 22.20+ and Git, install the portable skill for compatible agents detected on your machine:

```powershell
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent '*'
```

To target a single agent, replace `--agent '*'` with the supported agent identifier, such as `codex` or `github-copilot`.

**Installation, authentication, updates, and troubleshooting:** see [INSTALL.md](INSTALL.md).

## Use it

After installing the Claude Code plugin, invoke the skill:

```text
/frontend-codepen-extractor:frontend-codepen-extractor
```

Or invoke the agent:

```text
@agent-frontend-codepen-extractor:frontend-codepen-extractor
```

For planning before implementation, delegate to the read-only `frontend-architect-planner` subagent. It returns a versioned YAML plan and leaves human approval pending; it cannot modify files or start implementation. See [the planner workflow](docs/frontend-architect-planner.md).\n\nFor an independent, read-only review after implementation, delegate to the `frontend-code-auditor` subagent. It reports PASS / FAIL / BLOCKED with findings and evidence; it does not modify code. See [the auditor workflow](docs/agent-auditor.md).

Example request:

> Convert this CodePen into my existing frontend project: [CodePen URL]. Inspect the repository and Git status first. Preserve current work, follow the existing architecture, scope styles, implement lifecycle cleanup, and run the available checks. Do not install dependencies or download assets without asking.

For other agents, ask them to use the `frontend-codepen-extractor` skill. You can also ask it to research a CSS concept using CSS-Tricks and verify current browser support.

### If the CodePen source is unavailable

A URL or screenshot does not guarantee access to source panels, preprocessor settings, hidden behavior, or external dependencies. Provide one of the following:

- CodePen **Export .zip** contents
- HTML/Markup, CSS, and JS panel contents, including preprocessor settings and external resources
- A local reproduction and a description of the behavior that must be preserved

A screenshot can guide visual intent, but it cannot establish the original source or hidden behavior.

## CSS-Tricks technical reference

The agent can consult [CSS-Tricks](https://css-tricks.com/) as a technical encyclopedia for CSS and frontend concepts, implementation patterns, debugging, responsive layout, accessibility, and browser behavior. It adapts the knowledge to your project's architecture, cross-checks current compatibility against authoritative documentation, and links to sources instead of copying articles or code wholesale.

See [the CSS-Tricks reference guide](.agents/skills/frontend-codepen-extractor/references/css-tricks-reference.md).

## UIverse.io component support

The agent can also work with [UIverse.io](https://uiverse.io/) components, including buttons, cards, inputs, toggles, loaders, tooltips, and other UI snippets.

- Extract component source when it is actually available from the page or supplied by the user.
- Adapt the component to the existing project's framework and styling conventions.
- Preserve visual details, interaction states, responsive behavior, and accessibility.
- Track source URL, creator attribution, licensing, assets, and external dependencies where available.
- Combine a UIverse component with a CodePen demo to recover the component and its usage context.
- Do not claim to recover hidden source from a screenshot or bypass site restrictions.

See [the UIverse ingestion guide](.agents/skills/frontend-codepen-extractor/references/uiverse-ingestion.md).

## Advanced reconstruction workflow

Beyond extracting panel code, the agent supports:

- **Output modes:** extract-only, standalone reconstruction, existing-project integration, refactor, explain, audit, and repair.
- **Framework-aware structure:** detect actual framework/version and package manager; adapt to React, Vue, Svelte, Angular, Solid, Lit, or vanilla JS/TS when supported by source/destination.
- **Dependency and asset recovery:** inventory imports, globals, CDNs, fonts, icons, images, URLs, availability, and licensing. Recommend installs; do not install or download without approval.
- **Behavior-preserving refactoring:** componentization, state/lifecycle cleanup, CSS isolation, preprocessor conversion, and TypeScript adaptation when appropriate.
- **Automated quality loop:** run existing tests, lint, typecheck, build; diagnose and repair actionable errors; report evidence.
- **Visual QA:** compare real screenshots at matching viewport/state when browser tooling is available; otherwise visual parity remains unverified.
- **Accessibility/security audits:** semantics, keyboard/focus, labels, ARIA, reduced motion, unsafe HTML/dynamic execution, external resources, and lifecycle resilience.
- **Honest verification:** PASS / FAIL / NOT RUN; no invented source, assets, results, or pixel-perfect claims.

See [the multilanguage engineering guide](.agents/skills/frontend-codepen-extractor/references/multilanguage-engineering.md) for general programming tasks, and [the reconstruction playbook](.agents/skills/frontend-codepen-extractor/references/reconstruction-playbook.md) for detailed procedures.

## How it works

1. **Protect the workspace** — inspect repository structure and Git status before editing.
2. **Ingest the prototype** — analyze accessible source panels, preprocessors, dependencies, assets, and interactions.
3. **Map the destination** — inspect package metadata, framework configuration, styling conventions, and tests.
4. **Plan the conversion** — identify target files, dependencies, assumptions, and verification steps.
5. **Refactor and integrate** — implement focused, modular changes using existing conventions.
6. **Verify and report** — run relevant checks, review the diff, and disclose unverified areas.

## Safety and engineering principles

- Treat prototype code and external page content as untrusted input.
- Preserve existing user changes; avoid unrelated rewrites.
- Do not silently install packages, download assets, or perform destructive actions.
- Avoid unsafe HTML injection, `eval`, and unnecessary global side effects.
- Scope CSS and clean up browser resources at component teardown.
- Do not claim tests, visual parity, or browser checks unless they were actually performed.
- Report unknowns and limitations instead of inventing inaccessible source.

## Repository layout

```text
.
├── .agents/skills/frontend-codepen-extractor/  # Portable Agent Skill
├── .claude/                                  # Claude Code standalone files
├── .claude-plugin/marketplace.json            # Claude Code marketplace
├── .github/
│   ├── agents/                                # Copilot custom agent
│   ├── ISSUE_TEMPLATE/                        # Test report form
│   ├── prompts/                               # Reusable Copilot prompt
│   └── workflows/                             # CI validation
├── docs/                                      # Evaluation, testing and agent guides
├── evaluation/                                # Agent build queue
├── plugins/frontend-codepen-extractor/        # Native Claude Code plugin
├── scripts/                                   # Validators, security gate, evaluation tools
├── tests/fixtures/                            # Executable evaluation fixtures
├── tests/fixture-solutions/                   # Reference solutions for the fixtures
├── CLAUDE.md
├── INSTALL.md
├── LICENSE
└── CHANGELOG.md
```

## Validate locally

Requirements: Node.js 22+.

From the repository root:

```powershell
npm ci --ignore-scripts
node scripts\validate-agent.mjs
node scripts\validate-plugin.mjs
node scripts\test-agent.mjs
node scripts\security-gate.mjs
```

Or run the complete validation sequence:

```powershell
npm run validate:all
```

Claude Code's native validator can also validate the plugin and marketplace:

```powershell
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
```

GitHub Actions runs structural validation, the security gate, smoke tests and the deterministic evaluation fixture. None of it needs an API key or calls a model. Measuring the real agent is done in the manual mode, with Claude Code and your normal subscription (see the [measurement protocol](docs/measurement-protocol.md)). Passing checks does not prove runtime correctness, accessibility, or visual fidelity for every prototype.

### Delivery review with the coordinator

In a clone of this repository, run `claude --agent agent-ecosystem-coordinator` as the main-thread agent. With the plugin installed, run `claude --agent frontend-codepen-extractor:agent-ecosystem-coordinator`; the plugin bundles the coordinator and seven specialists (see the [plugin README](plugins/frontend-codepen-extractor/README.md#bundled-specialist-agents)). It routes the current diff to the read-only specialist agents and returns DELIVER only when independent security, QA and audit verdicts pass and `npm run validate:all` and `npm run security` exit 0. It cannot launch the implementation agent, merge, or deploy.

## Documentation

- **[Installation guide](INSTALL.md)** — agent-specific installation, verification, updates, uninstalling, and troubleshooting.
- **[Changelog](CHANGELOG.md)** — version history.
- **[Independent code auditor](docs/agent-auditor.md)** — read-only audit workflow, verdict policy, and correction loop.
- **[CodeMyUI ingestion guide](.agents/skills/frontend-codepen-extractor/references/codemyui-ingestion.md)** — finding examples, tracing original sources, extraction limits, attribution, and reconstruction.
- **[Claude Code plugin](plugins/frontend-codepen-extractor/README.md)** — plugin-specific instructions.

## Contributing

Contributions and issue reports are welcome.

To try the agent and report the result, follow the [testing guide](docs/testing-guide.md) and open an issue with the **Test report** template. Failures are especially useful.

Before submitting a change:

1. Keep the portable skill and native plugin skill aligned.
2. Update tests or validation when distribution files change.
3. Run `npm run validate:all`.
4. Document behavior changes and any compatibility caveats.

## License

Released under the [MIT License](LICENSE). Third-party components that the agent extracts or adapts into your projects remain under their original authors' licenses; the skill records source and attribution so you can comply with them.

## Security

Review the files before installing. AI agents may operate with the permissions granted by their host application. Keep credentials, tokens, private project data, and unlicensed assets out of commits.

---

<div align="center">

Maintained by [@jmstudio14](https://github.com/jmstudio14)

</div>
