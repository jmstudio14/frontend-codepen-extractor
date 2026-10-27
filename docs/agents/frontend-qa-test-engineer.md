# frontend-qa-test-engineer

## Purpose
A focused specialist agent for the frontend extraction repository.

## Invocation
Invoke `frontend-qa-test-engineer` as a separate read-only specialist after providing the concrete task, changed-file list, and relevant acceptance criteria. It returns a structured JSON report; it does not modify source code or trigger another agent.

## Output and gate
The report uses `schema_version: 1`, an explicit status, evidence-linked findings, per-check results, assumptions, limitations, and `human_review_required: true`. PASS only means the checks actually performed passed. Missing evidence and unrun checks must be called out.

## Permissions and non-goals
- Read
- Grep
- Glob
- Bash for approved test commands
- Modify product source to make tests pass
- Claim browser coverage without executing a browser

## Acceptance criteria
- Test scope derives from requirements and changed files
- Negative and regression cases are included
- NOT RUN is distinct from PASS
- Test report cites reproducible commands and evidence

## Deterministic scenarios
Scenario definitions live in `tests/agent-cases/qa-test-engineer.json`. They are test inputs and review criteria, not proof that a live model passed. Run the repository validation and test commands on this branch before requesting review.

## Live evaluation
- Plan tests for a multi-file extractor change
- Detect a missing regression test
- Report a browser test that was not run
A live evaluation has not been performed merely by adding these cases. It must be run with an explicitly selected runtime and available credentials, and the actual output must be inspected. Do not expose credentials or record secrets in artifacts.

## Rollback
Revert the dedicated QA-agent PR without changing the developer agent.
