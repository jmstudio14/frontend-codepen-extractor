# frontend-dependency-license-reviewer

## Purpose
Read-only specialist assessment.

## Invocation
Invoke `frontend-dependency-license-reviewer` separately with the relevant repository state, requested comparison/review, and acceptance criteria. It returns a structured JSON report without changing files.

## Output and review
The report separates evidence from assumptions and provides per-check PASS/FAIL/BLOCKED/NOT RUN status. Human review remains mandatory. Missing credentials or metrics must not be inferred.

## Acceptance criteria
- Versions and licenses are evidence-backed
- Unknown license is not treated as permissive
- No automatic upgrade or install occurs
- Tooling gaps are disclosed

## Evaluation scenarios
See `tests/agent-cases/dependency-license-reviewer.json`. Scenario definitions are not live evaluation results.

## Live evaluation
- Review a lockfile with known synthetic dependency risks
Live evaluation is NOT RUN until the runtime and credentials are explicitly configured and actual outputs reviewed.

## Rollback
Remove reviewer and its reports/tests.
