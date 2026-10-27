# Agent ecosystem build loop

## Purpose

Build the missing specialist agents one at a time, with a reviewable plan for each agent. This is a **human-approved build loop**, not an autonomous loop that can create files, merge PRs, or deploy without review.

The existing developer agent and the proposed independent auditor are not recreated by this queue. The auditor PR (#4) is currently open; work depending on its files must remain based on that branch until the PR is merged.

## Non-negotiable rules

1. Work on one agent per pull request. Do not batch multiple agents into a single implementation PR.
2. Read the current repository state, open PRs, scripts, tests, and conventions before planning each agent.
3. Produce and validate that agent's plan before implementing it.
4. Require explicit human approval of the plan before code changes begin.
5. Keep each agent's permissions minimal. Reviewer agents default to read-only; no agent may merge or deploy on its own.
6. Add deterministic contract tests and adversarial/negative cases for every agent.
7. Evaluate with a real model when credentials and an approved runtime are available. If not run, mark the live evaluation SKIPPED / NOT RUN; never count fixtures as a live pass.
8. Run the repository's required checks and independent audit before asking for merge.
9. Stop after two correction rounds by default. Escalate unresolved failures or blocked evidence to a human.
10. Update `evaluation/agent-build-queue.json` only with evidence-backed status changes. A checklist or plan is not proof that an agent has been implemented.

## Loop for every queue item

```text
while there are queued agents:
  select the highest-priority agent whose dependencies are satisfied
  inspect repository and open PR state
  write an agent-specific plan:
    goal, non-goals, tools/permissions, inputs, outputs, dependencies,
    files, acceptance criteria, tests, live-evaluation cases, risks, rollback
  validate the plan schema and present it for human approval
  if approval is missing or denied:
    stop; do not implement
  create a dedicated branch from the correct current base
  implement only this agent and its directly required tests/docs
  run deterministic tests and repository validation
  run live model evaluation if explicitly configured; otherwise record NOT RUN
  request independent read-only audit and address findings (max two rounds)
  open a PR; do not merge automatically
  after human merge, record merged commit and evidence in the queue
  move to the next dependency-ready agent
```

## Per-agent plan template

Each implementation PR must include these sections in its description or linked plan:

- **Problem and goal:** which concrete failure or capability gap this agent addresses.
- **Scope / non-goals:** what it may and may not change.
- **Inputs and outputs:** stable, versioned contract; structured output where practical.
- **Tools and permissions:** explicit allowlist and forbidden operations.
- **Dependencies:** required agents, scripts, fixtures, credentials, or infrastructure.
- **Files:** existing files to update and new files to add, confirmed against the branch.
- **Acceptance criteria:** observable and independently verifiable conditions.
- **Tests:** positive, negative, edge, security, regression, and contract tests.
- **Live evaluation:** fixed scenarios, scoring rubric, model/runtime metadata, cost and latency where available.
- **Failure policy:** PASS / FAIL / BLOCKED or equivalent; missing evidence must not be treated as success.
- **Human gates:** plan approval before implementation; PR approval before merge; explicit approval for sensitive actions.
- **Rollback:** how to disable/remove the agent or revert its integration safely.

## Delivery gates

An agent is ready for a PR only when:
- its profile and documentation agree;
- permissions and output contract are tested;
- mandatory deterministic checks pass;
- live evaluation is either evidenced or honestly marked NOT RUN;
- no critical/high issue remains unresolved;
- the PR contains only the scoped agent and its necessary integration;
- the human reviewer can see the plan, test evidence, limitations, and rollback.

## Initial sequence

The queue prioritizes planning and testable safety foundations before orchestration. The coordinator comes last because it must consume stable contracts from the specialist agents rather than inventing their behavior.

See [the machine-readable queue](../evaluation/agent-build-queue.json) for each agent's individual plan, dependencies, acceptance criteria, and status.
