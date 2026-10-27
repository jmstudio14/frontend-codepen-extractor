# Testing guide

This guide is for anyone who wants to try the extractor agent and report what happened. You do not need to write code. No API key is used; the agent runs inside Claude Code with your own account.

## 1. Install

1. Install [Claude Code](https://code.claude.com/). The repository is public, so no special access is needed.
2. Install the plugin:
   ```
   claude plugin install frontend-codepen-extractor --marketplace jmstudio14/frontend-codepen-extractor
   ```
   If it is already installed, update it with `claude plugin update frontend-codepen-extractor@jmstudio14-claude-plugins`.
3. To run the fixtures, you also need Node.js 22 or later, Git, and a clone of this repository. Run `npm ci --ignore-scripts` in the clone. Optionally install Playwright (`npm install --no-save playwright` and then `npx playwright install chromium`) so the browser check runs.

## 2. Choose a test

**Fixtures** are small components with known defects. Everyone gets the same task, so results can be compared. From the repository root:

```
node scripts/evaluation/manual-eval.mjs prepare dynamic-js-widget
```

The cases are `dynamic-js-widget`, `broken-html-card`, `external-deps-gallery` and `web-extraction-regression`. Then:

1. Open `claude` in the printed workspace folder. It is created in your system's temporary folder, outside the clone, so the agent does not see this repository's instructions or solutions.
2. Paste the printed prompt and let the agent finish without helping it.
3. Score the result:
   ```
   node scripts/evaluation/manual-eval.mjs score <workspace>
   ```

The full procedure is in [measurement-protocol.md](measurement-protocol.md).

**Real components** show how the agent behaves in everyday work. Ask it to extract or adapt a public CodePen, UIverse or CodeMyUI component into a project of yours. Then check the result yourself: does it look and behave like the original, did it break anything else, and did it touch only what it should?

## 3. Report

Open an issue with the **Test report** template (Issues → New issue → Test report). It asks for:
- what you tested and whether it passed;
- what failed or what you had to fix by hand;
- whether the agent claimed anything untrue;
- the cost from `/cost`;
- your environment and any evidence, such as `report.json` or screenshots.

Failures are the most useful reports. Please send them too.

## Privacy and safety

- Do not test on confidential or proprietary code unless you are allowed to share it with an AI service. The agent reads and edits files, and that content is sent to Anthropic as with any Claude Code use.
- Never paste secrets, API keys, tokens or private data into a report.
- Use public components or the provided fixtures whenever possible.
