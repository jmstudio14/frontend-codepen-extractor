# agent-model-evaluator

## Purpose
Read-only specialist agent.

## Invocation
Invoke `agent-model-evaluator` separately with the change/request, source-of-truth files, and acceptance criteria. The agent returns an evidence-linked JSON report and never edits files or publishes content.

## Output and review
Reports distinguish observed evidence, assumptions, recommendations, and NOT RUN checks. Human review remains required; no finding should be presented as verified without supporting evidence.

## Acceptance criteria
- All candidates use equivalent tasks and scoring
- Credentials are never logged
- Repeated runs and uncertainty are recorded
- Missing live credentials yield NOT RUN

## Deterministic scenarios
See `tests/agent-cases/model-evaluator.json`. Scenarios define what to test; they do not constitute live-model performance evidence.

## Live evaluation
- Run only when explicit runtime and credentials are configured
Live evaluation is NOT RUN until an explicit runtime and credentials are configured and actual outputs reviewed.

## Rollback
Revert evaluator additions without changing the selected production runtime.
