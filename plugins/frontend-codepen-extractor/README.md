# Multilanguage Code & Component Extractor plugin

This is the packaged Claude Code plugin for repository-aware multilanguage and multiframework engineering. It detects the target stack, implements and verifies code using project-native conventions, and preserves progressive discovery and extraction/reconstruction for CodePen, UIverse.io, CodeMyUI, GitHub, and external web sources. The canonical installation guide is [../../INSTALL.md](../../INSTALL.md).

## Quick install

From a Claude Code session (v2.1.275+):

```text
/plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor
```

From PowerShell / terminal (Claude Code CLI v2.1.292+):

```powershell
claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor --scope user
```

Two-step option, for compatibility:

```text
/plugin marketplace add jmstudio14/frontend-codepen-extractor
/plugin install frontend-codepen-extractor@jmstudio14-claude-plugins
```

The repository is private. The machine installing it must already have Git credentials that can access `jmstudio14/frontend-codepen-extractor`. See [INSTALL.md](../../INSTALL.md#before-you-start) for credential setup and [INSTALL.md](../../INSTALL.md#troubleshooting) for common errors.

## Use it

After installation, use the namespaced skill command:

```text
/frontend-codepen-extractor:frontend-codepen-extractor
```

Or explicitly invoke the agent:

```text
@agent-frontend-codepen-extractor:frontend-codepen-extractor
```

## Bundled specialist agents

The plugin also ships eight read-only review agents and a coordinator:

| Agent | Role |
| --- | --- |
| `frontend-architect-planner` | Versioned YAML plan; waits for human approval |
| `frontend-qa-test-engineer` | Unit, integration and regression checks, including failure paths |
| `frontend-security-reviewer` | Injection, secrets, dependencies, untrusted content, permissions |
| `frontend-extractor-validation-agent` | HTML/CSS/JS/asset fidelity, dynamic content, non-reproducible cases |
| `frontend-performance-optimizer` | Baseline measurements; only measured optimizations |
| `frontend-documentation-maintainer` | Docs, links, commands and versions against the real code |
| `frontend-code-auditor` | Independent audit before delivery |
| `agent-ecosystem-coordinator` | Routes a change to the specialists, bounds retries, decides DELIVER / DO NOT DELIVER |

Invoke a specialist with `@agent-frontend-codepen-extractor:<name>`. Run the coordinator as the main-thread agent so it can delegate:

```text
claude --agent frontend-codepen-extractor:agent-ecosystem-coordinator
```

The coordinator can launch only the bundled specialists, never the implementation agent. It delivers only when the security, QA and audit verdicts pass and your project's own validation and security checks succeed. These agents have not yet been exercised in a live run; treat their verdicts as evidence to review, not as approval.

## Multilanguage support

The agent detects language, framework/runtime, versions and target package from project evidence. For non-web tasks, follow the [multilanguage engineering guide](skills/frontend-codepen-extractor/references/multilanguage-engineering.md) for authoritative research, language-native implementation, stack-specific verification, and honest reporting of unavailable toolchains. This does not imply that every compiler, SDK, database or service is installed.

## CodeMyUI examples

When a requested component appears on CodeMyUI, the skill verifies the exact example and follows confirmed links to the original demo or public repository. It extracts only source code that is actually accessible; if only a demo or preview is available, it reconstructs the component and reports that distinction. See the [CodeMyUI ingestion guide](skills/frontend-codepen-extractor/references/codemyui-ingestion.md) for source verification, licensing, attribution, security review, and validation details.

## Validate locally

From the repository root, with Node.js 18+:

```powershell
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
node scripts\validate-plugin.mjs
```

See the root [README](../../README.md) for the project overview and validation scripts.
