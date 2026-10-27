# frontend-privacy-compliance-reviewer

Read-only review of privacy, authorization, data minimization, attribution, retention, and compliance risks. The agent distinguishes technical evidence from policy/legal questions and does not provide definitive legal advice.

## Acceptance criteria
- No legal certainty is invented
- Authorization and data minimization are explicit
- Sensitive data is not reproduced in reports
- Human escalation is defined

## Test scenarios
See `tests/agent-cases/privacy-compliance-reviewer.json`; these are test definitions, not live model results.

## Live evaluation
- Review a synthetic extraction request with authorization and privacy ambiguities
Live evaluation is NOT RUN until the agent is run manually in Claude Code on a scenario and its output is reviewed (no API key is used).

## Rollback
Remove reviewer and documentation from its dedicated PR.
