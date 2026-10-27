# Frontend Architect Planner

The `frontend-architect-planner` subagent is a read-only planning gate. It examines the request and repository conventions, then returns a versioned YAML implementation plan. It does not modify files or invoke a developer agent.

## Invocation

Ask Claude Code to delegate to `frontend-architect-planner`, providing the original request and any acceptance criteria. The planner must inspect the actual target package and Git status rather than relying on a summary.

## Approval gate

The YAML output must include `human_approval.status: PENDING` and `required_before_implementation: true`. Review the scope, file list, dependencies, tests, risks, and rollback. Only after explicit human approval may a separate implementation workflow begin. Approval of a plan is not approval to merge or deploy.

## Statuses

- `READY`: enough evidence exists for a bounded plan; human approval is still required.
- `NEEDS_INPUT`: a material decision or requirement is missing.
- `BLOCKED`: repository access or evidence prevents a responsible plan.

## Required plan contents

The `schema_version: 1` YAML contract includes repository evidence, traceable requirements, a recommended approach and alternatives, ordered tasks and dependencies, automated/manual/live verification, risks, rollback, open questions, and a pending approval object. Every requirement maps to an acceptance test. Planned file paths must be checked against repository contents.

## Verification and evaluation

Static validation uses the pinned `yaml` parser to parse actual YAML, rejects duplicate keys and malformed documents, and checks required fields and the mandatory approval state. Contract tests cover valid and invalid plan documents, profile frontmatter, and scenario definitions. Deterministic evaluation cases cover missing requirements, unsupported assumptions, dependency approval, and the mandatory human gate. These checks validate the contract and scenarios, not the reasoning quality of a live model.

Run:

```sh
node scripts/validate-agent.mjs
node scripts/test-agent.mjs
npm run evaluate:fixture
```

A live model evaluation is separate and opt-in. Install the pinned project dependencies and Claude Agent SDK, configure authentication without printing or committing secrets, then run `npm run evaluate:planner:live -- --case clear-repository-backed-plan --output /tmp/planner-live.json`. Omit `--case` to evaluate all six scenarios. The report records model/runtime, output, schema result, elapsed time, and cost/usage where returned. Schema-valid outputs are marked `SCHEMA_PASS_SEMANTIC_REVIEW_REQUIRED`; a human must assess required/forbidden behavior. Missing credentials means no model invocation and `NOT RUN`, never PASS.

## Limitations

The profile is an instruction set, not an enforcement boundary. Tool permissions and host controls must be configured independently. The repository does not automatically approve plans, launch implementation, merge pull requests, or deploy.