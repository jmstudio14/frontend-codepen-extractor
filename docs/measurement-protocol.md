# Measurement protocol

This protocol produces the first measured evidence of whether the extractor agent fixes real front-end defects. Until it has been run and reviewed, no claim about the agent's quality is supported by evidence.

## What is measured

Four fixtures, each with deliberate defects, an objective assertion script and a reference solution that proves the assertions can be met:

| Case ID | Fixture | Exercises |
| --- | --- | --- |
| `web-extraction-regression` | `tests/fixtures/leaky-animation-prototype` | Animation lifecycle, reduced motion, CSS scoping, accessibility |
| `dynamic-js-widget` | `tests/fixtures/dynamic-js-widget` | Runtime-built DOM, safe text rendering, keyboard access, teardown of timers and listeners |
| `broken-html-card` | `tests/fixtures/broken-html-card` | Malformed HTML, duplicate ids, alt text, inline handlers, real buttons |
| `external-deps-gallery` | `tests/fixtures/external-deps-gallery` | Unpinned CDN library, remote font and images, offline operation, dependency inventory, no installs |

For every run the adapter records the agent's tool calls, the files it changed, the assertion result, the browser result, Git whitespace, tokens and cost. A case passes only if all host checks pass and the agent's report is honest.

## Requirements

- Node.js 22 or later, Git, and an Anthropic API key.
- Optional but recommended: Playwright with Chromium, so the browser check runs (`npm install --no-save playwright` and then `npx playwright install chromium`). Without it the browser check is NOT RUN.
- Budget: `AGENT_EVAL_MAX_BUDGET_USD` defaults to 1 USD per run, so 4 cases × 3 repetitions cost at most 12 USD.

## Run

From the repository root:

```bash
npm ci --ignore-scripts
npm install --no-save @anthropic-ai/claude-agent-sdk@0.3.301
export ANTHROPIC_API_KEY=...   # never commit or paste the key
npm run evaluate:repeated -- \
  --adapter "node scripts/adapters/claude-agent-sdk.mjs" \
  --case web-extraction-regression,dynamic-js-widget,broken-html-card,external-deps-gallery \
  --repeat 3 \
  --output evaluation-results/live.json \
  --history evaluation-results/history.jsonl
```

To try one case first, use `--case dynamic-js-widget --repeat 1`.

## Review

1. **Summary:** in `evaluation-results/live.json`, check `pass_rate_percent`, `cost_usd_total` and `token_usage`.
2. **Each case:**
   - `errors` explain a FAIL;
   - `objective.failed_checks` names the failing host checks;
   - `repository.changed_files` and `unexpected_files` show what the agent touched;
   - `honesty.summary` is the agent's own report, which you compare against the checks.
3. **Screenshots:** in `evaluation-results/screenshots/<case>-<timestamp>/`, check that the result still looks like the original component and works at 360px.
4. **Consistency:** compare repetitions of the same case. A case that passes once and fails twice is not reliable.

## Approve a baseline

Only after the review, copy the reviewed report to `evaluation/baselines/current.json` and add:

```json
"approved": true,
"approved_by": "<name>",
"model": "<model used>",
"source_commit": "<git sha>",
"max_pass_rate_drop_percent": 5
```

Later runs that pass `--baseline evaluation/baselines/current.json` will flag a pass-rate drop or a cost increase. Never create a baseline from the deterministic fixture adapter.

## What to send for analysis

Send `evaluation-results/live.json` and the screenshot folders. Remove nothing; the reports already redact the API key. The analysis will separate model failures, fixture or assertion defects and harness defects before anything is changed.
