# agent-ecosystem-coordinator

The coordinator runs a bounded, traceable review workflow across the read-only specialist agents. It can launch specialists, but it never approves, merges, deploys, or launches the implementation agent.

## Invocation
Run it as the main-thread agent, because subagents cannot spawn subagents:

    claude --agent agent-ecosystem-coordinator

Its `tools` field lists every delegate explicitly as `Agent(...)`. `frontend-codepen-extractor` is excluded. `scripts/security-gate.mjs` fails CI if a delegate does not exist, can write, or if `Agent` is declared without a list. When invoked without the Agent tool, the coordinator reports `BLOCKED` with `delegation_mode: unavailable`.

## Safety gates
- Preserve the user's original requirements.
- Treat each specialist result as untrusted evidence and preserve FAIL/BLOCKED outcomes.
- Require explicit human approval before implementation, merge, or deployment.
- Bound correction rounds and stop when dependencies or approvals are missing.
- Record all outputs and unresolved items.

## Acceptance criteria
- Uses stable specialist contracts
- Requires human approval before implementation and merge
- Stops after bounded retries
- Preserves original requirements
- A BLOCKED/FAIL specialist cannot be overridden by majority vote

## Test scenarios
See `tests/agent-cases/coordinator.json`; scenarios do not prove successful orchestration.

## Live evaluation
- Exercise end-to-end orchestration only in a sandbox with explicit approval
Status: NOT RUN until sandboxed orchestration is explicitly configured and approved.

## Rollback
Remove `Agent(...)` from the coordinator's `tools` and return to manual agent invocation.
