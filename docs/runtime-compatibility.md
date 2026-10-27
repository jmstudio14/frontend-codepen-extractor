# Runtime compatibility assessment

## Why the runtime is not preselected

The repository is a portable Agent Skill plus a native Claude Code plugin. The existing evaluator accepts an adapter command, so the evaluation contract can stay runtime-neutral. The current Claude adapter is a candidate, not proof that Claude is the only compatible runtime.

Run the evidence-based assessment without installing any SDK or invoking a model:

```bash
node scripts/evaluation/assess-runtimes.mjs --output /tmp/runtime-compatibility.json
```

The script validates the scorecard, computes weighted rankings, checks whether SDK packages are already resolvable, records Node/npm/Git versions, and writes an explicit `NOT RUN` for live invocation and SDK smoke tests. It never reads credential values or installs dependencies.

## Weighted criteria

Scores use a qualitative 1–5 scale and weighted sum out of 100. They reflect fit with this repository's current skill/plugin formats and evaluation needs, not model quality or a benchmark.

| Criterion | Weight | What is assessed |
|---|---:|---|
| Native plugin/skill loading | 25% | Can the runtime load this repository's Claude Code plugin directly without reauthoring it? |
| Workspace control/isolation | 20% | Can execution be confined to a disposable workspace and escapes blocked? |
| Tool trace | 20% | Can actual tool invocations, lifecycle and results be observed? |
| Usage/cost | 15% | Are token usage and cost available to the report? |
| Offline testing | 10% | Is there a documented deterministic testing path? |
| Node.js 22 CI fit | 10% | Does the documented runtime fit the existing Node 22 baseline? |

## Current documentation-based comparison

The ranking is calculated from `evaluation/runtime-compatibility.json`. Current static scores:

| Candidate | Score / 100 | Strength | Main gap |
|---|---:|---|---|
| Claude Agent SDK (TypeScript) | 86.0 | Native local plugin/skill loading, hooks, usage/cost reporting | Existing workspace containment is tool-level, not an OS sandbox; live compatibility remains untested |
| OpenAI Agents SDK (TypeScript) | 80.0 | Sandbox-agent support, tracing, usage and deterministic test doubles | Requires an adapter to translate this repository's Claude plugin/skill structure |
| LangGraph.js | 55.0 | Flexible orchestration and graph-level control | More custom tracing normalization and sandbox integration |
| Google ADK JS | 52.0 | TypeScript agent development and evaluation toolkit | More unverified details for this repository's workspace, tracing and usage contract |

Scores are a transparent starting assessment, not runtime measurements. Review the per-criterion evidence and official links in the JSON before changing weights. No SDK has been installed or live-invoked by this assessment.

## Evidence links

- Claude Agent SDK: [overview](https://code.claude.com/docs/en/agent-sdk/overview), [plugins](https://code.claude.com/docs/en/agent-sdk/plugins), [hooks](https://code.claude.com/docs/en/agent-sdk/hooks), [cost and usage](https://code.claude.com/docs/en/agent-sdk/costs).
- OpenAI Agents SDK TypeScript: [overview](https://openai.github.io/openai-agents-js/), [tracing](https://openai.github.io/openai-agents-js/guides/tracing/), [testing](https://openai.github.io/openai-agents-js/guides/testing/), [supported environments](https://openai.github.io/openai-agents-js/guides/troubleshooting/).
- Google ADK JS: [official repository](https://github.com/google/adk-js), [documentation](https://google.github.io/adk-docs/).
- LangGraph.js: [official documentation](https://docs.langchain.com/oss/javascript/langgraph/), [official repository](https://github.com/langchain-ai/langgraphjs).

## Decision

**No runtime is selected yet.** The documentation-based leader is Claude Agent SDK because this repository's existing Claude Code plugin can be loaded by local path and hooks expose tool lifecycle events. That advantage is not enough to claim operational compatibility.

Selection requires:
1. A credential-free import/configuration smoke test on the exact CI Node version.
2. A separately authorized live run on the dedicated fixture.
3. Verification of observed tool traces, command exit codes, workspace boundaries, token/cost metadata and task-specific assertions.
4. Review of the report and a recorded decision.

OpenAI Agents SDK remains a strong alternative if explicit sandboxing and deterministic test doubles outweigh native loading of the Claude plugin. The assessment does not install SDKs.
