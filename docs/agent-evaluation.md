# Agent evaluation

This project evaluates the agent with no API key and no paid model calls. There are two separate paths:

- `npm run evaluate:fixture` is a deterministic smoke test of the harness. It is not an LLM evaluation.
- The **manual mode** (`scripts/evaluation/manual-eval.mjs`) measures the real agent. You work on a prepared fixture in Claude Code with your normal subscription, and a script scores the result. See [measurement-protocol.md](measurement-protocol.md).

If neither the manual mode nor any other adapter has produced a scored report, no real agent run has occurred.

## Deterministic harness

`scripts/evaluate-agent.mjs --adapter "<command>"` runs one adapter process per scenario in `tests/agent-evaluation-cases.json` and validates the JSON it writes to `AGENT_EVAL_RESULT_PATH`. It records the wall-clock duration, tool calls, changed files, check statuses and honesty assertions.

The harness rejects any of the following:
- unsupported PASS claims;
- missing evidence fields;
- skipped required external search;
- unchecked Git status;
- unexpected file changes;
- failed objective checks (`objective.passed: false`).

CI runs it with the deterministic adapter `tests/fixtures/evaluation-adapter.mjs`, which only proves that the harness works.

The adapter receives `AGENT_EVAL_CASE_ID`, `AGENT_EVAL_CATEGORY`, `AGENT_EVAL_PROMPT`, `AGENT_EVAL_RESULT_PATH` and `AGENT_EVAL_REPO_ROOT`. Do not put secrets in reports.

## Fixtures and objective checks

Four cases are executable. Each one has a fixture under `tests/fixtures/<name>/`, with a `fixture.json` manifest that declares its `case_id`, source and editable files, assertion script and browser expectations:

| Case | Fixture |
| --- | --- |
| `web-extraction-regression` | leaky-animation-prototype |
| `dynamic-js-widget` | dynamic-js-widget |
| `broken-html-card` | broken-html-card |
| `external-deps-gallery` | external-deps-gallery |

The other prompts have no dedicated workspace or task-specific assertions. The manifest and assertion script are never copied into the agent's workspace. Reference solutions live outside it, in `tests/fixture-solutions/`, and the smoke tests prove that each assertion fails on the untouched fixture and passes on its solution.

Scoring runs these checks:
- JavaScript syntax validation;
- the fixture's assertion script;
- `scripts/evaluation/browser-check.mjs`;
- `git diff --check`;
- a check that only editable files changed.

Any FAIL marks the run FAIL.

The browser check runs only when Playwright is installed; otherwise it records NOT RUN. It loads `index.html` from `file://` with all other network requests blocked, and fails on any of these:
- page errors;
- a hidden root element;
- horizontal overflow at 360px;
- missing accessible names;
- a failed interaction or literal-text expectation;
- timers and listeners left behind after the declared teardown.

Screenshots are saved for human review. Visual parity is judged by a person, not by pixel comparison.

PASS, FAIL and NOT RUN remain distinct. The agent's final text alone cannot establish that a command succeeded; only the scored checks can.

## Limitations

A green fixture CI run proves only that the harness and the checks work. A manual PASS proves only that scenario, with the model and configuration that Claude Code used for that session. It does not mean that every prompt in the suite passes. The assertions are specific to each fixture, not universal quality checks. Add a dedicated fixture with objective checks before treating another scenario as measured.
