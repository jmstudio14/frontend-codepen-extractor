# Frontend CodePen Extractor plugin

This is the packaged Claude Code plugin for extracting, reconstructing, and integrating CodePen prototypes, UIverse.io components, and CSS-Tricks technical references The canonical installation guide is [../../INSTALL.md](../../INSTALL.md).

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

## Validate locally

From the repository root, with Node.js 18+:

```powershell
claude plugin validate .\plugins\frontend-codepen-extractor
claude plugin validate .
node scripts\validate-plugin.mjs
```

See the root [README](../../README.md) for the project overview and validation scripts.
