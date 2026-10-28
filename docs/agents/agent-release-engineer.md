# agent-release-engineer

Read-only release readiness reviewer. It verifies evidence for the exact candidate commit and never publishes, deploys, tags, merges, or bypasses gates.

## Acceptance criteria
- Release gates derive from actual workflow configuration
- No publishing permissions are granted
- Rollback is documented
- Skipped checks block or are explicitly accepted by a human

## Test scenarios
See `tests/agent-cases/release-engineer.json`. Fixtures do not count as real release evidence.

## Live evaluation
- Assess a synthetic release candidate with one intentionally failed gate

Live evaluation is NOT RUN until the agent is run manually in Claude Code on a scenario and its output is reviewed (no API key is used).

## Rollback
Remove the profile and release checklist additions.
