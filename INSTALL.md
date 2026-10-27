# Install Multilanguage Code & Component Extractor in Claude Code

This repository is a **public Claude Code plugin marketplace**. You only need to install the plugin once per machine if you choose **User scope**.

## Before you start

- Install Claude Code and sign in.
- Make sure Git is installed; the public repository `jmstudio14/frontend-codepen-extractor` is cloned without credentials.
- For the one-command in-session install, use Claude Code **v2.1.275 or newer**.
- For the one-command shell install, use Claude Code **v2.1.292 or newer**.

The repository is public, so no GitHub credentials are needed to install. If your Git setup is configured to require authentication for every GitHub URL, or you work from a fork you made private, set up credentials as follows.

### Set up GitHub credentials only if needed

With GitHub CLI installed, open PowerShell and run:

```powershell
gh auth login -h github.com -p https
gh auth setup-git
```

Alternatively, configure Git Credential Manager or an SSH key that can access the repository. Do not put a personal access token into the plugin files or README.

## Option 1 — install directly in a Claude Code session (recommended)

Start Claude Code, then run:

```text
/plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor
```

Claude Code will resolve the marketplace source, ask you to confirm it if it is new, and open the plugin details. Choose an installation scope:

- **User scope:** available across all your local projects on this computer.
- **Local scope:** available only in the current repository.
- **Project scope:** configured for everyone working in the current repository.

Choose **User scope** for a personal global installation.

## Option 2 — compatible two-step installation

Inside Claude Code, run:

```text
/plugin marketplace add jmstudio14/frontend-codepen-extractor
/plugin install frontend-codepen-extractor@jmstudio14-claude-plugins
```

The marketplace name comes from `.claude-plugin/marketplace.json`. After the marketplace is registered, you only need the second command for later installs from this marketplace.

## Option 3 — install from PowerShell / terminal

This uses the Claude Code CLI without needing to start an interactive session.

### Two steps

```powershell
claude plugin marketplace add jmstudio14/frontend-codepen-extractor
claude plugin install frontend-codepen-extractor@jmstudio14-claude-plugins --scope user
```

### One command (Claude Code v2.1.292 or newer)

```powershell
claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor --scope user
```

The shell command uses user scope by default; `--scope user` makes the intent explicit.

## Verify the installation

In PowerShell:

```powershell
claude plugin list
claude plugin details frontend-codepen-extractor
```

In a Claude Code session, run `/plugin` and open the **Installed** tab. Look for **Multilanguage Code & Component Extractor** (plugin `frontend-codepen-extractor`) and confirm its status is enabled.

Use the skill with:

```text
/frontend-codepen-extractor:frontend-codepen-extractor
```

Or ask Claude Code to use the agent explicitly:

```text
@agent-frontend-codepen-extractor:frontend-codepen-extractor
```

Example request:

> Use the frontend-codepen-extractor plugin to convert this CodePen into my existing frontend project: [URL]. Inspect the repository and Git status first, preserve current work, scope styles, implement lifecycle cleanup, and run the available checks. Do not install dependencies or download assets without asking.

If the plugin was installed while a session was already open and Claude Code asks for a reload, run:

```text
/reload-plugins
```

## Update or uninstall

Update the plugin from a terminal:

```powershell
claude plugin update frontend-codepen-extractor@jmstudio14-claude-plugins
```

To uninstall from user scope:

```powershell
claude plugin uninstall frontend-codepen-extractor@jmstudio14-claude-plugins --scope user
```

You can also manage, update, disable, or uninstall it from the `/plugin` panel.

## Troubleshooting

### Cloning the repository fails

1. Confirm that https://github.com/jmstudio14/frontend-codepen-extractor opens in a browser and that your network or proxy allows GitHub.
2. Confirm that `git clone https://github.com/jmstudio14/frontend-codepen-extractor.git` works from the same terminal and credential setup.
3. If using SSH, confirm the key works without an interactive passphrase prompt and GitHub is in `known_hosts`.
4. Retry the marketplace add/install command.

### Plugin is not listed or skill does not appear

1. Run `/plugin` and check its **Errors** tab.
2. Run `claude plugin marketplace list` to confirm the marketplace was added.
3. Run `claude plugin marketplace update jmstudio14-claude-plugins` and retry the install.
4. Check that the plugin is enabled using `claude plugin list`; restart the session or run `/reload-plugins` if asked.

### Validate the repository when developing changes

From a local clone, with Node.js 22+ installed:

```powershell
npm ci --ignore-scripts
npm run validate:all
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
```

`npm ci --ignore-scripts` installs the pinned validation dependency without running install scripts. `npm run validate:all` runs the structural validators, the smoke tests and the security gate. The last two commands check the plugin directory and the marketplace catalog with Claude Code's own validator. GitHub Actions runs the same checks on Ubuntu and Windows for every push and pull request.

## Install for Codex, GitHub Copilot, Cursor, Gemini CLI and other agents

The repository includes a portable Agent Skills version at `.agents/skills/frontend-codepen-extractor/`. This follows the shared `SKILL.md` structure that is supported by Codex, GitHub Copilot, Cursor, Gemini CLI, Claude Code, Windsurf, and many other coding agents. A universal skill travels across hosts, but host-specific agent profiles and settings are not identical.

### Recommended: install into all detected supported agents

Requirements: Node.js 22.20 or newer, npm/npx, and Git.

Run in PowerShell:

```powershell
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent '*'
```

The CLI will discover supported agent integrations on the machine and ask how to install the skill. Review the selected agents and paths before confirming. Use `--copy` if you prefer files to be copied instead of linked:

```powershell
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent '*' --copy
```

If you only want specific agents, target them explicitly:

```powershell
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent codex
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent github-copilot
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent cursor
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --global --agent gemini-cli
```

The repository is public, so the installer needs no GitHub credentials. Never paste tokens into command arguments or commit them. If the command cannot read the repository, first verify that you can clone it with Git from the same terminal.

### Codex

The universal installation above registers the skill in Codex's user-level skill directory. Restart Codex if the skill does not appear. Invoke it by asking for the `frontend-codepen-extractor` skill or using the skill picker; exact invocation UI can vary by Codex client/version.

For repository-local installation, use the normal skills CLI without `--global`:

```powershell
npx skills add jmstudio14/frontend-codepen-extractor --skill frontend-codepen-extractor --agent codex --copy
```

### GitHub Copilot

The universal installation above registers the skill for Copilot if the GitHub Copilot integration is detected and selected. Copilot supports project skills under `.agents/skills/` and `.github/skills/`, and personal skills under `~/.agents/skills/` or `~/.copilot/skills/`.

This repository also includes a GitHub Copilot custom agent profile at `.github/agents/frontend-codepen-extractor.agent.md` and a reusable prompt at `.github/prompts/extract-codepen.prompt.md`. To make those **project-level Copilot customizations** available in another repository, copy the agent profile into that project's `.github/agents/`, the prompt into `.github/prompts/`, and optionally merge `.github/copilot-instructions.md` into the target repository. Do not replace existing instructions or files.

An alternative, when using GitHub CLI 2.90.0 or newer with the preview `gh skill` command, is:

```powershell
gh skill preview jmstudio14/frontend-codepen-extractor frontend-codepen-extractor
gh skill install jmstudio14/frontend-codepen-extractor frontend-codepen-extractor --agent copilot --scope user
```

Check `gh skill --help` for the exact syntax supported by your installed CLI; this GitHub CLI feature is in preview and may change.

### Cursor, Gemini CLI, Windsurf and compatible agents

The portable skill under `.agents/skills/` uses the Agent Skills convention. Cursor and Gemini CLI officially discover skills from `.agents/skills/`; Windsurf and many other coding agents are supported by the universal `skills` CLI. Select the desired host with `--agent <name>`, or use `--agent '*'` to install for all supported agents detected on this machine.

To list currently installed skills:

```powershell
npx skills list --global
```

To check for and install updates later:

```powershell
npx skills check
npx skills update --global
```

To remove this skill from integrations managed by the CLI, use `npx skills remove` and select the relevant skill/agent scope. You may also remove it from the host application's own skill manager.

### Compatibility boundary

- **Portable skill:** shared workflow, references, safety rules, and conversion checklist. This is the part intended for use across agents.
- **Claude Code plugin:** marketplace installation, its own subagent profile, and namespaced slash command.
- **GitHub Copilot profile:** repository-level custom agent and prompt files, which must be copied into a different repository if you want that repository-specific profile there.
- **Other hosts:** names, UI, invocation syntax, available tools, and global directories vary. The CLI can install the skill, but it does not make every host support Claude Code plugin commands or subagents.

## Security notes

- Review plugin contents before installing. Plugins execute with the permissions available to Claude Code.
- This plugin does not install frontend npm dependencies, download assets, or enable optional destructive-command hooks automatically.
- The repository is public. Anyone can read and install it, so never commit secrets or confidential code to it.
- Repository validation does not guarantee visual parity or correctness for every CodePen. Test with real prototypes and inspect the result in a browser.

## Official documentation

- [Install and manage Claude Code plugins](https://code.claude.com/docs/en/plugins/install)
- [Create a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
