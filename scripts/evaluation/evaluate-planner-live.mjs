#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/architect-planner-cases.json'), 'utf8'));
const selected = arg('--case');
const cases = selected ? suite.cases.filter((item) => item.id === selected) : suite.cases;
const outputPath = arg('--output') || path.join(os.tmpdir(), 'architect-planner-live-report.json');
if (!cases.length) { console.error('No matching architect planner case.'); process.exit(2); }
if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_USE_BEDROCK && !process.env.CLAUDE_CODE_USE_VERTEX && !process.env.CLAUDE_CODE_USE_FOUNDRY) {
  console.error('Authentication is not configured; no live model invocation started.'); process.exit(2);
}
const profile = fs.readFileSync(path.join(root, '.claude/agents/frontend-architect-planner.md'), 'utf8');
const { query } = await import('@anthropic-ai/claude-agent-sdk');
const reports = [];
for (const item of cases) {
  const started = Date.now(); let output = ''; let usage = null; let cost = null; let subtype = null;
  const hooks = { PreToolUse: [{ matcher: '.*', hooks: [async (event) => {
    const name = event.tool_name || event.toolName || '';
    const input = event.tool_input || event.toolInput || {};
    if (['Write', 'Edit', 'NotebookEdit'].includes(name)) return { decision: 'block', reason: 'Planner evaluation is read-only.' };
    if (name === 'Bash') {
      const command = String(input.command || '').trim();
      const allowed = ['git status --short', 'git ls-files', 'node --version', 'cat package.json', 'find . -maxdepth 2 -type f'];
      if (!allowed.includes(command)) return { decision: 'block', reason: 'Command is not on the read-only evaluation allowlist.' };
    }
    if (!['Read', 'Grep', 'Glob', 'Bash'].includes(name)) return { decision: 'block', reason: 'Tool is not allowed in the read-only planner evaluation.' };
    return {};
  }] }] };
  const prompt = 'Follow this planning-only agent contract exactly; do not implement or edit files.\n\n' + profile + '\n\nScenario: ' + item.prompt + '\n\nReturn only the single YAML document required by the profile. Use real repository evidence where relevant. Keep human_approval.status PENDING. Do not claim checks ran unless observed.';
  try {
    for await (const message of query({ prompt, options: { cwd: root, settingSources: [], model: process.env.CLAUDE_AGENT_EVAL_MODEL || 'sonnet', maxTurns: Number(process.env.AGENT_PLANNER_MAX_TURNS || 8), maxBudgetUsd: Number(process.env.AGENT_PLANNER_MAX_BUDGET_USD || 1), permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, tools: ['Read', 'Grep', 'Glob', 'Bash'], allowedTools: ['Read', 'Grep', 'Glob', 'Bash'], disallowedTools: ['Write', 'Edit', 'NotebookEdit', 'WebSearch', 'WebFetch', 'Agent'], hooks } })) {
      if (message?.type === 'assistant' && Array.isArray(message.message?.content)) for (const part of message.message.content) if (part.type === 'text') output += part.text;
      if (message?.type === 'result') { subtype = message.subtype || null; usage = message.usage || message.modelUsage || null; cost = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : (typeof message.totalCostUsd === 'number' ? message.totalCostUsd : null); }
    }
    const doc = parseDocument(output, { uniqueKeys: true, strict: true });
    const errors = doc.errors.map((error) => error.message); const plan = errors.length ? null : doc.toJS();
    if (!plan) errors.push('Output is not valid YAML.');
    if (plan && plan.schema_version !== 1) errors.push('schema_version must equal 1.');
    if (plan && !['READY', 'NEEDS_INPUT', 'BLOCKED'].includes(plan.status)) errors.push('Invalid status.');
    if (plan && (plan.human_approval?.status !== 'PENDING' || plan.human_approval?.required_before_implementation !== true || plan.human_approval?.approved_by !== null)) errors.push('Human approval gate is missing or not pending.');
    for (const key of ['repository_evidence', 'requirements', 'tasks', 'dependencies', 'risks', 'open_questions']) if (plan && !Array.isArray(plan[key])) errors.push(key + ' must be an array.');
    reports.push({ id: item.id, status: errors.length ? 'FAIL' : 'SCHEMA_PASS_SEMANTIC_REVIEW_REQUIRED', schema_valid: errors.length === 0, elapsed_ms: Date.now() - started, token_usage: usage, cost_usd: cost, result_subtype: subtype, required_behavior: item.must, forbidden_behavior: item.must_not, semantic_review_required: true, errors, output });
  } catch (error) { reports.push({ id: item.id, status: 'NOT RUN', elapsed_ms: Date.now() - started, error: error.message, semantic_review_required: true }); }
}
const summary = { schema_version: 1, generated_at: new Date().toISOString(), model: process.env.CLAUDE_AGENT_EVAL_MODEL || 'sonnet', runtime: 'claude-agent-sdk', cases: reports, schema_passed: reports.filter((item) => item.schema_valid).length, schema_failed: reports.filter((item) => item.status === 'FAIL').length, not_run: reports.filter((item) => item.status === 'NOT RUN').length, semantic_review_required: true, note: 'Schema validity is not semantic quality approval; inspect each output against its required and forbidden behavior.' };
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ output: path.resolve(outputPath), schema_passed: summary.schema_passed, schema_failed: summary.schema_failed, not_run: summary.not_run, semantic_review_required: true }, null, 2));
if (summary.schema_failed || summary.not_run) process.exitCode = 1;
