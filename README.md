# Frontend CodePen Extractor — Claude Code plugin v2.1.0

Convert CodePen prototypes into modular, accessible, type-safe frontend components that follow the target repository's existing architecture.

This repository provides **two installation options**:
1. **Claude Code plugin (recommended):** install into Claude Code once and use it across projects.
2. **Standalone `.claude/` configuration:** copy the agent and skill into one repository manually.

## Install directly in Claude Code (recommended)

The repository is private. Your local Git credentials must have access to `jmstudio14/frontend-codepen-extractor`.

### Option A — from a Claude Code session

Run these commands inside Claude Code:

```text
/plugin marketplace add jmstudio14/frontend-codepen-extractor
/plugin install frontend-codepen-extractor@jmstudio14-claude-plugins
```

When prompted, choose **User scope** to use the plugin across all projects on this computer. Choose **Local scope** to use it only in the current project.

### Option B — from PowerShell / terminal

For Claude Code CLI installed and available on PATH:

```powershell
claude plugin marketplace add jmstudio14/frontend-codepen-extractor
claude plugin install frontend-codepen-extractor@jmstudio14-claude-plugins --scope user
```

On Claude Code CLI v2.1.292 or newer, the marketplace can be added and the plugin installed in one command:

```powershell
claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor --scope user
```

If Git authentication is not set up, authenticate first. With GitHub CLI installed, use:

```powershell
gh auth login -h github.com -p https
gh auth setup-git
```

Alternatively, configure Git Credential Manager or a working SSH key for GitHub. Do not paste a personal access token into the plugin, repository files, or chat.

### Confirm installation

```powershell
claude plugin list
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
```

The last two commands require this repository to be cloned locally. The plugin can be validated by Claude Code CLI before installation. Once installed, use:

- **Skill command:** `/frontend-codepen-extractor:frontend-codepen-extractor`
- **Explicit agent:** `@agent-frontend-codepen-extractor:frontend-codepen-extractor`

If the plugin was installed while a session was already open, run `/reload-plugins` if Claude Code requests it, or restart the session.

## Example task

> Use the Frontend CodePen Extractor plugin to convert this CodePen into my existing frontend project: [URL]. Inspect the repository and Git status first, preserve current work, scope styles, implement lifecycle cleanup, and run the available checks. Do not install dependencies or download assets without asking.

If source panels cannot be accessed, provide the CodePen export ZIP or paste the HTML, CSS, JavaScript, preprocessor settings, and external resources. A screenshot helps with visual intent but cannot reveal hidden behavior or source dependencies.

## What the plugin includes

```text
.claude-plugin/marketplace.json
plugins/frontend-codepen-extractor/
├── .claude-plugin/plugin.json
├── agents/frontend-codepen-extractor.md
└── skills/frontend-codepen-extractor/
    ├── SKILL.md
    └── references/
        ├── codepen-ingestion.md
        ├── dependency-policy.md
        ├── framework-patterns.md
        └── quality-checklist.md
```

The standalone `.claude/` version remains in the repository for users who prefer manual project-level integration. The package also includes validation scripts, test fixtures, a Windows PowerShell wrapper, and GitHub Actions.

## Validate the package

Node.js 18+ is required for repository checks; no npm dependencies are needed.

```powershell
node scripts/validate-agent.mjs
node scripts/validate-plugin.mjs
node scripts/test-agent.mjs
```

Also run Claude Code's own validator on a local clone:

```powershell
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
```

The repository's GitHub Actions workflow runs structural checks and smoke tests. These tests do not prove that every conversion is correct or visually identical. Test the installed agent with real prototypes and check the resulting project in a browser.

## Security

- Review plugin files before installing. A plugin runs with your user permissions.
- The plugin does not install npm packages, download assets, or enable a destructive-command hook automatically.
- The standalone command guard is optional, best-effort defense-in-depth, not a security boundary.
- Because the marketplace repository is private, each installing machine needs repository access and working local Git credentials.
- Never commit tokens, credentials, private project files, or downloaded assets without authorization.
