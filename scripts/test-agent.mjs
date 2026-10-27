#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyCommand } from './block-dangerous-commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { console.error(`FAIL  ${name}: ${error.message}`); process.exitCode = 1; }
}

for (const [command, expected] of [
  ['git reset --hard HEAD', 'git-hard-reset'],
  ['git clean -fd', 'git-clean-force'],
  ['git push origin main --force', 'forced-git-push'],
  ['rm -rf ./build', 'recursive-force-delete'],
  ['Remove-Item -Recurse -Force ./dist', 'powershell-recursive-delete'],
  ['npm publish', 'package-publish'],
  ['rmdir /s /q C:\\temp\\fixture', 'windows-delete-tree'],
]) {
  test(`guard classifies destructive command: ${command}`, () => assert.equal(classifyCommand(command), expected));
}

for (const command of [
  'git status --short', 'git diff --check', 'npm test', 'npm run build', 'npm install lucide-react',
  'git push origin main', 'git clean -nfd', 'node scripts/validate-agent.mjs',
]) {
  test(`guard leaves ordinary command to normal permission flow: ${command}`, () => assert.equal(classifyCommand(command), null));
}

test('guard treats empty or non-string command as no match', () => {
  assert.equal(classifyCommand(''), null);
  assert.equal(classifyCommand(null), null);
});

test('no local absolute paths are embedded in project instructions', () => {
  for (const rel of ['CLAUDE.md', '.claude/agents/frontend-codepen-extractor.md']) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(content, /(?:C:\\\\Users\\\\|\/Users\/[^\s]+|\/home\/[^\s]+)/, `${rel} should not contain a machine-specific path`);
  }
});

test('independent auditor agent exists, is read-only, and defines a strict verdict contract', () => {
  const profile = fs.readFileSync(path.join(root, '.claude/agents/frontend-code-auditor.md'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'docs/agent-auditor.md'), 'utf8');
  assert.match(profile, /name: frontend-code-auditor/);
  assert.match(profile, /tools: Read, Grep, Glob, Bash/);
  assert.doesNotMatch(profile.match(/^---[\s\S]*?---/m)?.[0] || '', /\b(Edit|Write)\b/);
  for (const verdict of ['PASS', 'FAIL', 'BLOCKED']) assert.ok(profile.includes(verdict), `missing verdict ${verdict}`);
  assert.match(profile, /Required final report/);
  assert.match(guide, /does not automatically trigger itself in CI/);
});

test('architect planner is read-only and requires pending human approval', () => {
  const profile = fs.readFileSync(path.join(root, '.claude/agents/frontend-architect-planner.md'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'docs/frontend-architect-planner.md'), 'utf8');
  assert.match(profile, /name: frontend-architect-planner/);
  assert.match(profile, /tools: Read, Grep, Glob, Bash/);
  assert.doesNotMatch(profile.match(/^---[\s\S]*?---/m)?.[0] || '', /\b(Edit|Write)\b/);
  for (const key of ['schema_version', 'repository_evidence', 'requirements', 'approach', 'tasks', 'dependencies', 'risks', 'verification', 'rollback', 'human_approval']) assert.ok(profile.includes(key), 'missing YAML contract key ' + key);
  assert.match(profile, /status: PENDING/);
  assert.match(profile, /required_before_implementation: true/);
  assert.match(guide, /only after explicit human approval/i);
});

test('architect planner scenarios parse and have unique IDs with positive and negative criteria', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/architect-planner-cases.json'), 'utf8'));
  assert.equal(suite.schema_version, 1);
  assert.ok(suite.cases.length >= 6);
  const ids = suite.cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of suite.cases) {
    assert.ok(item.prompt?.trim(), item.id + ' needs a prompt');
    assert.ok(item.must?.length, item.id + ' needs positive criteria');
    assert.ok(item.must_not?.length, item.id + ' needs negative criteria');
  }
  assert.ok(suite.cases.some(item => item.id === 'missing-live-runtime'));
});

test('architect plan YAML parser accepts a valid plan and rejects missing approval gate', () => {
  const validator = path.join(root, 'scripts/evaluation/validate-architect-plan.mjs');
  const validPath = path.join(os.tmpdir(), 'architect-plan-valid-' + process.pid + '.yaml');
  const invalidPath = path.join(os.tmpdir(), 'architect-plan-invalid-' + process.pid + '.yaml');
  const valid = `schema_version: 1
status: READY
request_summary: Add a small feature
repository_evidence:
  - path: package.json
    observation: ESM project
    relevance: Existing runtime convention
requirements:
  - id: R1
    requirement: Preserve compatibility
    acceptance_test: Existing tests pass
    source: User request
approach:
  recommendation: Extend existing module
  alternatives_considered: []
  rationale: Smallest change
tasks:
  - id: T1
    description: Implement the bounded change
    files: [src/example.js]
    depends_on: []
    verification: [npm test]
dependencies: []
risks: []
verification:
  automated_tests: [npm test]
  manual_checks: []
  live_evaluation: NOT RUN
  not_run: [Live model credentials unavailable]
rollback: Revert the dedicated change
open_questions: []
human_approval:
  status: PENDING
  required_before_implementation: true
  approved_by: null
`;
  const invalid = valid.replace('status: PENDING', 'status: APPROVED');
  try {
    fs.writeFileSync(validPath, valid);
    fs.writeFileSync(invalidPath, invalid);
    const good = spawnSync(process.execPath, [validator, validPath], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const bad = spawnSync(process.execPath, [validator, invalidPath], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'invalid approval state must fail');
    assert.match(bad.stderr, /human_approval/);
  } finally {
    fs.rmSync(validPath, { force: true });
    fs.rmSync(invalidPath, { force: true });
  }
});

test('evaluation scenario suite parses and declares schema version', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  assert.equal(suite.schema_version, 1);
  assert.ok(Array.isArray(suite.cases));
  assert.ok(suite.cases.length >= 8);
});

test('evaluation scenario IDs are unique and acceptance criteria are non-empty', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const ids = suite.cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of suite.cases) {
    assert.ok(item.prompt?.trim(), `${item.id} needs a prompt`);
    assert.ok(item.must?.length, `${item.id} needs required behavior`);
    assert.ok(item.must_not?.length, `${item.id} needs forbidden behavior`);
  }
});

test('evaluation suite covers core multilingual and extraction risks', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const categories = new Set(suite.cases.map(item => item.category));
  for (const category of ['multilanguage', 'progressive-search', 'provenance', 'verification', 'safety', 'security', 'web-component']) {
    assert.ok(categories.has(category), `missing ${category} scenario`);
  }
});

test('evaluation runtime files and optional integrations exist', () => {
  for (const rel of ['scripts/adapters/claude-agent-sdk.mjs','scripts/evaluation/run-repeated.mjs','scripts/evaluation/check-web-fixture.mjs','scripts/evaluation/compare-baseline.mjs','scripts/evaluation/run_deepeval.py','evaluation/requirements-deepeval.txt','evaluation/baselines/README.md','scripts/evaluation/assess-runtimes.mjs','scripts/evaluation/probe-runtimes.mjs','evaluation/runtime-compatibility.json','docs/runtime-compatibility.md']) assert.ok(fs.existsSync(path.join(root, rel)), rel + ' should exist');
  const adapter = fs.readFileSync(path.join(root, 'scripts/adapters/claude-agent-sdk.mjs'), 'utf8');
  assert.match(adapter, /@anthropic-ai\/claude-agent-sdk/);
  assert.match(adapter, /PostToolUse/);
  assert.match(adapter, /AGENT_EVAL_WORKSPACE_ROOT/);
});

test('runtime evaluation harness executes adapter and writes a measurable report', () => {
  const reportPath = path.join(os.tmpdir(), `agent-evaluation-smoke-${process.pid}.json`);
  try {
    const run = spawnSync(process.execPath, [
      path.join(root, 'scripts/evaluate-agent.mjs'),
      '--adapter', 'node tests/fixtures/evaluation-adapter.mjs',
      '--output', reportPath,
    ], { cwd: root, encoding: 'utf8', timeout: 120000 });
    assert.equal(run.status, 0, `evaluator should pass fixture run; stdout: ${run.stdout}; stderr: ${run.stderr}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.selected_cases, 8);
    assert.equal(report.passed_cases, 8);
    assert.equal(report.failed_cases, 0);
    assert.ok(report.elapsed_ms_total >= 0);
    assert.ok(report.tool_calls_total >= 8);
    assert.equal(report.project_checks.failed, 0);
    assert.equal(report.schema_version, 2);
    assert.ok(Array.isArray(report.cases[0].tool_call_trace));
    assert.equal(report.cases[0].cost_usd, null);
  } finally {
    fs.rmSync(reportPath, { force: true });
  }
});

test('repeated evaluator aggregates runs and appends history', () => {
  const reportPath = path.join(os.tmpdir(), `agent-evaluation-repeat-${process.pid}.json`);
  const historyPath = path.join(os.tmpdir(), `agent-evaluation-history-${process.pid}.jsonl`);
  try {
    const run = spawnSync(process.execPath, [
      path.join(root, 'scripts/evaluation/run-repeated.mjs'),
      '--adapter', 'node tests/fixtures/evaluation-adapter.mjs',
      '--case', 'web-extraction-regression', '--repeat', '2',
      '--output', reportPath, '--history', historyPath,
    ], { cwd: root, encoding: 'utf8', timeout: 120000 });
    assert.equal(run.status, 0, `repeated fixture evaluation should pass; stdout: ${run.stdout}; stderr: ${run.stderr}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.selected_cases, 2);
    assert.equal(report.passed_cases, 2);
    assert.equal(report.repetitions, 2);
    assert.equal(fs.readFileSync(historyPath, 'utf8').trim().split(/\r?\n/).length, 1);
  } finally {
    fs.rmSync(reportPath, { force: true });
    fs.rmSync(historyPath, { force: true });
  }
});

test('runtime compatibility assessment ranks documented candidates without selecting or invoking one', () => {
  const reportPath = path.join(os.tmpdir(), `runtime-compatibility-${process.pid}.json`);
  try {
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/assess-runtimes.mjs'), '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, `runtime assessment should succeed; stdout: ${run.stdout}; stderr: ${run.stderr}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.selection.selected_runtime, null);
    assert.equal(report.selection.status, 'NOT_SELECTED_PENDING_RUNTIME_SMOKE_TEST');
    assert.equal(report.selection.highest_documented_fit_candidate, 'claude-agent-sdk');
    assert.equal(report.environment_probe.live_model_invocation, 'NOT RUN');
    assert.equal(report.environment_probe.sdk_runtime_smoke, 'NOT RUN');
    assert.equal(report.environment_probe.credential_values_read, false);
    assert.equal(report.ranking.length, 4);
    assert.equal(report.ranking[0].weighted_score, 86);
    assert.ok(report.ranking.every(item => item.status === 'DOCUMENTATION_SCORE_ONLY'));
  } finally { fs.rmSync(reportPath, { force: true }); }
});

test('runtime assessment rejects an invalid weighting matrix', () => {
  const matrixPath = path.join(os.tmpdir(), `runtime-matrix-invalid-${process.pid}.json`);
  const valid = JSON.parse(fs.readFileSync(path.join(root, 'evaluation/runtime-compatibility.json'), 'utf8'));
  valid.scoring.criteria[0].weight_percent -= 1;
  fs.writeFileSync(matrixPath, JSON.stringify(valid));
  try {
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/assess-runtimes.mjs'), '--matrix', matrixPath], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /weights must total 100/);
  } finally { fs.rmSync(matrixPath, { force: true }); }
});

test('SDK compatibility probe dry-run is credential-free and does not install or invoke runtimes', () => {
  const reportPath = path.join(os.tmpdir(), `runtime-sdk-dry-run-${process.pid}.json`);
  try {
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/probe-runtimes.mjs'), '--dry-run', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, `probe dry-run should pass; stdout: ${run.stdout}; stderr: ${run.stderr}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.mode, 'DRY_RUN');
    assert.equal(report.credential_values_read, false);
    assert.equal(report.live_model_invocation, 'NOT RUN');
    assert.equal(report.selection.selected_runtime, null);
    assert.equal(report.results.length, 4);
    assert.ok(report.results.every(item => item.status === 'NOT RUN' && item.exact_version === null));
  } finally { fs.rmSync(reportPath, { force: true }); }
});

function runGate(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-gate-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    return spawnSync(process.execPath, [path.join(root, 'scripts/security-gate.mjs'), '--root', dir], { encoding: 'utf8', timeout: 30000 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('security gate passes on the repository', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/security-gate.mjs')], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, `gate should pass; stdout: ${run.stdout}; stderr: ${run.stderr}`);
});

test('security gate blocks a planted secret without printing it', () => {
  const secret = 'sk-' + 'ant-' + 'a1B2c3D4e5F6g7H8i9J0k1L2';
  const run = runGate({ 'notes.md': `key=${secret}\n` });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /anthropic-api-key/);
  assert.ok(!(run.stdout + run.stderr).includes(secret), 'gate must not echo the secret');
});

test('security gate blocks dynamic code execution and unapproved shell mode in scripts', () => {
  const run = runGate({ 'scripts/a.mjs': 'ev' + 'al(process.argv[2]);\n', 'scripts/b.mjs': "spawn(cmd, [], { sh" + "ell: true });\n" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /dynamic-code-execution/);
  assert.match(run.stderr, /unapproved-shell-true/);
});

test('security gate blocks write tools on read-only agents and workflow write permissions', () => {
  const run = runGate({
    '.claude/agents/frontend-security-reviewer.md': '---\nname: frontend-security-reviewer\ntools: Read, Edit\n---\n',
    '.claude/agents/frontend-codepen-extractor.md': '---\nname: frontend-codepen-extractor\ntools: Read, Edit, Write\n---\n',
    '.github/workflows/ci.yml': 'on: push\npermissions: write-all\n',
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /read-only-agent-can-write: \.claude\/agents\/frontend-security-reviewer\.md/);
  assert.doesNotMatch(run.stderr, /frontend-codepen-extractor/);
  assert.match(run.stderr, /workflow-write-all/);
  assert.match(run.stderr, /workflow-default-permissions/);
});

console.log(`\nSmoke tests finished: ${passed} passed${process.exitCode ? ', with failures' : ''}.`);
