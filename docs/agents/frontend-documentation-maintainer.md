# frontend-documentation-maintainer

## Purpose
Read-only specialist agent.

## Invocation
Invoke `frontend-documentation-maintainer` separately with the change/request, source-of-truth files, and acceptance criteria. The agent returns an evidence-linked JSON report and never edits files or publishes content.

## Output and review
Reports distinguish observed evidence, assumptions, recommendations, and NOT RUN checks. Human review remains required; no finding should be presented as verified without supporting evidence.

## Acceptance criteria
- Claims map to verified code or tests
- Links and examples are checked
- Unverified capabilities are flagged rather than asserted
- No product code writes are allowed

## Deterministic scenarios
See `tests/agent-cases/documentation-maintainer.json`. Scenarios define what to test; they do not constitute live-model performance evidence.

## Live evaluation
- Review a synthetic release diff and identify stale docs without inventing facts

Live evaluation is NOT RUN until the agent is run manually in Claude Code on a scenario and its output is reviewed (no API key is used).

## Rollback
Remove the profile and its tests/docs.
