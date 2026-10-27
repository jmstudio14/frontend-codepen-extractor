# Independent code auditor

The repository now includes a separate Claude Code subagent profile at `.claude/agents/frontend-code-auditor.md`. It is deliberately read-only: it can inspect files and run project checks, but has no Edit or Write tool. The implementation agent remains responsible for fixes; the auditor independently re-checks the corrected diff.

## When to use it

After the implementation agent has completed a change and its first real run has been recorded, invoke the auditor in Claude Code using the `frontend-code-auditor` subagent (for example, ask Claude Code to delegate the review to `frontend-code-auditor`). Give it the original task, acceptance criteria, and the branch/commit or working tree to inspect. Do not pass only the implementer's summary.

## Audit loop

1. Preserve the developer's report and identify the exact commit/diff under review.
2. Run the independent audit with read-only file access and safe test execution.
3. If the verdict is `FAIL`, return actionable findings to the implementation agent.
4. The implementation agent fixes the findings in its own working context.
5. Re-run the auditor against the updated diff and rerun required tests.
6. Stop after at most two correction rounds by default. If still failing or blocked, require human review.

## Delivery gate

- `PASS`: required criteria and checks have evidence, with no unresolved critical/high findings.
- `FAIL`: a mandatory criterion or required check fails, or a critical/high defect is confirmed.
- `BLOCKED`: essential evidence or tooling is unavailable. This is not approval.

A review is not a test sandbox or a security boundary. Keep host permissions least-privileged, run untrusted code in an ephemeral isolated environment, and require human approval for merge/deployment. The agent profile does not automatically trigger itself in CI; end-to-end auditing is measured manually in Claude Code (see the [measurement protocol](measurement-protocol.md)), not claimed.

## Honest status

The auditor profile and review protocol are implemented as repository instructions. This alone does not prove that the auditor has audited any live agent output. Record the first real developer-agent run separately, then use this auditor on that run's resulting code/workspace.