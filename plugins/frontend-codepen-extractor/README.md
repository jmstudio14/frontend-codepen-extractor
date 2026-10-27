# Frontend CodePen Extractor — Claude Code plugin

This directory is the installable Claude Code plugin. The repository root also contains the marketplace catalog and a standalone .claude/ configuration for users who prefer manual integration.

## Install from the private GitHub marketplace

Prerequisites:
- Claude Code installed and signed in.
- Git installed.
- Git credentials that can clone the private repository. HTTPS users can configure GitHub CLI with gh auth login and gh auth setup-git, or use an already working SSH key.

On Claude Code v2.1.275 or newer, you can install from a new marketplace in one command inside the session:

```text
/plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor
```

Claude Code asks you to confirm the marketplace and then prompts for the install scope.

For broader compatibility, use the two-step flow:

\`\`\`text
/plugin marketplace add jmstudio14/frontend-codepen-extractor
/plugin install frontend-codepen-extractor@jmstudio14-claude-plugins
\`\`\`

Choose **User scope** to enable it across all your local projects, or **Local scope** to use it only in the current project. The marketplace needs to be added only once per machine.

From PowerShell or another terminal with Claude Code CLI, use:

\`\`\`powershell
claude plugin marketplace add jmstudio14/frontend-codepen-extractor
claude plugin install frontend-codepen-extractor@jmstudio14-claude-plugins --scope user
\`\`\`

For Claude Code CLI versions that support combined marketplace installation (v2.1.292+), the marketplace and plugin can also be added with:

\`\`\`powershell
claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor --scope user
\`\`\`

## Use the installed plugin

- Skill/command: \`/frontend-codepen-extractor:frontend-codepen-extractor\`
- Explicit agent: \`@agent-frontend-codepen-extractor:frontend-codepen-extractor\`

Example task:

> Use the Frontend CodePen Extractor plugin to convert this CodePen into my existing frontend project: [URL]. Inspect the repository and Git status first, preserve all current work, scope CSS, implement lifecycle cleanup, and run the available checks. Do not install dependencies or download assets without asking.

If source panels cannot be accessed, provide the CodePen export ZIP or paste its HTML, CSS, JavaScript, preprocessor settings, and external resources. A screenshot is useful for visual intent but cannot reveal the implementation.

## Validate before installing

From the repository root:

\`\`\`powershell
claude plugin validate .\\plugins\\frontend-codepen-extractor
claude plugin validate .
\`\`\`

The second command validates the marketplace catalog. The repository also runs structural checks and smoke tests through GitHub Actions.

## Security notes

- Review plugin code before installation; plugins run with your user privileges.
- The plugin does not install npm packages, download prototype assets, or enable a destructive-command hook automatically.
- The standalone command guard in the repository is optional and only best-effort; it is not a security boundary.
- A private GitHub repository remains private. People installing the plugin need repository access and functioning local Git credentials.
