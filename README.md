# Frontend CodePen Extractor for Claude Code — v2

A reusable Claude Code project subagent + skill for converting CodePen prototypes into components that follow an existing frontend repository's architecture.

## What is included

```text
.claude/
├── agents/frontend-codepen-extractor.md
├── skills/frontend-codepen-extractor/
│   ├── SKILL.md
│   └── references/
│       ├── codepen-ingestion.md
│       ├── dependency-policy.md
│       ├── framework-patterns.md
│       └── quality-checklist.md
└── settings.example.json
CLAUDE.md
README.md
CHANGELOG.md
package.json
scripts/
├── block-dangerous-commands.mjs
├── test-agent.mjs
├── validate-agent.mjs
└── validate-agent.ps1
tests/fixtures/leaky-animation-prototype/
├── README.md
├── index.html
├── prototype.css
└── prototype.js
.github/workflows/validate-agent.yml
```

## Install in a project

1. Download or clone this repository.
2. Copy `.claude/agents/` and `.claude/skills/` into your project root. If `.claude/` already exists, merge directories; do not delete existing files.
3. Merge relevant rules from `CLAUDE.md` into your existing file; do not overwrite project-specific instructions.
4. Open Claude Code from the target project root. Restart the session if files were added while Claude Code was running.
5. Verify the agent appears in Claude Code and try a small prototype first.

`.claude/settings.example.json` is optional. Review and merge its `hooks` section into your project's `.claude/settings.json` if you want command-guard hooks. Do not replace existing settings. The example requires Node.js on PATH and is best-effort protection, not a security boundary; keep permission prompts and OS-level protections enabled.

## Validate this repository

Requirements: Node.js 18 or newer. No npm dependencies are required.

```powershell
.\scripts\validate-agent.ps1
node scripts\test-agent.mjs
```

Or cross-platform:

```bash
node scripts/validate-agent.mjs
node scripts/test-agent.mjs
```

The validator checks files and metadata, JSON configuration, and fixtures. The tests check package invariants and destructive-command classification. These checks cannot prove an agent will always reason correctly or guarantee application security.

## Use it

> Use the `frontend-codepen-extractor` agent and its skill to convert this CodePen into the component architecture already used by this repository: [URL]. Inspect the repository and Git status first, preserve my existing changes, implement the smallest safe change, and run the available checks. Do not install dependencies or download assets without asking.

If source panels are inaccessible, provide the HTML/Markup, CSS, JS panels, preprocessor settings, external resources, or exported ZIP. A screenshot alone cannot establish source behavior.

## Verification standard

Report each applicable verification as PASS, FAIL, or NOT RUN. A successful build does not prove accessibility, lifecycle cleanup, exact visual parity, security, or production readiness. Visual comparisons require actual browser evidence. See `references/quality-checklist.md` under the skill directory.

## Hook safety note

The optional command hook blocks several common destructive shell-command patterns. Pattern matching can miss obfuscated commands and may occasionally flag safe commands with similar text. It is defense-in-depth only. Keep Claude Code permission prompts enabled and review commands that change or delete project data.

## GitHub workflow

The included GitHub Actions workflow runs the repository validator and smoke tests on pushes and pull requests. It validates the agent package, not code quality in a separate application.
