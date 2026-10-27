# agent-run-diagnostics

Read-only triage of failed agent runs. It separates observed facts from hypotheses, redacts sensitive data, and recommends bounded diagnostic steps without retrying or changing state.

## Acceptance criteria
- Facts are separated from hypotheses
- Sensitive values are redacted
- Each recommendation is reproducible
- No infinite retry recommendation

## Test scenarios
See `tests/agent-cases/diagnostics.json`. Test definitions do not prove live performance.

## Live evaluation
- Diagnose a synthetic failed run with ground-truth labels
Live evaluation is NOT RUN until the agent is run manually in Claude Code on a scenario and its output is reviewed (no API key is used).

## Rollback
Remove the diagnostics agent and evaluation suite.
