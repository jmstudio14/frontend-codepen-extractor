<div align="center">

# Frontend CodePen Extractor

**Turn CodePen prototypes into production-ready frontend components.**

A repository-aware engineering agent that progressively searches for frontend examples, evaluates source quality and fit, then extracts or reconstructs them for your existing stack with maintainability, accessibility, and lifecycle safety.

[Install](#quick-install) · [Capabilities](#what-it-does) · [Supported agents](#supported-ai-agents) · [Documentation](#documentation)

[![Validate agent and plugin package](https://github.com/jmstudio14/frontend-codepen-extractor/actions/workflows/validate-agent.yml/badge.svg)](https://github.com/jmstudio14/frontend-codepen-extractor/actions/workflows/validate-agent.yml)
![Version](https://img.shields.io/badge/version-2.6.1-64748b)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/repository-private-8b5cf6)

</div>

---

## Why this agent?

CodePen prototypes are useful for experimentation, but moving them into a real application often means untangling global styles, CDN dependencies, standalone scripts, and lifecycle assumptions.

**Frontend CodePen Extractor** helps bridge that gap. It treats the destination repository—not the prototype—as the architectural source of truth.

It can search CodePen, UIverse.io, CodeMyUI, GitHub, and other external sources; it works from a source URL when code is accessible, exported files, or pasted HTML/CSS/JavaScript panels. It then inspects the project, plans the conversion, implements focused changes, and reports what was and was not verified.

## What it does

| Capability | What it means |
| --- | --- |
| **Progressive discovery** | Searches predefined sources first, then expands to external web sources and GitHub when no strong match is found. |\n| **Candidate evaluation** | Ranks examples by identity, visual/behavior match, source quality, project fit, provenance, and licensing; tracks unknowns instead of guessing. |\n| **Source analysis** | Identifies markup, CSS and JavaScript dialects, preprocessors, dependencies, assets, states, and interactions. |
| **Repository-aware conversion** | Adapts the prototype to the framework, component conventions, styling system, and package manager already in use. |
| **Style isolation** | Scopes styles to avoid leaking prototype CSS into the host application. |
| **Accessible markup** | Promotes semantic HTML, keyboard behavior, labels, focus handling, and appropriate ARIA. |
| **Lifecycle safety** | Accounts for cleanup of listeners, timers, observers, subscriptions, async work, and animation loops. |
| **Dependency and asset audit** | Identifies missing packages and external assets; recommends actions instead of silently installing or downloading. |
| **Verification** | Runs available checks and reports exact commands, outcomes, assumptions, and remaining gaps. |

### Designed to work with your stack

The workflow can adapt to existing projects using:

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

This repository is private. Before installing, ensure the machine has Git credentials that can access it.

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

With Node.js 22.20+ and authenticated Git access, install the portable skill for compatible agents detected on your machine:

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

See [the reconstruction playbook](.agents/skills/frontend-codepen-extractor/references/reconstruction-playbook.md) for detailed procedures.

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
│   ├── prompts/                                # Reusable Copilot prompt
│   └── workflows/                               # CI validation
├── plugins/frontend-codepen-extractor/          # Native Claude Code plugin
├── scripts/                                    # Validators and smoke tests
├── tests/fixtures/                              # Test prototype fixture
├── CLAUDE.md
├── INSTALL.md
└── CHANGELOG.md
```

## Validate locally

Requirements: Node.js 18+.

From the repository root:

```powershell
node scripts\validate-agent.mjs
node scripts\validate-plugin.mjs
node scripts\test-agent.mjs
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

GitHub Actions runs structural validation and smoke tests on pushes and pull requests. Passing these checks does not prove runtime correctness, accessibility, or visual fidelity for every prototype.

## Documentation

- **[Installation guide](INSTALL.md)** — agent-specific installation, private GitHub authentication, verification, updates, uninstalling, and troubleshooting.
- **[Changelog](CHANGELOG.md)** — version history.
- **[CodeMyUI ingestion guide](.agents/skills/frontend-codepen-extractor/references/codemyui-ingestion.md)** — finding examples, tracing original sources, extraction limits, attribution, and reconstruction.
- **[Claude Code plugin](plugins/frontend-codepen-extractor/README.md)** — plugin-specific instructions.

## Contributing

Contributions and issue reports are welcome from users with access to this private repository.

Before submitting a change:

1. Keep the portable skill and native plugin skill aligned.
2. Update tests or validation when distribution files change.
3. Run `npm run validate:all`.
4. Document behavior changes and any compatibility caveats.

## Security

Review the files before installing. AI agents may operate with the permissions granted by their host application. Keep credentials, tokens, private project data, and unlicensed assets out of commits.

---

<div align="center">

Maintained by [@jmstudio14](https://github.com/jmstudio14)

</div>
