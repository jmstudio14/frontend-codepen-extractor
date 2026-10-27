# frontend-extractor-validation-agent

## Purpose
A read-only specialist assessment agent.

## Invocation
Invoke `frontend-extractor-validation-agent` separately with the task, acceptance criteria, changed-file list, and relevant evidence. It returns a structured JSON report and does not edit code or trigger follow-up actions.

## Output
The report records evidence-backed findings, check-by-check PASS/FAIL/BLOCKED/NOT RUN status, assumptions, limitations, and a mandatory human-review flag. Unrun checks are not passes.

## Acceptance criteria
- HTML/CSS/JS/resource checks are distinct
- Dynamic limitations are explicit
- Source URLs and provenance are recorded
- Network failures are not reported as success

## Evaluation scenarios
`tests/agent-cases/extractor-validation.json` defines deterministic prompts and positive/negative criteria. These are test definitions, not live-model evidence.

## Live evaluation
- Validate a permitted representative page
- Report inaccessible source without fabricating content
Live evaluation remains NOT RUN until an explicit runtime and credentials are configured and actual outputs are reviewed.

## Rollback
Revert the dedicated validation-agent PR and retain existing extractor behavior.
