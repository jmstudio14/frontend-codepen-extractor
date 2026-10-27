#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { classifyCommand } from './block-dangerous-commands.mjs';
import { findFixture, listFixtures, validateManifest } from './evaluation/fixtures.mjs';
import { runStatus, summarizeMessages } from './evaluation/usage.mjs';

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
  try { createRequire(path.join(root, 'package.json')).resolve('yaml'); }
  catch { throw new Error("dependency 'yaml' is not installed; run npm ci --ignore-scripts"); }
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
    assert.equal(report.selected_cases, 11);
    assert.equal(report.passed_cases, 11);
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

test('security gate limits delegation to existing read-only agents', () => {
  const reviewer = '---\nname: frontend-security-reviewer\ntools: Read, Grep\n---\n';
  const developer = '---\nname: frontend-codepen-extractor\ntools: Read, Edit, Write\n---\n';
  const coordinator = (tools) => `---\nname: agent-ecosystem-coordinator\ntools: ${tools}\n---\n`;
  const base = { '.claude/agents/frontend-security-reviewer.md': reviewer, '.claude/agents/frontend-codepen-extractor.md': developer };
  assert.equal(runGate({ ...base, '.claude/agents/agent-ecosystem-coordinator.md': coordinator('Agent(frontend-security-reviewer), Read') }).status, 0);
  for (const [tools, detail] of [
    ['Agent(frontend-security-reviewer, frontend-codepen-extractor), Read', /delegate frontend-codepen-extractor can write/],
    ['Agent(missing-agent), Read', /delegate missing-agent does not exist/],
    ['Agent, Read', /must list its delegates/],
  ]) {
    const run = runGate({ ...base, '.claude/agents/agent-ecosystem-coordinator.md': coordinator(tools) });
    assert.equal(run.status, 1, tools);
    assert.match(run.stderr, detail);
  }
});

test('security gate resolves plugin-scoped delegates and applies read-only rules to plugin agents', () => {
  const plugin = 'plugins/demo/agents/';
  const base = {
    [plugin + 'reviewer.md']: '---\nname: reviewer\ntools: Read, Grep\n---\n',
    [plugin + 'frontend-codepen-extractor.md']: '---\nname: frontend-codepen-extractor\ntools: Read, Edit, Write\n---\n',
  };
  const coordinator = (tools) => ({ [plugin + 'coordinator.md']: `---\nname: coordinator\ntools: ${tools}\n---\n` });
  assert.equal(runGate({ ...base, ...coordinator('Agent(demo:reviewer), Read') }).status, 0);
  for (const [extra, detail] of [
    [coordinator('Agent(demo:frontend-codepen-extractor), Read'), /delegate demo:frontend-codepen-extractor can write/],
    [coordinator('Agent(reviewer), Read'), /delegate reviewer does not exist/],
    [{ [plugin + 'writer.md']: '---\nname: writer\ntools: Read, Write\n---\n' }, /read-only-agent-can-write: plugins\/demo\/agents\/writer\.md/],
  ]) {
    const run = runGate({ ...base, ...extra });
    assert.equal(run.status, 1);
    assert.match(run.stderr, detail);
  }
});

test('plugin agent copies are in sync with .claude/agents', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/sync-plugin-agents.mjs'), '--check'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, `run node scripts/sync-plugin-agents.mjs; stderr: ${run.stderr}`);
});

function withWorkspace(fixture, overlay, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-workspace-'));
  try {
    fs.cpSync(fixture.dir, dir, { recursive: true });
    if (overlay) fs.cpSync(overlay, dir, { recursive: true });
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const browserCheck = (dir, fixture) => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), dir, path.join(fixture.dir, 'fixture.json')], { cwd: root, encoding: 'utf8', timeout: 60000 });
  return { ...run, result: JSON.parse(run.stdout.trim().split(/\r?\n/).pop() || '{}') };
};

test('every executable web-component case has a valid fixture manifest', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const fixtures = listFixtures(root);
  assert.equal(fixtures.length, 4);
  for (const fixture of fixtures) {
    assert.deepEqual(validateManifest(fixture.manifest), [], fixture.name);
    assert.ok(suite.cases.some((item) => item.id === fixture.manifest.case_id), `${fixture.manifest.case_id} is in the suite`);
    for (const file of fixture.manifest.source_files) assert.ok(fs.existsSync(path.join(fixture.dir, file)), `${fixture.name}/${file} exists`);
    assert.ok(fs.existsSync(fixture.checkPath), `${fixture.name} check script exists`);
  }
  assert.equal(findFixture(root, 'python-native-change'), null);
});

for (const fixture of listFixtures(root)) {
  const solution = path.join(root, 'tests/fixture-solutions', fixture.name);
  test(`fixture checks fail on ${fixture.name} and pass on its reference solution`, () => {
    withWorkspace(fixture, null, (dir) => assert.equal(spawnSync(process.execPath, [fixture.checkPath, dir], { encoding: 'utf8' }).status, 1, 'untouched fixture must fail'));
    withWorkspace(fixture, solution, (dir) => {
      const run = spawnSync(process.execPath, [fixture.checkPath, dir], { encoding: 'utf8' });
      assert.equal(run.status, 0, `solution must pass: ${run.stderr}`);
    });
  });
  test(`browser check fails on ${fixture.name} and passes on its reference solution (or is NOT RUN)`, () => {
    const broken = withWorkspace(fixture, null, (dir) => browserCheck(dir, fixture));
    const fixed = withWorkspace(fixture, solution, (dir) => browserCheck(dir, fixture));
    if (broken.result.status === 'NOT RUN') { assert.equal(fixed.result.status, 'NOT RUN'); return; }
    assert.equal(broken.result.status, 'FAIL');
    assert.equal(broken.status, 1);
    assert.equal(fixed.result.status, 'PASS', JSON.stringify(fixed.result.failures));
    assert.equal(fixed.status, 0);
  });
}

test('live adapter refuses unsupported cases and missing credentials without starting a run', () => {
  const resultPath = path.join(os.tmpdir(), `adapter-refusal-${process.pid}.json`);
  const env = { ...process.env, AGENT_EVAL_RESULT_PATH: resultPath };
  for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[key];
  const adapter = path.join(root, 'scripts/adapters/claude-agent-sdk.mjs');
  const unsupported = spawnSync(process.execPath, [adapter], { cwd: root, encoding: 'utf8', env: { ...env, AGENT_EVAL_CASE_ID: 'python-native-change' } });
  assert.equal(unsupported.status, 2);
  assert.match(unsupported.stderr, /No fixture with objective assertions/);
  const noKey = spawnSync(process.execPath, [adapter], { cwd: root, encoding: 'utf8', env: { ...env, AGENT_EVAL_CASE_ID: 'external-deps-gallery' } });
  assert.equal(noKey.status, 2);
  assert.match(noKey.stderr, /authentication missing; no agent run started/);
  assert.equal(fs.existsSync(resultPath), false);
});

test('evaluator fails a case whose objective fixture checks failed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'objective-fail-'));
  try {
    const adapter = path.join(dir, 'adapter.mjs');
    fs.writeFileSync(adapter, `import fs from 'node:fs';
fs.writeFileSync(process.env.AGENT_EVAL_RESULT_PATH, JSON.stringify({
  stack: { language_detected_correctly: true, version_detected_correctly: true },
  source: { correct_source_found: true, external_fallback_required: false, external_fallback_performed: false },
  repository: { git_status_checked: true, correct_files_changed: true, changed_files: ['a.js'], unexpected_files: [] },
  checks: [{ name: 'Fixture quality assertions', command: 'node check.mjs', status: 'FAIL', exit_code: 1 }],
  honesty: { claims_supported_by_evidence: true, limitations_reported: true, all_checks_passed_claimed: false, summary: 'objective failure fixture' },
  objective: { passed: false, failed_checks: ['Fixture quality assertions'] },
  tool_calls: [],
}));
`);
    const reportPath = path.join(dir, 'report.json');
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node ${adapter}`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 1);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.cases[0].status, 'FAIL');
    assert.ok(report.cases[0].errors.some((error) => /objective fixture checks failed: Fixture quality assertions/.test(error)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('usage summary totals per-turn tokens and keeps unknown values null', () => {
  const summary = summarizeMessages([
    { type: 'assistant', message: { model: 'm', usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, output_tokens: 5 }, content: [{ type: 'tool_use', name: 'Read' }] } },
    { type: 'assistant', message: { usage: { input_tokens: 20, cache_read_input_tokens: 100, output_tokens: 7 }, content: [] } },
    { type: 'result', subtype: 'error_max_budget_usd', num_turns: 2, total_cost_usd: 0.5 },
  ]);
  assert.equal(summary.num_turns, 2);
  assert.equal(summary.totals.input_tokens, 30);
  assert.equal(summary.totals.output_tokens, 12);
  assert.equal(summary.totals.cache_creation_input_tokens, null, 'a missing field must not be summed as 0');
  assert.deepEqual(summary.turns[0].tools, ['Read']);
  assert.equal(summary.total_cost_usd, 0.5);
  assert.equal(summary.largest_input_turn.turn, 2);
  assert.equal(summarizeMessages([]).total_cost_usd, null);
  assert.equal(runStatus({ subtype: 'success' }), 'COMPLETED');
  assert.equal(runStatus({ subtype: 'error_max_budget_usd' }), 'BUDGET_EXHAUSTED');
  assert.equal(runStatus({ subtype: 'error_max_turns' }), 'MAX_TURNS');
  assert.equal(runStatus({ error: new Error('Claude Code exceeded max budget') }), 'BUDGET_EXHAUSTED');
  assert.equal(runStatus({ error: new Error('socket hang up') }), 'ERROR');
});

for (const [mode, expected] of [['budget', 'BUDGET_EXHAUSTED'], ['throw', 'ERROR']]) {
  test(`live adapter writes a full report with per-turn usage when the run ends as ${expected} (fake SDK)`, () => {
    const resultPath = path.join(os.tmpdir(), `adapter-fake-${mode}-${process.pid}.json`);
    try {
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/adapters/claude-agent-sdk.mjs')], { cwd: root, encoding: 'utf8', timeout: 120000, env: {
        ...process.env, FAKE_SDK_MODE: mode, AGENT_EVAL_SDK_MODULE: 'tests/fixtures/fake-claude-sdk.mjs', ANTHROPIC_API_KEY: 'fake-not-a-key',
        AGENT_EVAL_CASE_ID: 'dynamic-js-widget', AGENT_EVAL_RESULT_PATH: resultPath,
      } });
      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /\[cost\] turn 2: input 22900/);
      const report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      assert.equal(report.run_status, expected);
      assert.equal(report.usage_breakdown.turns.length, 2);
      assert.equal(report.usage_breakdown.totals.cache_read_input_tokens, 18000);
      assert.deepEqual(report.repository.changed_files, ['widget.js']);
      assert.ok(report.checks.some((check) => check.name === 'Fixture quality assertions' && check.status === 'FAIL'));
      assert.equal(report.cost_usd, mode === 'budget' ? 0.42 : null);
      assert.ok(!JSON.stringify(report).includes('fake-not-a-key'), 'API key must be redacted');
    } finally { fs.rmSync(resultPath, { force: true }); }
  });
}

test('repeated evaluation keeps run status and per-turn usage from a budget-exhausted run (fake SDK)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-usage-'));
  try {
    const output = path.join(dir, 'diagnostic.json');
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/run-repeated.mjs'), '--adapter', 'node scripts/adapters/claude-agent-sdk.mjs', '--case', 'dynamic-js-widget', '--repeat', '1', '--output', output], {
      cwd: root, encoding: 'utf8', timeout: 180000,
      env: { ...process.env, FAKE_SDK_MODE: 'budget', AGENT_EVAL_SDK_MODULE: 'tests/fixtures/fake-claude-sdk.mjs', ANTHROPIC_API_KEY: 'fake-not-a-key' },
    });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(report.cases[0].run_status, 'BUDGET_EXHAUSTED');
    assert.equal(report.cases[0].usage_breakdown.turns.length, 2);
    assert.equal(report.cases[0].objective.passed, false);
    assert.equal(report.cost_usd_total, 0.42);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('live adapter refuses an SDK override outside tests/', () => {
  const resultPath = path.join(os.tmpdir(), `adapter-override-${process.pid}.json`);
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/adapters/claude-agent-sdk.mjs')], { cwd: root, encoding: 'utf8', timeout: 60000, env: {
    ...process.env, AGENT_EVAL_SDK_MODULE: 'scripts/evaluation/usage.mjs', ANTHROPIC_API_KEY: 'fake-not-a-key', AGENT_EVAL_CASE_ID: 'dynamic-js-widget', AGENT_EVAL_RESULT_PATH: resultPath,
  } });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /AGENT_EVAL_SDK_MODULE must point inside tests/);
  assert.equal(fs.existsSync(resultPath), false);
});

console.log(`\nSmoke tests finished: ${passed} passed${process.exitCode ? ', with failures' : ''}.`);
