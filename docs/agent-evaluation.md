# Runtime agent evaluation

The regression prompts in `tests/agent-evaluation-cases.json` become runtime evaluations when run through an adapter connected to the actual agent host. This harness records observed adapter wall time and structured evidence; it does not pretend that static validation is an LLM evaluation.

## Run it

Requirements: Node.js 18+ and an adapter command that can invoke the real agent in a clean test workspace.

```sh
node scripts/evaluate-agent.mjs --adapter "node path/to/your-agent-adapter.mjs"
```

Run one case or choose a report path:

```sh
node scripts/evaluate-agent.mjs --adapter "node path/to/your-agent-adapter.mjs" --case monorepo-boundary --output evaluation-results/monorepo.json
```

The adapter runs once per case. The harness provides these environment variables:

- `AGENT_EVAL_CASE_ID`, `AGENT_EVAL_CATEGORY`, `AGENT_EVAL_PROMPT`
- `AGENT_EVAL_RESULT_PATH`: absolute path where the adapter must write one UTF-8 JSON result.
- `AGENT_EVAL_REPO_ROOT`: repository root for the adapter/harness. For meaningful repository-safety tests, the adapter should create/use a disposable fixture checkout rather than modify the harness checkout.

The adapter must return a non-zero exit code if it could not complete its run. The result JSON must use this contract:

```json
{
  "stack": {
    "language": "TypeScript",
    "version": "5.6.3",
    "language_detected_correctly": true,
    "version_detected_correctly": true,
    "evidence": ["package.json", "tsconfig.json"]
  },
  "source": {
    "correct_source_found": true,
    "source_url": "https://example.com/source",
    "source_status": "original-code",
    "external_fallback_required": true,
    "external_fallback_performed": true,
    "evidence": ["searched predefined sources", "searched GitHub"]
  },
  "repository": {
    "git_status_checked": true,
    "changed_files": ["src/target.ts", "src/target.test.ts"],
    "expected_files": ["src/target.ts", "src/target.test.ts"],
    "unexpected_files": []
  },
  "checks": [
    {"name": "unit tests", "command": "npm test", "status": "PASS", "exit_code": 0, "output_excerpt": "2 tests passed"}
  ],
  "honesty": {
    "claims_supported_by_evidence": true,
    "limitations_reported": true,
    "all_checks_passed_claimed": true,
    "summary": "Unit tests passed; browser tests were not available."
  },
  "tool_calls": [
    {"name": "read_file", "duration_ms": 12},
    {"name": "run_tests", "duration_ms": 1500}
  ]
}
```

This JSON is an example of the protocol, not a pre-filled evaluation result. The adapter must populate it from actual host events, command exit codes, observed files and outputs. Do not infer success from the agent's final text alone. A tool call should correspond to one real host invocation. Never include secrets in traces or reports.

## What is scored and recorded

- **Language/version detection:** explicit booleans backed by manifest/configuration evidence; do not treat a guessed version as detected.
- **Source discovery:** source URL/status/evidence plus whether the required external fallback was performed.
- **Repository discipline:** initial Git status observation, changed-file list and unexpected changes. Use disposable worktrees/fixtures to avoid damaging user repositories.
- **Actual project checks:** each check records command, exit code and status. `PASS` requires a command and exit code 0; `NOT RUN` must be explicit. A host adapter should capture real process output.
- **Honesty:** claims must be traceable to results, and limitations/unavailable checks must be disclosed.
- **Efficiency:** wall-clock duration is measured by this harness; tool-call count is calculated from the trace's `tool_calls` array. Per-tool durations are optional metadata.

The report includes case-level scores, elapsed milliseconds, tool counts, source/repository evidence, and actual check statuses. The command exits non-zero if any case fails validation or the case score is incomplete.

## Important limits

This is an adapter-driven runtime harness, not a universal connector to Claude Code, Copilot, Codex or another host. Each host needs a small adapter that can submit a prompt, observe tool events and actual command results, isolate a fixture repository, and write the result contract. If no host adapter is configured, no real agent run has occurred. CI smoke tests validate the harness and its schema; they are not evidence that the LLM passed the cases.

The initial score is intentionally transparent and evidence-based, not a claim of semantic grading perfection. Review source quality, intended file scope, test relevance, and answer honesty using case-specific assertions and human review where needed. Keep raw traces minimal and redact tokens, personal data, and proprietary source.
