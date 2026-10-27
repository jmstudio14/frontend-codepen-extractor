# Install Frontend CodePen Extractor in Claude Code

This repository is a **private Claude Code plugin marketplace**. You only need to install the plugin once per machine if you choose **User scope**.

## Before you start

- Install Claude Code and sign in.
- Make sure your local Git setup can clone the private repository `jmstudio14/frontend-codepen-extractor`.
- For the one-command in-session install, use Claude Code **v2.1.275 or newer**.
- For the one-command shell install, use Claude Code **v2.1.292 or newer**.

Because the repository is private, Claude Code uses existing Git credentials and does not prompt interactively during cloning. Verify that cloning private GitHub repositories already works in your terminal.

### Set up GitHub credentials if needed

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

In a Claude Code session, run `/plugin` and open the **Installed** tab. Look for **Frontend CodePen Extractor** and confirm its status is enabled.

Use the skill with:

```text
/frontend-codepen-extractor:frontend-codepen-extractor
```

Or ask Claude Code to use the agent explicitly:

```text
@agent-frontend-codepen-extractor:frontend-codepen-extractor
```

Example request:

> Use the Frontend CodePen Extractor plugin to convert this CodePen into my existing frontend project: [URL]. Inspect the repository and Git status first, preserve current work, scope styles, implement lifecycle cleanup, and run the available checks. Do not install dependencies or download assets without asking.

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

### Private repository authentication fails

1. Confirm the account has access to the private GitHub repository.
2. Confirm that `git clone https://github.com/jmstudio14/frontend-codepen-extractor.git` works from the same terminal and credential setup.
3. If using SSH, confirm the key works without an interactive passphrase prompt and GitHub is in `known_hosts`.
4. Retry the marketplace add/install command.

### Plugin is not listed or skill does not appear

1. Run `/plugin` and check its **Errors** tab.
2. Run `claude plugin marketplace list` to confirm the marketplace was added.
3. Run `claude plugin marketplace update jmstudio14-claude-plugins` and retry the install.
4. Check that the plugin is enabled using `claude plugin list`; restart the session or run `/reload-plugins` if asked.

### Validate the repository when developing changes

From a local clone, with Node.js 18+ installed:

```powershell
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
node scripts\validate-agent.mjs
node scripts\validate-plugin.mjs
node scripts\test-agent.mjs
```

The first validation command checks the plugin directory; the second checks the marketplace catalog. GitHub Actions runs the automated structural checks and smoke tests on pushes and pull requests.

## Security notes

- Review plugin contents before installing. Plugins execute with the permissions available to Claude Code.
- This plugin does not install frontend npm dependencies, download assets, or enable optional destructive-command hooks automatically.
- The repository remains private. Every installing machine needs access and valid local Git credentials.
- Repository validation does not guarantee visual parity or correctness for every CodePen. Test with real prototypes and inspect the result in a browser.

## Official documentation

- [Install and manage Claude Code plugins](https://code.claude.com/docs/en/plugins/install)
- [Create a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
