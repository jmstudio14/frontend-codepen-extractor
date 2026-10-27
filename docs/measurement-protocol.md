# Measurement protocol (manual mode, no API key)

This protocol measures whether the extractor agent fixes real front-end defects. It uses only Claude Code with your normal subscription. No Anthropic or other paid API key is involved, and no model is called from scripts.

## What is measured

| Case ID | Fixture | Exercises |
| --- | --- | --- |
| `web-extraction-regression` | `tests/fixtures/leaky-animation-prototype` | Animation lifecycle, reduced motion, CSS scoping, accessibility |
| `dynamic-js-widget` | `tests/fixtures/dynamic-js-widget` | Runtime-built DOM, safe text rendering, keyboard access, teardown of timers and listeners |
| `broken-html-card` | `tests/fixtures/broken-html-card` | Malformed HTML, duplicate ids, alt text, inline handlers, real buttons |
| `external-deps-gallery` | `tests/fixtures/external-deps-gallery` | Unpinned CDN library, remote font and images, offline operation, dependency inventory, no installs |

## Requirements

- A clone of this repository. Run every command from its root, not from another folder:
  ```
  git clone https://github.com/jmstudio14/frontend-codepen-extractor.git
  ```
- Node.js 22 or later and Git.
- Claude Code with the `frontend-codepen-extractor` plugin installed and up to date (`claude plugin update frontend-codepen-extractor`).
- Optional: Playwright with Chromium, so the browser check runs (`npm install --no-save playwright`, then `npx playwright install chromium`). Without it the browser check is NOT RUN.

## Steps

The same commands work in PowerShell and bash. Write each command on one line.

1. **Install the validation dependencies:**
   ```
   npm ci --ignore-scripts
   ```
2. **Prepare a workspace:**
   ```
   node scripts/evaluation/manual-eval.mjs prepare dynamic-js-widget
   ```
   This prints the workspace path and the exact prompt, and also saves the prompt as `prompt.txt` next to the workspace. The workspace is a fresh Git repository with only the fixture's source files; the checks and solutions are not copied into it.
3. **Run the agent:**
   1. `cd` into the printed workspace and start `claude`.
   2. Paste the prompt and let the agent finish without helping it.
   3. Save its final answer; you need it for the honesty review.
   4. Run `/cost` and note the session cost.
4. **Score the workspace.** From the repository root:
   ```
   node scripts/evaluation/manual-eval.mjs score <workspace path>
   ```
   This writes `report.json` and, when Playwright is available, a `screenshots/` folder next to the workspace. It exits with 0 on PASS and 1 on FAIL.
5. **Repeat** for the other three cases, and preferably more than once per case: one PASS is not reliability.

## Review

- `report.json` shows `status`, `objective.failed_checks`, `repository.changed_files`, `unexpected_files`, and each check's output.
- Compare the agent's final answer with the report. A claimed PASS that the score marks FAIL, or browser/visual QA claimed as done, is an honesty failure.
- In the screenshots, check that the result still looks like the original component and works at 360px.
- In the workspace, run `git diff` and check that the change is focused.

## What to send for analysis

For each case, send:
- `report.json`;
- the `screenshots/` folder;
- the agent's final answer;
- the `/cost` figure.

The analysis separates model failures, fixture or assertion defects, and harness defects before anything is changed.
