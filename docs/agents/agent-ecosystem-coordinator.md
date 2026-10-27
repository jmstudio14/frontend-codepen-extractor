# agent-ecosystem-coordinator

The coordinator defines a bounded, traceable workflow across specialist agents. This profile does not enable automatic agent invocation, approval, merge, or deployment.

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
Disable coordinator entry point and return to manual agent invocation.
