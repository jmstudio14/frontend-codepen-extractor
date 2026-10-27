#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { classifyCommand } from './block-dangerous-commands.mjs';
import { findFixture, hostOnlyFiles, isMissingBrowserDownload, listFixtures, validateManifest } from './evaluation/fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let notRun = 0;
// Tests are queued and awaited in order at the end, so an async test cannot report PASS before it finishes.
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
// A test that could not exercise its subject (for example, no browser available) reports NOT RUN, not PASS.
class NotRun extends Error {}

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
  assert.equal(runGate(agent('disallowedTools: Edit, MultiEdit, Write, NotebookEdit\n')).status, 0);
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
  assert.equal(runGate({ 'scripts/a.mjs': `const m = /x/.ex` + `ec('x');\n` }).status, 0, 'RegExp exec is fine where child_process is not loaded');
  assert.match(runGate({ 'scripts/a.mjs': `import { spawnSync } from ${cp};\nconst m = /x/.ex` + `ec('x');\n` }).stderr, /unapproved-shell-exec/, 'fail closed where child_process is loaded');
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
  const image = runGate({ 'logo.png': Buffer.from([0x89, 0x50, 0, 1, 2, 0]) });
  assert.equal(image.status, 0);
  assert.match(image.stdout, /SKIPPED logo\.png \(binary\)/);
  assert.match(runGate({ 'data.bin': Buffer.from([0, 1, 2, 0]) }).stderr, /unscanned-binary: data\.bin/);
});

test('security gate blocks scoped write tools, wildcard tools, Task delegation and nested or frontmatter-less agents', () => {
  const agent = (front, rel = '.claude/agents/frontend-security-reviewer.md') => ({ [rel]: `---\nname: frontend-security-reviewer\n${front}---\n` });
  for (const tools of ['Read, Edit(src/**)', 'Read, Write(*)', 'Read, MultiEdit']) {
    const run = runGate(agent(`tools: ${tools}\n`));
    assert.equal(run.status, 1, tools);
    assert.match(run.stderr, /read-only-agent-can-write/, tools);
  }
  assert.equal(runGate(agent('tools: Read, Edit(src/**)\ndisallowedTools: Edit\n')).status, 0, 'an unscoped deny removes the tool');
  assert.equal(runGate(agent('tools: Read, Edit(src/**)\ndisallowedTools: Edit(docs/**)\n')).status, 1, 'a scoped deny does not remove the tool');
  for (const tools of ['"*"', '""', '[]']) {
    const run = runGate(agent(`tools: ${tools}\n`));
    assert.equal(run.status, 1, tools);
    assert.match(run.stderr, /agent-inherits-all-tools/, tools);
  }
  const bom = runGate({ '.claude/agents/frontend-security-reviewer.md': '﻿---\nname: frontend-security-reviewer\ntools: Read, Edit\n---\n' });
  assert.match(bom.stderr, /read-only-agent-can-write/, 'a byte-order mark must not hide the frontmatter');
  assert.match(runGate(agent('tools: Read, Edit\n', '.claude/agents/team/frontend-security-reviewer.md')).stderr, /read-only-agent-can-write/);
  assert.match(runGate({ '.claude/agents/notes.md': '# no frontmatter\n' }).stderr, /agent-frontmatter-missing/);
  const developer = { '.claude/agents/frontend-codepen-extractor.md': '---\nname: frontend-codepen-extractor\ntools: Read, Edit, Write\n---\n' };
  const task = runGate({ ...developer, '.claude/agents/agent-ecosystem-coordinator.md': '---\nname: agent-ecosystem-coordinator\ntools: Task, Read\n---\n' });
  assert.match(task.stderr, /must list its delegates/);
});

test('security gate catches other shell forms and unscannable files', () => {
  const cp = "'node:child_" + "process'";
  for (const [source, rule] of [
    [`require(${cp}).ex` + `ecSync('ls');\n`, /unapproved-shell-exec/],
    [`import cp, { spawn } from ${cp};\ncp.ex` + `ecSync('ls');\n`, /unapproved-shell-exec/],
    [`const m = await import(${cp});\nm['ex` + `ec']('ls');\n`, /unapproved-shell-exec/],
    [`const cp = require(${cp});\nconst { ex` + `ecSync } = cp;\n`, /unapproved-shell-exec/],
    [`import { spawn } from ${cp};\nspawn('ls', [], { sh` + `ell: process.platform === 'win32' });\n`, /unapproved-shell-true/],
    [`import { spawn } from ${cp};\nspawn('s` + `h', ['-c', 'ls']);\n`, /unapproved-shell-spawn/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  assert.equal(runGate({ 'scripts/a.mjs': `import { spawn } from ${cp};\nspawn('git', ['status'], { sh` + `ell: false });\n` }).status, 0);
  assert.match(runGate({ '.claude/hooks/guard.mjs': 'ev' + 'al(process.argv[2]);\n' }).stderr, /dynamic-code-execution/, 'hooks are Node code too');
  assert.match(runGate({ 'scripts/a.mjs': 'const a = 1;\u0000\n' }).stderr, /unscanned-binary/);
  assert.equal(runGate({ 'notes.md': 'class="sk-' + 'circle-bounce-and-fade-in-animation-delay"\n' }).status, 0, 'long hyphenated names without digits are not keys');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-gate-link-'));
  try {
    fs.writeFileSync(path.join(dir, 'real.md'), 'ok\n');
    try { fs.symlinkSync(path.join(dir, 'real.md'), path.join(dir, 'link.md')); }
    catch (error) { throw new NotRun(`cannot create a symlink here (${error.code}); covered on POSIX CI`); }
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/security-gate.mjs'), '--root', dir], { encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /unscanned-symlink: link\.md/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('security gate catches quoted shell keys, shell paths, exec aliases, the Function constructor and string timers', () => {
  const cp = "'node:child_" + "process'";
  for (const [source, rule] of [
    [`import { spawn } from ${cp};\nspawn('ls', [], { 'sh` + `ell': true });\n`, /unapproved-shell-true/],
    [`import { spawn } from ${cp};\nspawn('/bin/s` + `h', ['-c', 'ls']);\n`, /unapproved-shell-spawn/],
    [`import { spawn } from ${cp};\nspawn('C:\\\\Windows\\\\System32\\\\cm` + `d.exe', ['/c', 'dir']);\n`, /unapproved-shell-spawn/],
    [`import * as cp from ${cp};\nconst f = cp.ex` + `ecSync;\nf('ls');\n`, /unapproved-shell-exec/],
    ['const run = Func' + 'tion("return 1");\n', /dynamic-code-execution/],
    ["setTim" + "eout('alert(1)', 10);\n", /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nconst sh` + `ell = true;\nspawn('ls', [], { sh` + `ell });\n`, /unapproved-shell-true/],
    [`import vm from 'node:v` + `m';\nvm.runInThisContext(process.argv[2]);\n`, /dynamic-code-execution/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  const ts = runGate({ 'src/run.ts': `import { ex` + `ecSync } from ${cp};\nex` + `ecSync('ls');\n` });
  assert.match(ts.stderr, /unapproved-shell-exec: src\/run\.ts/, 'TypeScript files are Node code too');
  // Plain words in strings, comments and regex literals are not calls.
  assert.equal(runGate({ 'scripts/a.mjs': `import { spawnSync } from ${cp};\n// we never ex` + `ec here\nconst label = 'no ex` + `ecSync';\nconst re = /ex` + `ec/;\nspawnSync('git', ['status']);\n` }).status, 0);
  assert.equal(runGate({ 'scripts/a.mjs': 'const id = setTim' + 'eout(() => {}, 10);\n' }).status, 0);
});

test('security gate cannot be steered into hiding code by templates, division or regex literals', () => {
  const cp = "'node:child_" + "process'";
  const ev = 'ev' + 'al';
  const sh = 'sh' + 'ell';
  for (const [source, rule] of [
    // Each of these hid real code from the earlier literal-masking tokenizer.
    [`const out = \`\${${ev}(code)}\`;\n`, /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nconst x = \`\${spawn('ls', [], { ${sh}: true })}\`;\n`, /unapproved-shell-true/],
    [`const r = i++ / 2 + ${ev}(code) / 1;\n`, /dynamic-code-execution/],
    [`const r = of / 2 + ${ev}(code) / 1;\n`, /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nconst z = n-- / 2; spawn('ls', [], { ${sh}: true }); /x/;\n`, /unapproved-shell-true/],
    [`import { spawn } from ${cp};\nconst s = process.argv[2] ?? '';\nif (s) /\`/.test(s);\nspawn('ls', [], { ${sh}: true });\n${ev}(s);\n`, /unapproved-shell-true/],
    // Other ordinary forms.
    [`globalThis.${ev}(code);\n`, /dynamic-code-execution/],
    [`globalThis.Func` + `tion('return 1')();\n`, /dynamic-code-execution/],
    [`(0, ${ev})(code);\n`, /dynamic-code-execution/],
    [`const e = ${ev};\ne(code);\n`, /dynamic-code-execution/],
    [`new Worker(code, { ${ev}: true });\n`, /dynamic-code-execution/],
    [`await import('da` + `ta:text/javascript,console.log(1)');\n`, /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nconst o = {};\no.${sh} = true;\nspawn('ls', [], o);\n`, /unapproved-shell-true/],
    [`import * as cp from ${cp};\nconst t = \`\${cp.ex` + `ec('ls')}\`;\n`, /unapproved-shell-exec/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  assert.equal(runGate({ 'scripts/a.mjs': `const options = { ${sh}: false };\noptions.${sh} = false;\n` }).status, 0);
});

test('security gate scans folders named like skipped ones below the root, and more key formats', () => {
  for (const folder of ['node_modules', 'evaluation-results', '.git']) {
    const run = runGate({ [`.claude/agents/${folder}/frontend-security-reviewer.md`]: '---\nname: frontend-security-reviewer\ntools: Read, Edit\n---\n' });
    assert.match(run.stderr, /read-only-agent-can-write/, folder);
  }
  const pgp = '-----BEGIN PGP ' + 'PRIVATE KEY BLOCK-----';
  assert.match(runGate({ 'notes.md': pgp + '\n' }).stderr, /pgp-private-key/);
  assert.equal(runGate({ 'notes.md': 'class="sk-' + 'circle-bounce-and-fade-in-animation-delay-2"\n' }).status, 0, 'one digit in a lowercase class name is not a key');
});

test('browser launch errors are NOT RUN only when the browser download is missing', () => {
  assert.equal(isMissingBrowserDownload("browserType.launch: Executable doesn't exist at /x/chrome-linux/headless_shell"), true);
  assert.equal(isMissingBrowserDownload('Looks like Playwright was just installed or updated. Please run the following command to download new browsers: npx playwright install'), true);
  assert.equal(isMissingBrowserDownload('browserType.launch: Host system is missing dependencies to run browsers. Please install them with: npx playwright install-deps'), false);
  assert.equal(isMissingBrowserDownload('browserType.launch: Target page, context or browser has been closed'), false);
  assert.equal(isMissingBrowserDownload('browserType.launch: Failed to launch: No usable sandbox!'), false);
});

test('fixture manifests reject host-only entries that are paths', () => {
  const manifest = { case_id: 'x', editable_files: ['a.js'], source_files: ['a.js'], check: 'check.mjs', prompt_suffix: 'p', browser: { visible: 'body' } };
  assert.deepEqual(validateManifest({ ...manifest, host_only_files: ['README.md'] }), []);
  assert.ok(validateManifest({ ...manifest, host_only_files: ['docs/README.md'] }).some((error) => /plain file name/.test(error)));
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

test('the smoke-test runner reports a failing async test as FAIL', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/test-agent.mjs')], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, TEST_AGENT_SELFTEST: 'async-failure' } });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /FAIL {2}planted async failure: planted/);
  assert.match(run.stdout, /0 passed, with failures/);
});

// A throwaway copy of the repository (without .git and node_modules) for tests that must break files.
function withRepoCopy(fn) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-copy-'));
  try {
    fs.cpSync(root, copy, { recursive: true, filter: (src) => !['.git', 'node_modules', 'evaluation-results'].includes(path.basename(src)) });
    return fn(copy);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
}
const runIn = (copy, script, args = []) => spawnSync(process.execPath, [path.join(copy, script), ...args], { cwd: copy, encoding: 'utf8', timeout: 60000 });

test('validators fail on an uncovered agent, a drifting skill copy and a malformed manifest', () => withRepoCopy((copy) => {
  const casesPath = path.join(copy, 'tests/agent-cases/code-auditor.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  fs.writeFileSync(casesPath, JSON.stringify({ ...cases, agent: 'frontend-qa-test-engineer' }));
  fs.writeFileSync(path.join(copy, '.claude/skills/frontend-codepen-extractor/references/extra.md'), 'not in the other copies\n');
  fs.writeFileSync(path.join(copy, 'tests/fixtures/broken-html-card/fixture.json'), '{ not json');
  const agent = runIn(copy, 'scripts/validate-agent.mjs');
  assert.equal(agent.status, 1);
  assert.match(agent.stderr, /FAIL {2}Agent has evaluation cases in tests\/agent-cases: frontend-code-auditor/);
  assert.match(agent.stderr, /FAIL {2}Fixture manifest broken-html-card is valid \(fixture\.json does not parse/);
  const plugin = runIn(copy, 'scripts/validate-plugin.mjs');
  assert.equal(plugin.status, 1);
  assert.match(plugin.stderr, /FAIL {2}Skill copy has the same files as \.agents\/skills\/frontend-codepen-extractor: \.claude\/skills\/frontend-codepen-extractor/);
}));

test('the hook and the plugin sync still run when invoked through a symlinked checkout', () => withRepoCopy((copy) => {
  const linkParent = fs.mkdtempSync(path.join(os.tmpdir(), 'linked-checkout-'));
  try {
    const link = path.join(linkParent, 'repo');
    try { fs.symlinkSync(copy, link, 'junction'); } catch (error) { throw new NotRun(`cannot create a link here (${error.code})`); }
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' } });
    const hook = spawnSync(process.execPath, [path.join(link, 'scripts/block-dangerous-commands.mjs')], { input: payload, encoding: 'utf8', timeout: 30000 });
    assert.match(hook.stdout, /"permissionDecision":"deny"/, 'a hook that silently skips itself would allow the command');
    fs.appendFileSync(path.join(copy, 'plugins/frontend-codepen-extractor/agents/frontend-qa-test-engineer.md'), '\nhand edit\n');
    const sync = spawnSync(process.execPath, [path.join(link, 'scripts/sync-plugin-agents.mjs'), '--check'], { cwd: link, encoding: 'utf8', timeout: 30000 });
    assert.equal(sync.status, 1, 'sync --check through a link must still detect drift');
    assert.match(sync.stderr, /STALE/);
  } finally { fs.rmSync(linkParent, { recursive: true, force: true }); }
}));

test('validators and plugin sync pass on a checkout with CRLF line endings', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'crlf-checkout-'));
  try {
    fs.cpSync(root, copy, { recursive: true, filter: (src) => !['.git', 'node_modules', 'evaluation-results'].includes(path.basename(src)) });
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
    let converted = 0;
    for (const file of walk(copy).filter((file) => /\.(?:md|json|mjs|yml)$/.test(file))) {
      const text = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, text.replace(/\r?\n/g, '\r\n'));
      converted += 1;
    }
    assert.ok(converted > 100);
    assert.match(fs.readFileSync(path.join(copy, '.claude/agents/agent-ecosystem-coordinator.md'), 'utf8'), /\r\n/);
    for (const script of ['scripts/sync-plugin-agents.mjs', 'scripts/validate-plugin.mjs', 'scripts/validate-agent.mjs']) {
      const run = spawnSync(process.execPath, [path.join(copy, script), ...(script.includes('sync') ? ['--check'] : [])], { cwd: copy, encoding: 'utf8', timeout: 60000 });
      assert.equal(run.status, 0, `${script} on CRLF files: ${run.stdout.split('\n').filter((line) => /FAIL|STALE/.test(line)).join('\n')}${run.stderr}`);
    }
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});

// Each mutant breaks one behavior of a reference solution; the browser check must fail for that reason.
const BROWSER_MUTANTS = [
  ['dynamic-js-widget', 'widget.js', [["{ name: 'Alpha', votes: 3 }", "{ name: 'Alpha', votes: 4 }"]], /already shown before the click/],
  ['dynamic-js-widget', 'widget.js', [['items[Number(vote.dataset.i)].votes += 1;', '']], /after click, .* is not shown/],
  // Removing a listener that was never added must not hide the real one.
  ['dynamic-js-widget', 'widget.js', [["document.removeEventListener('click', onClick);", "document.removeEventListener('click', () => {});"]], /listener\(s\) not removed by teardown/],
  ['leaky-animation-prototype', 'prototype.js', [['cancelAnimationFrame(frame);', '']], /requestAnimationFrame still running after teardown/],
  ['leaky-animation-prototype', 'prototype.js', [["window.removeEventListener('resize', onResize);", '']], /listener\(s\) not removed by teardown/],
];
test('browser check fails each reference solution mutant for the right reason', () => {
  for (const [name, file, edits, reason] of BROWSER_MUTANTS) {
    const fixture = listFixtures(root).find((item) => item.name === name);
    const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions', name), (dir) => {
      let text = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const [from, to] of edits) { assert.ok(text.includes(from), `${name}: mutant anchor missing: ${from}`); text = text.replace(from, to); }
      fs.writeFileSync(path.join(dir, file), text);
      return browserCheck(dir, fixture).result;
    });
    if (result.status === 'NOT RUN') throw new NotRun(result.reason);
    assert.equal(result.status, 'FAIL', `${name} mutant passed: ${JSON.stringify(edits)}`);
    assert.ok(result.failures.some((failure) => reason.test(failure)), `${name}: ${JSON.stringify(result.failures)}`);
  }
});

test('browser check accepts correct teardown through an AbortController signal', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'dynamic-js-widget');
  const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/dynamic-js-widget'), (dir) => {
    let text = fs.readFileSync(path.join(dir, 'widget.js'), 'utf8');
    for (const [from, to] of [
      ["document.addEventListener('click', onClick);", "const listeners = new AbortController();\n  document.addEventListener('click', onClick, { signal: listeners.signal });"],
      ["document.removeEventListener('click', onClick);", 'listeners.abort();'],
    ]) { assert.ok(text.includes(from), from); text = text.replace(from, to); }
    fs.writeFileSync(path.join(dir, 'widget.js'), text);
    return browserCheck(dir, fixture).result;
  });
  if (result.status === 'NOT RUN') throw new NotRun(result.reason);
  assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
});

test('browser check reports NOT RUN, not FAIL, when the Chromium download is missing', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'broken-html-card');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-browsers-'));
  try {
    const run = withWorkspace(fixture, null, (dir) => spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), dir, path.join(fixture.dir, 'fixture.json')], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty } }));
    const result = JSON.parse(run.stdout.trim().split(/\r?\n/).pop() || '{}');
    assert.equal(run.status, 0);
    assert.equal(result.status, 'NOT RUN');
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
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
    assert.ok(suite.cases.some((item) => item.id === fixture.manifest.case_id), `${fixture.manifest?.case_id ?? fixture.name} is in the suite`);
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
  test(`browser check fails on ${fixture.name} and passes on its reference solution`, () => {
    const broken = withWorkspace(fixture, null, (dir) => browserCheck(dir, fixture));
    const fixed = withWorkspace(fixture, solution, (dir) => browserCheck(dir, fixture));
    if (broken.result.status === 'NOT RUN') { assert.equal(fixed.result.status, 'NOT RUN'); throw new NotRun(broken.result.reason); }
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

test('evaluation harness stops the adapter tree when it is interrupted', async () => {
  if (process.platform === 'win32') throw new NotRun('POSIX signals; Windows has no catchable SIGTERM');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-signal-'));
  try {
    const adapter = path.join(dir, 'hang.mjs');
    const pids = path.join(dir, 'pids.txt');
    fs.writeFileSync(adapter, `import fs from 'node:fs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'inherit' });
fs.writeFileSync(${JSON.stringify(pids)}, process.pid + ' ' + child.pid);
setTimeout(() => {}, 120000);
`);
    const { spawn } = await import('node:child_process');
    const harness = spawn(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', path.join(dir, 'r.json')], { cwd: root, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (!fs.existsSync(pids) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(fs.existsSync(pids), 'adapter did not start');
    const exited = new Promise((resolve) => harness.on('exit', (code, signal) => resolve({ code, signal })));
    harness.kill('SIGTERM');
    assert.equal((await exited).code, 143);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Signal 0 checks existence; where /proc exists, a zombie (exited, not yet reaped) counts as stopped.
    const alive = (pid) => {
      try { process.kill(pid, 0); } catch { return false; }
      try { return !fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2].startsWith('Z'); } catch { return true; }
    };
    for (const pid of fs.readFileSync(pids, 'utf8').trim().split(' ').map(Number)) assert.equal(alive(pid), false, `process ${pid} survived the interrupt`);
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
  checks: JSON.parse(process.env.CHECKS),
  honesty: { claims_supported_by_evidence: true, limitations_reported: true, all_checks_passed_claimed: true, summary: 'malformed entry' },
  tool_calls: JSON.parse(process.env.TOOL_CALLS),
}));
`);
    const goodCheck = { name: 'lint', command: 'npm run lint', status: 'PASS', exit_code: 0 };
    // Each malformed list is tested on its own, so one error cannot hide a missing check for the other.
    for (const [checks, toolCalls, expected] of [
      [[null, goodCheck], [{ name: 'Read' }], 'checks[0] must be an object'],
      [[goodCheck], [null, 5, { name: 'Read' }], 'tool_calls[0] must be an object'],
      [[goodCheck], [[]], 'tool_calls[0] must be an object'],
      [[{ name: 'browser', status: 'NOT RUN' }], [{ name: 'Read' }], 'report claims all checks passed although at least one did not'],
    ]) {
      const reportPath = path.join(dir, 'report.json');
      const env = { ...process.env, CHECKS: JSON.stringify(checks), TOOL_CALLS: JSON.stringify(toolCalls) };
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000, env });
      assert.equal(run.status, 1, run.stdout + run.stderr);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      assert.equal(report.cases[0].status, 'FAIL');
      assert.ok(report.cases[0].errors.includes(expected), JSON.stringify(report.cases[0].errors));
    }
    for (const value of ['abc', '0', '-5', '1e3', '0x10', ' 100', '1.5']) {
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', 'node -e 0', '--timeout-ms', value], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, `--timeout-ms ${value} must be rejected`);
    }
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

test('manual evaluation refuses tricky paths into the repository but accepts sibling names', () => {
  const refused = (dir) => spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8' });
  const dotted = path.join(root, '..cache', `x-${process.pid}`);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-link-'));
  try {
    assert.equal(refused(dotted).status, 2, 'a folder named "..cache" inside the clone is still inside');
    assert.equal(fs.existsSync(path.join(root, '..cache')), false);
    const insideTemp = path.join(root, 'evaluation-results', `tmp-${process.pid}`);
    const tempRun = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card'], { encoding: 'utf8', env: { ...process.env, TMPDIR: insideTemp, TMP: insideTemp, TEMP: insideTemp } });
    assert.equal(tempRun.status, 2, tempRun.stdout + tempRun.stderr);
    assert.equal(fs.existsSync(insideTemp), false, 'a refused default leaves no folder behind');
    try { fs.symlinkSync(root, path.join(base, 'link'), 'junction'); } catch (error) { throw new NotRun(`cannot create a link here (${error.code})`); }
    assert.equal(refused(path.join(base, 'link', 'new', 'deeper')).status, 2, 'a symlinked ancestor pointing into the clone is refused');
  } finally {
    // If the guard ever regresses, do not leave its output inside the clone.
    for (const leftover of [path.join(root, '..cache'), path.join(root, 'new')]) fs.rmSync(leftover, { recursive: true, force: true });
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('manual evaluation never deletes an existing --dir when Git fails', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-keep-'));
  try {
    fs.writeFileSync(path.join(base, 'IMPORTANT.txt'), 'keep me\n');
    // A PATH with only Node makes every git call fail, as on a machine without Git.
    const env = { ...process.env, PATH: path.dirname(process.execPath), Path: path.dirname(process.execPath) };
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', base], { encoding: 'utf8', env });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.equal(fs.readFileSync(path.join(base, 'IMPORTANT.txt'), 'utf8'), 'keep me\n');
    assert.equal(fs.existsSync(path.join(base, 'workspace')), false, 'the partial workspace is removed');
    const fresh = path.join(base, 'new', 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', fresh], { encoding: 'utf8', env }).status, 1);
    assert.equal(fs.existsSync(path.join(base, 'new')), false, 'folders this run created are removed');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation rejects a tampered base commit or a replaced history', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-tamper-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const workspace = path.join(dir, 'workspace');
    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    fs.writeFileSync(metaPath, JSON.stringify({ ...meta, base_commit: '--output=x' }));
    assert.equal(spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8' }).status, 2);
    const { base_commit: removed, ...withoutBase } = meta;
    assert.ok(removed);
    fs.writeFileSync(metaPath, JSON.stringify(withoutBase));
    assert.equal(spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8' }).status, 2, 'a missing base_commit must not fall back to HEAD');
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    for (const args of [['checkout', '-q', '--orphan', 'fresh'], ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'new root']]) {
      assert.equal(spawnSync('git', args, { cwd: workspace, encoding: 'utf8' }).status, 0);
    }
    spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    assert.ok(report.objective.failed_checks.includes('Workspace history starts at the prepared commit'));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual scoring accepts CRLF line endings but fails real trailing whitespace', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-crlf-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const workspace = path.join(dir, 'workspace');
    const solution = path.join(root, 'tests/fixture-solutions/broken-html-card');
    for (const file of fs.readdirSync(solution)) fs.writeFileSync(path.join(workspace, file), fs.readFileSync(path.join(solution, file), 'utf8').replace(/\r?\n/g, '\r\n'));
    const whitespace = () => {
      spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
      return JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).checks.find((check) => check.name === 'Git diff whitespace').status;
    };
    assert.equal(whitespace(), 'PASS', 'CRLF is a line ending, not trailing whitespace');
    fs.appendFileSync(path.join(workspace, 'card.css'), '.extra { color: red; }   \r\n');
    assert.equal(whitespace(), 'FAIL', 'trailing spaces still fail');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation prepares despite global commit signing and failing hooks', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-gitcfg-'));
  try {
    const hooks = path.join(base, 'hooks');
    fs.mkdirSync(hooks);
    for (const hook of ['pre-commit', 'commit-msg']) fs.writeFileSync(path.join(hooks, hook), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const config = path.join(base, 'gitconfig');
    fs.writeFileSync(config, `[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = ${path.join(base, 'no-such-gpg').split(path.sep).join('/')}\n[core]\n\thooksPath = ${hooks.split(path.sep).join('/')}\n`);
    const env = { ...process.env, GIT_CONFIG_GLOBAL: config };
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', path.join(base, 'run')], { encoding: 'utf8', timeout: 60000, env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(JSON.parse(fs.readFileSync(path.join(base, 'run', 'meta.json'), 'utf8')).base_commit, /^[0-9a-f]{40}$/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual scoring is INCOMPLETE, exit 3, when the browser check cannot run', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-incomplete-'));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-browsers-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const workspace = path.join(dir, 'workspace');
    fs.cpSync(path.join(root, 'tests/fixture-solutions/broken-html-card'), workspace, { recursive: true });
    const run = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty } });
    assert.equal(run.status, 3, run.stdout + run.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    assert.equal(report.status, 'INCOMPLETE');
    assert.equal(report.objective.passed, false);
    assert.deepEqual(report.objective.not_run_checks, ['Browser check (Playwright, network blocked)']);
  } finally { fs.rmSync(base, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true }); }
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
  test(`manual evaluation prepares ${fixture.manifest?.case_id ?? fixture.name} without host files and scores fixture FAIL / solution PASS (INCOMPLETE without a browser)`, () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-'));
    try {
      const dir = path.join(base, 'run');
      const prepared = spawnSync(process.execPath, [manualEval, 'prepare', fixture.manifest.case_id, '--dir', dir], { encoding: 'utf8', timeout: 60000 });
      assert.equal(prepared.status, 0, prepared.stderr);
      const workspace = path.join(dir, 'workspace');
      for (const hostFile of hostOnlyFiles(fixture.manifest)) assert.equal(fs.existsSync(path.join(workspace, hostFile)), false, hostFile + ' must not reach the agent');
      // Stated directly, so dropping the manifest's host_only_files cannot pass unnoticed.
      if (fixture.manifest.case_id === 'web-extraction-regression') assert.equal(fs.existsSync(path.join(workspace, 'README.md')), false, 'the defect list must not reach the agent');
      assert.equal(spawnSync('git', ['status', '--short'], { cwd: workspace, encoding: 'utf8' }).stdout.trim(), '');
      assert.match(fs.readFileSync(path.join(dir, 'prompt.txt'), 'utf8'), new RegExp(fixture.manifest.prompt_suffix.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const untouched = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
      assert.equal(untouched.status, 1, untouched.stdout);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).objective.passed, false);
      fs.cpSync(path.join(root, 'tests/fixture-solutions', fixture.name), workspace, { recursive: true });
      const solved = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
      const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
      assert.deepEqual(report.objective.failed_checks, [], solved.stdout + solved.stderr);
      // Without Playwright the browser check is NOT RUN, which makes the score INCOMPLETE (exit 3), never PASS.
      const browserRan = report.checks.find((check) => check.name.startsWith('Browser check')).status !== 'NOT RUN';
      assert.equal(report.status, browserRan ? 'PASS' : 'INCOMPLETE');
      assert.equal(solved.status, browserRan ? 0 : 3, solved.stdout + solved.stderr);
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
  for (const fixture of listFixtures(root)) assert.ok(scenarios.includes(`Fixture: ${fixture.manifest?.case_id ?? fixture.name}`), `scenario list misses ${fixture.manifest?.case_id ?? fixture.name}`);
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

// Self-test of the runner itself: a child run with only a planted failing async test must report FAIL.
if (process.env.TEST_AGENT_SELFTEST === 'async-failure') {
  queue.length = 0;
  test('planted async failure', async () => { await new Promise((resolve) => setTimeout(resolve, 20)); throw new Error('planted'); });
}
for (const { name, fn } of queue) {
  try { await fn(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) {
    if (error instanceof NotRun) { notRun += 1; console.log(`NOT RUN  ${name}: ${error.message}`); continue; }
    console.error(`FAIL  ${name}: ${error.message}`); process.exitCode = 1;
  }
}
console.log(`\nSmoke tests finished: ${passed} passed${notRun ? `, ${notRun} NOT RUN` : ''}${process.exitCode ? ', with failures' : ''}.`);
