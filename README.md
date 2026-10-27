# Frontend CodePen Extractor — Multi-agent skill v2.2.0

Convert CodePen prototypes into modular, accessible, type-safe frontend components that follow your project's existing architecture.

This private repository offers two options:

- **Recommended:** install the native Claude Code plugin once and use it across projects.
- **Alternative:** copy the standalone `.claude/` agent/skill configuration into one project.

## Quick install

### From a Claude Code session

Requires Claude Code v2.1.275 or newer:

```text
/plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor
```

### From PowerShell / terminal

Requires Claude Code CLI v2.1.292 or newer:

```powershell
claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor --scope user
```

If you prefer compatibility with older versions, use the two-step flow:

```text
/plugin marketplace add jmstudio14/frontend-codepen-extractor
/plugin install frontend-codepen-extractor@jmstudio14-claude-plugins
```

The repository is **private**. The installing machine must already have Git credentials that can clone it. If needed, configure GitHub CLI with `gh auth login -h github.com -p https` and `gh auth setup-git`, or configure a working SSH key / Git Credential Manager.

**Full instructions:** see [INSTALL.md](INSTALL.md), including installation scopes, verification, updates, uninstallation, authentication, and troubleshooting.

## Install in Codex, GitHub Copilot and other coding agents

The portable Agent Skill lives in `.agents/skills/frontend-codepen-extractor/`. With Node.js 22.20+ and Git access to this private repository, install it across all compatible agents detected on your machine:

```powershell
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent '*'
```

To target only Codex or Copilot, replace `--agent '*'` with `--agent codex` or `--agent github-copilot`. The same skill format can be installed for Cursor, Gemini CLI, Windsurf, and other agents supported by the [skills CLI](https://github.com/vercel-labs/skills).

The repository also includes a GitHub Copilot custom agent at `.github/agents/frontend-codepen-extractor.agent.md` and a reusable prompt at `.github/prompts/extract-codepen.prompt.md`. To use those customizations in another project, copy them into that project's `.github/agents/` and `.github/prompts/` directories. The portable skill alone is enough for supported Agent Skills clients; Claude Code's plugin-specific UI and commands are not universal.

**Full guide:** [INSTALL.md](INSTALL.md) covers Codex, Copilot, Cursor, Gemini CLI, Windsurf, private-repository authentication, updates, and troubleshooting.

## Use the plugin

After installation, verify with `claude plugin list` or open `/plugin` and check the Installed tab.

Run the skill:

```text
/frontend-codepen-extractor:frontend-codepen-extractor
```

Or invoke the agent explicitly:

```text
@agent-frontend-codepen-extractor:frontend-codepen-extractor
```

Example task:

> Use the Frontend CodePen Extractor plugin to convert this CodePen into my existing frontend project: [URL]. Inspect the repository and Git status first, preserve current work, scope styles, implement lifecycle cleanup, and run the available checks. Do not install dependencies or download assets without asking.

If source panels cannot be accessed, provide the CodePen export ZIP or paste its HTML, CSS, JavaScript, preprocessor settings, and external resources. A screenshot helps with visual intent but cannot reveal hidden behavior or source dependencies.

## Included components

```text
.claude-plugin/marketplace.json
plugins/frontend-codepen-extractor/
├── .claude-plugin/plugin.json
├── README.md
├── agents/frontend-codepen-extractor.md
└── skills/frontend-codepen-extractor/
    ├── SKILL.md
    └── references/
        ├── codepen-ingestion.md
        ├── dependency-policy.md
        ├── framework-patterns.md
        └── quality-checklist.md
```

The standalone `.claude/` version remains available for manual project-level integration. Scripts, fixtures, a PowerShell wrapper, and GitHub Actions are also included.

## Validate changes

Node.js 18+ is required; the repository uses no additional npm dependencies for validation.

```powershell
node scripts\validate-agent.mjs
node scripts\validate-plugin.mjs
node scripts\test-agent.mjs
```

Claude Code's native validator can also check the packaged plugin and marketplace from a local clone:

```powershell
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
```

GitHub Actions runs the structural checks and smoke tests on pushes and pull requests. These tests do not guarantee visual parity or correctness for every CodePen; test real prototypes and inspect the converted UI in a browser.

## Security

- Review plugin contents before installing; plugins execute with the permissions available to Claude Code.
- The plugin does not install frontend dependencies, download prototype assets, or enable optional destructive-command hooks automatically.
- The marketplace is private. Every installing machine needs repository access and functioning local Git credentials.
- Never commit tokens, credentials, private project files, or downloaded assets without authorization.

## Official documentation

- [Install and manage Claude Code plugins](https://code.claude.com/docs/en/plugins/install)
- [Create a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
