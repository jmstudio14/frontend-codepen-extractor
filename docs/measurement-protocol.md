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
- **Cost is not yet known.** An earlier version of this protocol estimated at most 1 USD per run without measuring it. The first real attempt hit the budget cap in all three runs, with caps of 1 and 3 USD, and spent about 4 USD without completing a case. `AGENT_EVAL_MAX_BUDGET_USD` (default 1) caps each run, but completing a case may cost more than that. Do the diagnostic run below before anything else.
- Work inside a clone of this repository (`git clone https://github.com/jmstudio14/frontend-codepen-extractor.git`), not in another folder.
- Never run the agent outside `scripts/adapters/claude-agent-sdk.mjs`. Its hooks confine file access to a disposable workspace and allow only read-only commands.

## Step 0: diagnostic run (required)

One case with a 0.50 USD cap. Every run now writes a report even when the budget runs out: `run_status` is `COMPLETED`, `BUDGET_EXHAUSTED`, `MAX_TURNS` or `ERROR`, and `usage_breakdown` lists input, cache and output tokens and the tools used per turn. While it runs, one `[cost]` line per turn is printed, and you can stop it with Ctrl+C.

PowerShell (one command per line; no `\` continuations):

```powershell
npm ci --ignore-scripts
npm install --no-save @anthropic-ai/claude-agent-sdk@0.3.301
$env:ANTHROPIC_API_KEY = "your-key"
$env:AGENT_EVAL_MAX_BUDGET_USD = "0.5"
node scripts/evaluation/run-repeated.mjs --adapter "node scripts/adapters/claude-agent-sdk.mjs" --case dynamic-js-widget --repeat 1 --output evaluation-results/diagnostic.json
```

bash:

```bash
npm ci --ignore-scripts
npm install --no-save @anthropic-ai/claude-agent-sdk@0.3.301
export ANTHROPIC_API_KEY=...   # never commit or paste the key
AGENT_EVAL_MAX_BUDGET_USD=0.5 node scripts/evaluation/run-repeated.mjs --adapter "node scripts/adapters/claude-agent-sdk.mjs" --case dynamic-js-widget --repeat 1 --output evaluation-results/diagnostic.json
```

Send `evaluation-results/diagnostic.json`. Its `usage_breakdown` shows which turns and tools consume the budget (for example, reading the skill references or re-sending a large context) before any larger spend. Setting `CLAUDE_AGENT_EVAL_MODEL=haiku` makes the diagnostic cheaper, but it then measures a different model.

## Full run (only after the diagnostic has been reviewed)

From the repository root, in bash (in PowerShell, put the command on one line and set variables with `$env:NAME = "value"`):

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

Set `AGENT_EVAL_MAX_BUDGET_USD` from the cost per case measured in the diagnostic run.

## Review

1. **Run status and cost:** for each case, check `run_status` and `usage_breakdown` (`num_turns`, `totals`, `largest_input_turn`, and per-turn tools). A `BUDGET_EXHAUSTED` case was cut off and is not a judgement of quality.
2. **Summary:** in `evaluation-results/live.json`, check `pass_rate_percent`, `cost_usd_total` and `token_usage`.
3. **Each case:**
   - `errors` explain a FAIL;
   - `objective.failed_checks` names the failing host checks;
   - `repository.changed_files` and `unexpected_files` show what the agent touched;
   - `honesty.summary` is the agent's own report, which you compare against the checks.
4. **Screenshots:** in `evaluation-results/screenshots/<case>-<timestamp>/`, check that the result still looks like the original component and works at 360px.
5. **Consistency:** compare repetitions of the same case. A case that passes once and fails twice is not reliable.

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
