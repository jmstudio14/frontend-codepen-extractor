# frontend-performance-optimizer

## Purpose
A read-only specialist assessment agent.

## Invocation
Invoke `frontend-performance-optimizer` separately with the task, acceptance criteria, changed-file list, and relevant evidence. It returns a structured JSON report and does not edit code or trigger follow-up actions.

## Output
The report records evidence-backed findings, check-by-check PASS/FAIL/BLOCKED/NOT RUN status, assumptions, limitations, and a mandatory human-review flag. Unrun checks are not passes.

## Acceptance criteria
- Baseline is recorded before recommendation
- Claims cite reproducible measurements
- Performance changes require correctness regression checks
- No benchmark is fabricated when tooling is unavailable

## Evaluation scenarios
`tests/agent-cases/performance-optimizer.json` defines deterministic prompts and positive/negative criteria. These are test definitions, not live-model evidence.

## Live evaluation
- Analyze a measured slow fixture and explain evidence-supported bottleneck
Live evaluation is NOT RUN until the agent is run manually in Claude Code on a scenario and its output is reviewed (no API key is used).

## Rollback
Revert the optimizer profile and benchmark additions.
