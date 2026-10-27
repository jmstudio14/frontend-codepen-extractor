#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { classifyCommand } from './block-dangerous-commands.mjs';
import { findFixture, hostOnlyFiles, listFixtures, validateManifest } from './evaluation/fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
// Tests are queued and awaited in order at the end, so an async test cannot report PASS before it finishes.
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

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
    assert.doesNotMatch(content, /(?:[A-Za-z]:\\Users\\|\/Users\/[^\s]+|\/home\/[^\s]+)/, `${rel} should not contain a machine-specific path`);
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

test('security gate reads agent tools as YAML and blocks agents that inherit every tool', () => {
  const agent = (front) => ({ '.claude/agents/frontend-security-reviewer.md': `---\nname: frontend-security-reviewer\n${front}---\n` });
  const listForm = runGate(agent('tools:\n  - Read\n  - Write\n'));
  assert.equal(listForm.status, 1);
  assert.match(listForm.stderr, /read-only-agent-can-write/);
  assert.equal(runGate(agent('tools:\n  - Read\n  - Grep\n')).status, 0);
  const inherits = runGate(agent('description: no tools field\n'));
  assert.equal(inherits.status, 1);
  assert.match(inherits.stderr, /agent-inherits-all-tools/);
  assert.equal(runGate(agent('disallowedTools: Edit, Write, NotebookEdit\n')).status, 0);
  assert.equal(runGate(agent('tools: Read, Edit\ndisallowedTools: Edit\n')).status, 0);
  const invalid = runGate(agent('description: one: two\ntools: Read\n'));
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /agent-frontmatter-invalid/);
});

test('security gate blocks child_process exec but not RegExp exec, and scans Node helpers under tests', () => {
  const cp = "'node:child_" + "process'";
  for (const source of [
    `import { ex` + `ecSync } from ${cp};\nexecSync('ls');\n`,
    `import * as cp from ${cp};\ncp.ex` + `ec('ls');\n`,
    `const child = require(${cp});\nchild.ex` + `ecSync('ls');\n`,
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, /unapproved-shell-exec/);
  }
  assert.equal(runGate({ 'scripts/a.mjs': `import { spawnSync } from ${cp};\nconst m = /x/.ex` + `ec('x');\n` }).status, 0);
  assert.equal(runGate({ 'scripts/a.mjs': `import { execFileSync } from ${cp};\nexecFileSync('git', ['status']);\n` }).status, 0);
  const helper = runGate({ 'tests/fixtures/demo/check.mjs': 'ev' + 'al(process.argv[2]);\n' });
  assert.equal(helper.status, 1);
  assert.match(helper.stderr, /dynamic-code-execution: tests\/fixtures\/demo\/check\.mjs/);
  assert.equal(runGate({ 'tests/fixtures/demo/app.js': 'ev' + 'al(window.name);\n' }).status, 0, 'browser fixtures may contain seeded defects');
});

test('security gate recognises more token formats, including UTF-16 files, without printing them', () => {
  const samples = {
    'openai-api-key': 'sk-' + 'proj-' + 'Ab1_Cd2-Ef3'.repeat(4),
    'github-fine-grained-token': 'github_' + 'pat_' + 'A1b2C3d4E5_'.repeat(6),
    'slack-token': 'xo' + 'xb-' + '1234567890-abcdefghij',
    'google-api-key': 'AI' + 'za' + 'Sy' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
    'npm-token': 'np' + 'm_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
  };
  for (const [rule, value] of Object.entries(samples)) {
    const run = runGate({ 'notes.md': `value=${value}\n` });
    assert.equal(run.status, 1, rule);
    assert.match(run.stderr, new RegExp(rule));
    assert.ok(!(run.stdout + run.stderr).includes(value), `${rule} value must not be printed`);
  }
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`key=${samples['npm-token']}\n`, 'utf16le')]);
  const run = runGate({ 'notes.txt': utf16 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /npm-token: notes\.txt/);
  const binary = runGate({ 'data.bin': Buffer.from([0, 1, 2, 0]) });
  assert.equal(binary.status, 0);
  assert.match(binary.stdout, /SKIPPED data\.bin \(binary\)/);
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

test('plugin coordinator names only existing agents and records unbundled ones as NOT RUN', () => {
  const agents = new Set(fs.readdirSync(path.join(root, '.claude/agents')).map((file) => file.replace(/\.md$/, '')));
  const plugin = fs.readFileSync(path.join(root, 'plugins/frontend-codepen-extractor/agents/agent-ecosystem-coordinator.md'), 'utf8');
  const named = [...plugin.matchAll(/`(?:frontend-codepen-extractor:)?((?:frontend|agent)-[a-z-]+)`/g)].map((match) => match[1]);
  for (const name of named) assert.ok(agents.has(name), `plugin coordinator names a missing agent: ${name}`);
  const repoDelegates = fs.readFileSync(path.join(root, '.claude/agents/agent-ecosystem-coordinator.md'), 'utf8').match(/Agent\(([^)]*)\)/)[1].split(',').map((item) => item.trim());
  const pluginAgents = new Set(fs.readdirSync(path.join(root, 'plugins/frontend-codepen-extractor/agents')).map((file) => file.replace(/\.md$/, '')));
  const unbundled = repoDelegates.filter((name) => !pluginAgents.has(name));
  assert.ok(unbundled.length > 0);
  for (const name of unbundled) assert.ok(!plugin.includes(`frontend-codepen-extractor:${name}`), `${name} is not bundled and cannot be plugin-scoped`);
  assert.match(plugin, /record it as NOT RUN with the reason "not bundled with the plugin"/);
  assert.doesNotMatch(plugin, /model evaluation|run only if your project provides them/);
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
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 1);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.cases[0].status, 'FAIL');
    assert.ok(report.cases[0].errors.some((error) => /objective fixture checks failed: Fixture quality assertions/.test(error)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('evaluation harness kills a hung adapter with its child processes at the timeout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-timeout-'));
  try {
    const adapter = path.join(dir, 'hang.mjs');
    // The grandchild inherits the output pipes, as a real agent started by a shell would.
    fs.writeFileSync(adapter, `import { spawn } from 'node:child_process';
spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'inherit' });
setTimeout(() => {}, 120000);
`);
    const reportPath = path.join(dir, 'report.json');
    const started = Date.now();
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--timeout-ms', '1500', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.ok(Date.now() - started < 30000, 'the harness must not wait for the orphaned grandchild');
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.cases[0].adapter_timed_out, true);
    assert.ok(report.cases[0].errors.some((error) => /timed out after 1500 ms/.test(error)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('evaluation harness reports malformed check entries instead of crashing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-null-'));
  try {
    const adapter = path.join(dir, 'adapter.mjs');
    fs.writeFileSync(adapter, `import fs from 'node:fs';
fs.writeFileSync(process.env.AGENT_EVAL_RESULT_PATH, JSON.stringify({
  stack: { language_detected_correctly: true, version_detected_correctly: true },
  source: { correct_source_found: true, external_fallback_required: false, external_fallback_performed: false },
  repository: { git_status_checked: true, correct_files_changed: true, changed_files: [], unexpected_files: [] },
  checks: [null, { name: 'lint', command: 'npm run lint', status: 'PASS', exit_code: 0 }],
  honesty: { claims_supported_by_evidence: true, limitations_reported: true, all_checks_passed_claimed: true, summary: 'null entry' },
  tool_calls: [null],
}));
`);
    const reportPath = path.join(dir, 'report.json');
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.cases[0].status, 'FAIL');
    assert.ok(report.cases[0].errors.includes('checks[0] must be an object'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no file needs a paid API key or keeps stale setup wording', () => {
  for (const rel of ['scripts/adapters/claude-agent-sdk.mjs', 'scripts/evaluation/evaluate-planner-live.mjs', 'scripts/evaluation/run_deepeval.py', 'scripts/evaluation/probe-runtimes.mjs']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, rel + ' must stay removed');
  }
  const run = spawnSync('git', ['grep', '-l', '-E', 'ANTHROPIC_API_KEY|OPENAI_API_KEY|claude-agent-sdk', '--', ':!CHANGELOG.md', ':!scripts/test-agent.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.error, undefined, 'git could not be started: ' + run.error?.message);
  assert.equal(run.status, 1, 'git grep did not run cleanly: ' + run.stderr + run.stdout);
  const stale = spawnSync('git', ['grep', '--untracked', '-l', '-i', '-E', 'credentials (are|is) (explicitly )?configured|runtime and credentials|agent-model-evaluator|authenticated Git access|explicitly selected runtime|explicitly configured runtime|authenticated model|Node\\.js 18\\+|18%2B', '--', ':!CHANGELOG.md', ':!scripts/test-agent.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(stale.error, undefined, 'git could not be started: ' + stale.error?.message);
  assert.equal(stale.status, 1, 'files still contain stale wording: ' + stale.stderr + stale.stdout);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=22');
  assert.doesNotMatch(pkg.description, /runtime evaluation/i);
});

test('build queue records no agent as still in a pull request', () => {
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'evaluation/agent-build-queue.json'), 'utf8'));
  const open = [...queue.existing_agents, ...queue.agents].filter((agent) => agent.status === 'in_pr').map((agent) => agent.name);
  assert.deepEqual(open, []);
});

test('build queue entries are contiguous and point to files that exist', () => {
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'evaluation/agent-build-queue.json'), 'utf8'));
  assert.deepEqual(queue.agents.map((agent) => agent.sequence), queue.agents.map((_, index) => index + 1));
  for (const agent of queue.agents) {
    assert.ok(agent.branch && Array.isArray(agent.files) && agent.files.length, `${agent.name} needs branch and files`);
    assert.equal(agent.planned_files, undefined, `${agent.name} keeps a superseded planned_files list`);
    for (const file of agent.files) assert.ok(fs.existsSync(path.join(root, file)), `${agent.name}: ${file} does not exist`);
    assert.ok(fs.existsSync(path.join(root, '.claude/agents', `${agent.name}.md`)), `${agent.name} has no agent profile`);
  }
});

const manualEval = path.join(root, 'scripts/evaluation/manual-eval.mjs');
test('manual evaluation refuses an unknown case', () => {
  const run = spawnSync(process.execPath, [manualEval, 'prepare', 'python-native-change', '--dir', path.join(os.tmpdir(), `manual-unknown-${process.pid}`)], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /No executable fixture/);
});

test('manual evaluation refuses a workspace inside the repository', () => {
  const dir = path.join(root, 'evaluation-results', `inside-${process.pid}`);
  const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(run.stderr, /outside this repository/);
  assert.equal(fs.existsSync(dir), false);
});

test('manual evaluation still scores changes the agent committed', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-commit-'));
  try {
    const dir = path.join(base, 'run');
    const prepared = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 });
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.match(JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).base_commit, /^[0-9a-f]{40}$/);
    const workspace = path.join(dir, 'workspace');
    fs.writeFileSync(path.join(workspace, 'notes.md'), 'not an editable file\n');
    for (const args of [['add', '-A'], ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'agent commit']]) {
      assert.equal(spawnSync('git', args, { cwd: workspace, encoding: 'utf8' }).status, 0);
    }
    spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    assert.deepEqual(report.repository.unexpected_files, ['notes.md']);
    assert.equal(report.status, 'FAIL');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

for (const fixture of listFixtures(root)) {
  test(`manual evaluation prepares ${fixture.manifest.case_id} without host files and scores fixture FAIL / solution PASS`, () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-'));
    try {
      const dir = path.join(base, 'run');
      const prepared = spawnSync(process.execPath, [manualEval, 'prepare', fixture.manifest.case_id, '--dir', dir], { encoding: 'utf8', timeout: 60000 });
      assert.equal(prepared.status, 0, prepared.stderr);
      const workspace = path.join(dir, 'workspace');
      for (const hostFile of hostOnlyFiles(fixture.manifest)) assert.equal(fs.existsSync(path.join(workspace, hostFile)), false, hostFile + ' must not reach the agent');
      assert.equal(spawnSync('git', ['status', '--short'], { cwd: workspace, encoding: 'utf8' }).stdout.trim(), '');
      assert.match(fs.readFileSync(path.join(dir, 'prompt.txt'), 'utf8'), new RegExp(fixture.manifest.prompt_suffix.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const untouched = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
      assert.equal(untouched.status, 1, untouched.stdout);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).objective.passed, false);
      fs.cpSync(path.join(root, 'tests/fixture-solutions', fixture.name), workspace, { recursive: true });
      const solved = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
      assert.equal(solved.status, 0, solved.stdout + solved.stderr);
      const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
      assert.equal(report.status, 'PASS');
      assert.deepEqual(report.repository.unexpected_files, []);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
}

test('test-report issue form is valid and keeps required, privacy-safe fields', async () => {
  const { parse } = await import('yaml');
  const form = parse(fs.readFileSync(path.join(root, '.github/ISSUE_TEMPLATE/test-report.yml'), 'utf8'));
  assert.equal(form.name, 'Test report');
  assert.ok(form.description && Array.isArray(form.body));
  const ids = form.body.filter((item) => item.id).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'field ids must be unique');
  for (const id of ['scenario', 'result', 'problems', 'honesty', 'environment', 'confirm']) assert.ok(ids.includes(id), `missing field ${id}`);
  const scenarios = form.body.find((item) => item.id === 'scenario').attributes.options;
  for (const fixture of listFixtures(root)) assert.ok(scenarios.includes(`Fixture: ${fixture.manifest.case_id}`), `scenario list misses ${fixture.manifest.case_id}`);
  const confirm = form.body.find((item) => item.id === 'confirm').attributes.options[0];
  assert.equal(confirm.required, true);
  assert.match(confirm.label, /secrets/);
  const config = parse(fs.readFileSync(path.join(root, '.github/ISSUE_TEMPLATE/config.yml'), 'utf8'));
  assert.ok(config.contact_links.every((link) => /^https:\/\//.test(link.url)));
});

test('repository is MIT licensed consistently', () => {
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 jmstudio14/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).license, 'MIT');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'plugins/frontend-codepen-extractor/.claude-plugin/plugin.json'), 'utf8')).license, 'MIT');
});

test('package, marketplace and plugin versions stay identical', () => {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')).version;
  const version = read('package.json');
  assert.equal(read('.claude-plugin/marketplace.json'), version);
  assert.equal(read('plugins/frontend-codepen-extractor/.claude-plugin/plugin.json'), version);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), new RegExp(`badge/version-${version.replace(/\./g, '\\.')}-`));
  assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), new RegExp(`^## ${version.replace(/\./g, '\\.')}$`, 'm'));
});

for (const { name, fn } of queue) {
  try { await fn(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { console.error(`FAIL  ${name}: ${error.message}`); process.exitCode = 1; }
}
console.log(`\nSmoke tests finished: ${passed} passed${process.exitCode ? ', with failures' : ''}.`);
