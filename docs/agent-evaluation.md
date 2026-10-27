# Runtime agent evaluation

Two paths are intentionally separate: npm run evaluate:fixture is a deterministic harness smoke test, not an LLM evaluation; npm run evaluate:claude invokes Claude Agent SDK and consumes model budget.

## Claude Agent SDK setup

Requires Node.js 22+, Git, and supported Claude Agent SDK authentication.

    npm install --no-save @anthropic-ai/claude-agent-sdk
    ANTHROPIC_API_KEY=... npm run evaluate:claude -- --case web-extraction-regression --repeat 1

On PowerShell, set the ANTHROPIC_API_KEY environment variable in the current session. Never commit or print the key.

The adapter loads the local plugin at plugins/frontend-codepen-extractor, copies a dedicated fixture into a fresh temporary directory, initializes a disposable Git repository, records SDK tool hooks, and removes the workspace after writing the report. Its tool hook restricts file access to the workspace and permits only exact read-only verification commands. This is tool-level containment, not an OS/container sandbox; use an ephemeral runner and do not expose sensitive runner data to the agent.

The first executable case is web-extraction-regression. Other prompts do not yet have dedicated workspaces and task-specific assertions; the adapter refuses to run them without AGENT_EVAL_WORKSPACE_ROOT rather than scoring an unrelated repository. Optional controls: CLAUDE_AGENT_EVAL_MODEL (default sonnet), AGENT_EVAL_MAX_TURNS (12), AGENT_EVAL_MAX_BUDGET_USD (1), and AGENT_EVAL_WORKSPACE_ROOT.

## Reports, repeats, history, and costs

    node scripts/evaluation/run-repeated.mjs --adapter "node scripts/adapters/claude-agent-sdk.mjs" --case web-extraction-regression --repeat 3 --output evaluation-results/live.json --history evaluation-results/history.jsonl

Reports include observed tool traces, changed files, actual command results, token counts when returned by the SDK, and cost in USD when returned. Unknown usage stays null, never zero. JSONL history stores one summary per evaluation invocation. GitHub Actions uploads reports as artifacts and keeps a best-effort rolling cache; artifacts are the per-run record.

## Objective checks and evidence

The adapter observes Git status before and after, derives changed paths from Git, runs JavaScript syntax validation, executes scripts/evaluation/check-web-fixture.mjs, and runs git diff --check. Fixture assertions cover animation-frame cancellation, resize-listener cleanup, reduced-motion support, textContent, scoped CSS, and accessible HTML relationships. These assertions are specific to this fixture, not universal checks for all scenarios.

PASS, FAIL, and NOT RUN remain distinct. SDK tool calls are recorded from hook events; they are not inferred from the final answer. Final text alone cannot establish that a command succeeded.

## Semantic evaluator choice

DeepEval is the first optional integration because the current suite is scenario-oriented and needs a lightweight judge step over saved outputs. TruLens is a stronger alternative for persistent trace observability and dashboards; Ragas is a stronger fit if retrieval/RAG quality becomes central. This is a scoped choice, not a universal ranking.

Install DeepEval separately and provide OPENAI_API_KEY for its default judge:

    python -m pip install -r evaluation/requirements-deepeval.txt
    OPENAI_API_KEY=... python scripts/evaluation/run_deepeval.py --report evaluation-results/live.json --output evaluation-results/semantic.json

The bridge measures answer relevance and task-completion/evidence honesty separately from deterministic checks. Missing credentials are reported as NOT RUN. Probabilistic judge results must be reviewed alongside case-specific assertions; they never overwrite deterministic statuses.

## Baselines and alerts

The live workflow compares with evaluation/baselines/current.json only if an explicitly approved measured baseline exists. It can alert on pass-rate drops and cost-per-case increases. Until a baseline is approved, comparison is NOT RUN; fixture results must never become a baseline.

The live workflow is manually dispatchable and scheduled weekly, but invokes Claude only when ANTHROPIC_API_KEY is configured in Actions secrets. The optional DeepEval judge runs only when OPENAI_API_KEY is configured. Missing credentials produce explicit skip records, not fake runs.

## Adapter contract and limitations

The generic scripts/evaluate-agent.mjs still validates adapter output. The adapter receives AGENT_EVAL_CASE_ID, AGENT_EVAL_CATEGORY, AGENT_EVAL_PROMPT, AGENT_EVAL_RESULT_PATH, AGENT_EVAL_REPO_ROOT, and optional AGENT_EVAL_WORKSPACE_ROOT. Do not put secrets in reports or traces. Tool arguments and excerpts are capped and the Anthropic key is redacted.

A successful fixture CI run proves only that the harness works. A successful SDK run proves only the selected scenario, model, and configuration; it does not mean all eight prompts have passed. Add a dedicated fixture and objective checks before promoting another scenario to live CI.
