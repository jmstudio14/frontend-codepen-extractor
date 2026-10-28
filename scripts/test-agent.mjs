#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
// The manual evaluation refuses to work inside the clone, by design, so a temporary folder inside it would
// make many tests fail for that reason alone. Say so once instead.
{
  const real = (dir) => { try { return fs.realpathSync(dir); } catch { return path.resolve(dir); } };
  const rel = path.relative(real(root), real(os.tmpdir()));
  if (rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))) {
    console.error(`The temporary folder (${os.tmpdir()}) is inside this repository; set TMPDIR (TMP and TEMP on Windows) to a folder outside it and run the smoke tests again.`);
    process.exit(2);
  }
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
    `import { ex` + `ecSync } from ${cp};\nex` + `ecSync('ls');\n`,
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

test('security gate is not blinded by a byte-order mark in front of plain text', () => {
  const key = 'sk-' + 'A'.repeat(40);
  const bom = (body, mark = [0xff, 0xfe]) => Buffer.concat([Buffer.from(mark), Buffer.from(body)]);
  // The two bytes claim UTF-16, but the rest is ASCII: the gate on main blocks both, so this one must too.
  const secret = runGate({ 'notes.txt': bom(`key = "${key}"\n`) });
  assert.equal(secret.status, 1);
  assert.match(secret.stderr, /openai-api-key: notes\.txt/);
  assert.ok(!(secret.stdout + secret.stderr).includes(key), 'the value must not be printed');
  assert.match(runGate({ 'scripts/a.mjs': bom('ev' + 'al(process.argv[2]);\n') }).stderr, /dynamic-code-execution: scripts\/a\.mjs/);
  assert.match(runGate({ 'notes.txt': bom(`key = "${key}"\n`, [0xfe, 0xff]) }).stderr, /openai-api-key: notes\.txt/);
  // An odd-length file after a big-endian mark used to crash the gate; it is read as UTF-8 instead.
  const odd = runGate({ 'x.txt': Buffer.from([0xfe, 0xff, 0x41]) });
  assert.equal(odd.status, 0, odd.stderr);
  assert.doesNotMatch(odd.stderr, /RangeError/);
  // Real UTF-16 text is still read as UTF-16.
  assert.equal(runGate({ 'u16.txt': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello\n', 'utf16le')]) }).status, 0);
});

test('security gate flags the evaluator, the code constructor, vm, shells and exec wherever they are named', () => {
  const cp = "'node:child_" + "process'";
  const ev = 'ev' + 'al', fn = 'Func' + 'tion', sh = 's' + 'hell', ex = 'ex' + 'ecSync';
  // Each of these passed an earlier version of the gate (and the one on main) and ran its payload.
  for (const [source, rule] of [
    [`import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nconst run = require(${cp}).${ex};\nrun('id');\n`, /unapproved-shell-exec: scripts\/a\.mjs line 3/],
    [`const run = (await import(${cp})).${ex};\nrun('id');\n`, /unapproved-shell-exec/],
    [`import { spawnSync } from ${cp};\nspawnSync('ls', [], { ${sh}/**/: true });\n`, /unapproved-shell-true: scripts\/a\.mjs line 2/],
    [`import { spawnSync } from ${cp};\nconst o = {};\nReflect.set(o, '${sh}', true);\nspawnSync('ls', [], o);\n`, /unapproved-shell-true: scripts\/a\.mjs line 3/],
    [`import { spawnSync } from ${cp};\nconst prog = 's` + `h';\nspawnSync(prog, ['-c', 'id']);\n`, /unapproved-shell-spawn: scripts\/a\.mjs line 2/],
    [`import { spawnSync } from ${cp};\nspawnSync('env', ['s` + `h', '-c', 'id']);\n`, /unapproved-shell-spawn/],
    [`const e = [${ev}][0];\ne('1');\n`, /dynamic-code-execution: scripts\/a\.mjs line 1/],
    [`globalThis['${ev}']('1');\n`, /dynamic-code-execution/],
    [`Reflect.construct(${fn}, ['return 1'])();\n`, /dynamic-code-execution/],
    [`import { createRequire } from 'node:module';\ncreateRequire(import.meta.url)('node:v` + `m');\n`, /dynamic-code-execution: scripts\/a\.mjs line 2/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  // Ordinary code that names none of them, or turns the option off, still passes.
  const ordinary = `import { spawnSync } from ${cp};\nspawnSync('git', ['-c', 'x=y', 'status'], { ${sh}: false });\nconst tool = { tool_name: 'Bash' };\nconst worker = { ${ev}: false };\nconst file = 'manual-${ev}.mjs';\n`;
  const run = runGate({ 'scripts/a.mjs': ordinary });
  assert.equal(run.status, 0, run.stderr);
});

test('security gate rejects an agent whose frontmatter name differs from its file name', () => {
  // A write-capable profile under the implementation agent's file name, but named as a reviewer.
  const nested = runGate({ '.claude/agents/team/frontend-codepen-extractor.md': '---\nname: frontend-security-reviewer\ndescription: Reviews\ntools: Read, Edit, Write\n---\nBody\n' });
  assert.equal(nested.status, 1);
  assert.match(nested.stderr, /agent-name-mismatch: \.claude\/agents\/team\/frontend-codepen-extractor\.md/);
  assert.equal(runGate({ '.claude/agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews\ntools: Read\n---\nBody\n' }).status, 0);
});

test('security gate reports files too large to scan and string callbacks of every timer', () => {
  const large = runGate({ 'notes.txt': 'x'.repeat(2 * 1024 * 1024 + 1) });
  assert.equal(large.status, 1);
  assert.match(large.stderr, /unscanned-large-file: notes\.txt/);
  for (const timer of ['setTimeout', 'setInterval', 'setImmediate']) {
    const run = runGate({ 'scripts/a.mjs': `${timer}('run()', 10);\n` });
    assert.match(run.stderr, /dynamic-code-execution: scripts\/a\.mjs line 1/, timer);
  }
});

test('security gate refuses a --root without an existing folder instead of scanning this repository', () => {
  const gate = path.join(root, 'scripts/security-gate.mjs');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-options-'));
  try {
    // A missing value or folder, `--root=x`, a typo, a bare path or an extra argument: none may fall back to
    // scanning this repository.
    for (const argv of [['--root'], ['--root', '--x'], ['--root', path.join(folder, 'missing')], [`--root=${folder}`], ['--rot', folder], [folder], ['--root', folder, 'extra']]) {
      const run = spawnSync(process.execPath, [gate, ...argv], { encoding: 'utf8', timeout: 30000 });
      assert.equal(run.status, 2, argv.join(' '));
      assert.match(run.stderr, /--root needs an existing folder|Usage: security-gate\.mjs/);
      assert.doesNotMatch(run.stdout, /files scanned/);
    }
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('security gate reads escaped names, every shell source, more shells and extensionless node scripts', () => {
  const cp = "'node:child_" + "process'";
  const bs = String.fromCharCode(92);
  // Written with escapes, these are the same names to Node; the gate on main missed all of them.
  for (const [source, rule] of [
    [`${bs}u0065val("6*7");\n`, /dynamic-code-execution/],
    [`new ${bs}u0046unction("return 1")();\n`, /dynamic-code-execution/],
    [`import { spawnSync } from ${cp};\nspawnSync('ls', [], { s${bs}u0068ell: true });\n`, /unapproved-shell-true/],
    [`import cp from "node:child_${bs}u0070rocess";\ncp.${bs}u0065xecSync('id');\n`, /unapproved-shell-exec/],
    [`import { spawnSync } from ${cp};\nspawnSync('ls', [], { ['s${bs}x68ell']: true });\n`, /unapproved-shell-true/],
    [`${bs}u{65}val('1');\n`, /dynamic-code-execution/],
    // The login shell by any route, and shells beyond the common ones.
    [`import { spawnSync } from ${cp};\nconst { ${'SHE' + 'LL'} } = process.env;\nspawnSync(${'SHE' + 'LL'}, ['-c', 'id']);\n`, /unapproved-shell-spawn/],
    [`import os from 'node:os';\nimport { spawnSync } from ${cp};\nspawnSync(os.userInfo().${'s' + 'hell'}, ['-c', 'id']);\n`, /unapproved-shell-spawn/],
    [`import { spawn } from ${cp};\nspawn('/bin/as` + `h', ['-c', 'id']);\n`, /unapproved-shell-spawn/],
    [`import { spawn } from ${cp};\nspawn('tcs` + `h', ['-c', 'id']);\n`, /unapproved-shell-spawn/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  // A node script without an extension is Node code too.
  const tool = runGate({ 'bin/tool': `#!/usr/bin/env node\nrequire(${cp}).spawnSync('ls', [], { ${'s' + 'hell'}: true });\n` });
  assert.match(tool.stderr, /unapproved-shell-true: bin\/tool/);
  assert.equal(runGate({ 'bin/run': '#!/bin/sh\necho ok\n' }).status, 0, 'a shell script is not Node code');
  // Escapes that spell nothing flagged are fine.
  assert.equal(runGate({ 'scripts/a.mjs': `const nbsp = '${bs}u00a0';\nconst tab = '${bs}x09';\n` }).status, 0);
});

test('security gate decodes every escape form and reads past comments and non-false option values', () => {
  const bs = String.fromCharCode(92);
  const cp = (spelled) => `'node:${spelled}'`;
  // Each ran its payload under node and passed both this gate's earlier version and the one on main.
  for (const [file, source, rule] of [
    ['scripts/a.mjs', `import cp from ${cp(`child_pro${bs}cess`)};\ncp.ex` + `ecSync('id');\n`, /unapproved-shell-exec/],
    ['scripts/a.mjs', `import vm from ${cp(`v${bs}m`)};\nvm.runInThisContext('1');\n`, /dynamic-code-execution/],
    ['scripts/a.mjs', `await import('d${bs}ata:text/javascript,console.log(1)');\n`, /dynamic-code-execution/],
    ['scripts/a.mjs', `import cp from ${cp(`child_pro${bs}\ncess`)};\ncp.ex` + `ecSync('id');\n`, /unapproved-shell-exec/],
    ['scripts/a.cjs', `require('child${bs}137process').ex` + `ecSync('id');\n`, /unapproved-shell-exec/],
    ['scripts/a.mjs', `globalThis['ev${bs}\nal']('1');\n`, /dynamic-code-execution/],
    ['scripts/a.mjs', `import { spawnSync } from ${cp('child_' + 'process')};\nspawnSync('ls', [], { ${'s' + 'hell'}: false || true });\n`, /unapproved-shell-true/],
    ['scripts/a.mjs', `new Worker('x.js', { ${'ev' + 'al'}: false || true });\n`, /dynamic-code-execution/],
    ['scripts/a.mjs', `import { ex` + `ecSync // }\n} from ${cp('child_' + 'process')};\n(0, ex` + `ecSync)('id');\n`, /unapproved-shell-exec/],
    ['scripts/a.mjs', `import { spawnSync } from ${cp('child_' + 'process')};\nconst ${'s' + 'hell'} = true;\nspawnSync('ls', [], { ${'s' + 'hell'} // c\n});\n`, /unapproved-shell-true/],
    ['src/view.jsx', `${'ev' + 'al'}(input);\n`, /dynamic-code-execution/],
  ]) {
    const run = runGate({ [file]: source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  // A plain false, followed by the end of the value, is still allowed; so are ordinary escapes.
  assert.equal(runGate({ 'scripts/a.mjs': `import { spawnSync } from ${cp('child_' + 'process')};\nspawnSync('git', ['status'], { ${'s' + 'hell'}: false });\nconst text = 'tab${bs}there${bs}n';\n` }).status, 0);
});

test('security gate keeps every main-branch secret rule', () => {
  // Built at run time, so this file holds no real-looking key; each value matches only its own rule.
  const samples = {
    'anthropic-api-key': 'sk-' + 'ant-' + 'a1B2c3D4e5F6g7H8i9J0',
    'openai-api-key': 'sk-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6',
    'aws-access-key': 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
    'github-token': 'gh' + 'p_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
    'private-key': '-----BEGIN ' + 'RSA PRIVATE ' + 'KEY-----',
  };
  for (const [rule, value] of Object.entries(samples)) {
    const run = runGate({ 'notes.md': `value=${value}\n` });
    assert.equal(run.status, 1, rule);
    assert.match(run.stderr, new RegExp(`${rule}: notes\\.md`), rule);
    assert.ok(!(run.stdout + run.stderr).includes(value), `${rule} value must not be printed`);
  }
});

test('security gate rejects agent tools entries that are not strings', () => {
  for (const tools of ['[Read, {Edit: 1}]', '{Edit: true}', '[Read, [Write]]']) {
    const run = runGate({ '.claude/agents/reviewer.md': `---\nname: reviewer\ndescription: Reviews\ntools: ${tools}\n---\nBody\n` });
    assert.equal(run.status, 1, tools);
    assert.match(run.stderr, /agent-frontmatter-invalid: \.claude\/agents\/reviewer\.md tools must be a string or a list of strings/, tools);
  }
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
    [`import { spawn } from ${cp};\nspawn('ls', [], { s` + `hell: process.platform === 'win32' });\n`, /unapproved-shell-true/],
    [`import { spawn } from ${cp};\nspawn('s` + `h', ['-c', 'ls']);\n`, /unapproved-shell-spawn/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  assert.equal(runGate({ 'scripts/a.mjs': `import { spawn } from ${cp};\nspawn('git', ['status'], { s` + `hell: false });\n` }).status, 0);
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

test('security gate catches quoted shell keys, shell paths, exec aliases, the code-from-string constructor and string timers', () => {
  const cp = "'node:child_" + "process'";
  for (const [source, rule] of [
    [`import { spawn } from ${cp};\nspawn('ls', [], { 's` + `hell': true });\n`, /unapproved-shell-true/],
    [`import { spawn } from ${cp};\nspawn('/bin/s` + `h', ['-c', 'ls']);\n`, /unapproved-shell-spawn/],
    [`import { spawn } from ${cp};\nspawn('C:\\\\Windows\\\\System32\\\\cm` + `d.exe', ['/c', 'dir']);\n`, /unapproved-shell-spawn/],
    [`import * as cp from ${cp};\nconst f = cp.ex` + `ecSync;\nf('ls');\n`, /unapproved-shell-exec/],
    ['const run = Func' + 'tion("return 1");\n', /dynamic-code-execution/],
    ["setTim" + "eout('alert(1)', 10);\n", /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nconst s` + `hell = true;\nspawn('ls', [], { s` + `hell });\n`, /unapproved-shell-true/],
    [`import vm from 'node:v` + `m';\nvm.runInThisContext(process.argv[2]);\n`, /dynamic-code-execution/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  // A shell path kept in a variable is still a shell once the file loads child_process; without it, a path is text.
  const viaVariable = runGate({ 'scripts/a.mjs': `import { spawn } from ${cp};\nconst bin = '/usr/bin/bas` + `h';\nspawn(bin, ['-c', 'ls']);\n` });
  assert.equal(viaVariable.status, 1);
  assert.match(viaVariable.stderr, /unapproved-shell-spawn: scripts\/a\.mjs line 2/);
  assert.equal(runGate({ 'scripts/a.mjs': `const bin = '/usr/bin/bas` + `h';\nconsole.log(bin);\n` }).status, 0);
  const ts = runGate({ 'src/run.ts': `import { ex` + `ecSync } from ${cp};\nex` + `ecSync('ls');\n` });
  assert.match(ts.stderr, /unapproved-shell-exec: src\/run\.ts/, 'TypeScript files are Node code too');
  // Plain words in strings, comments and regex literals are not calls.
  assert.equal(runGate({ 'scripts/a.mjs': `import { spawnSync } from ${cp};\n// we never ex` + `ec here\nconst label = 'no ex` + `ecSync';\nconst re = /ex` + `ec/;\nspawnSync('git', ['status']);\n` }).status, 0);
  assert.equal(runGate({ 'scripts/a.mjs': 'const id = setTim' + 'eout(() => {}, 10);\n' }).status, 0);
});

test('security gate cannot be steered into hiding code by templates, division or regex literals', () => {
  const cp = "'node:child_" + "process'";
  const ev = 'ev' + 'al';
  const sh = 's' + 'hell';
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
    // The evaluator taken from the global object under another name; only the call through the alias runs it.
    [`const run = globalThis.${ev};\nrun(code);\n`, /dynamic-code-execution: scripts\/a\.mjs line 1/],
    [`const api = { fn: window.${ev} };\napi.fn(code);\n`, /dynamic-code-execution: scripts\/a\.mjs line 1/],
    [`new Worker(code, { ${ev}: true });\n`, /dynamic-code-execution/],
    [`await import('da` + `ta:text/javascript,console.log(1)');\n`, /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nconst o = {};\no.${sh} = true;\nspawn('ls', [], o);\n`, /unapproved-shell-true/],
    [`import * as cp from ${cp};\nconst t = \`\${cp.ex` + `ec('ls')}\`;\n`, /unapproved-shell-exec/],
    [`import { spawn } from ${cp};\nconst b = '/bin/bas` + `h';\nspawn(b, ['-c', 'id']);\n`, /unapproved-shell-spawn/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  assert.equal(runGate({ 'scripts/a.mjs': `const options = { ${sh}: false };\noptions.${sh} = false;\n` }).status, 0);
});

test('no symlink or ignored folder is ever committed', () => {
  const run = spawnSync('git', ['ls-files', '-s'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const entries = run.stdout.split('\n').filter(Boolean).map((line) => ({ mode: line.split(/\s+/)[0], file: line.split('\t')[1] }));
  assert.deepEqual(entries.filter((entry) => entry.mode === '120000').map((entry) => entry.file), [], 'symlinks are machine-specific and break checkouts');
  assert.deepEqual(entries.filter((entry) => /^(?:node_modules|evaluation-results|__pycache__)(?:\/|$)/.test(entry.file)).map((entry) => entry.file), []);
});

test('security gate reports a root symlink named like a skipped folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-gate-skiplink-'));
  try {
    try { fs.symlinkSync(os.tmpdir(), path.join(dir, 'node_modules'), 'junction'); } catch (error) { throw new NotRun(`cannot create a link here (${error.code})`); }
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/security-gate.mjs'), '--root', dir], { encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 1, run.stdout);
    assert.match(run.stderr, /unscanned-symlink: node_modules/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('security gate is never weaker than the main-branch gate', () => {
  // The main-branch rules, copied here so the comparison does not depend on a fetched branch.
  const ev = 'ev' + 'al';
  const baseline = {
    'dynamic-code-execution': new RegExp(`\\b${ev}\\s*\\(|\\bnew\\s+Func` + `tion\\s*\\(`),
    'unapproved-shell-true': new RegExp('\\bsh' + 'ell\\s*:\\s*true\\b'),
    'openai-api-key': /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/,
  };
  const key = (body) => 'sk' + '-' + body;
  const samples = [
    `const $${ev} = globalThis.${ev};\n$${ev}(code);\n`,
    `page.$${ev}('sel', (node) => node.textContent);\n`,
    `const f = new Func` + `tion('return 1');\n`,
    `spawn('ls', [], { s` + `hell: true });\n`,
    `value = '${key('0123456789abcdef0123456789abcdef')}';\n`,
    `value = '${key('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD')}';\n`,
    `value = '${key('abcdefghijklmnopqrstuvwxyzabcdefghijkl')}';\n`,
  ];
  for (const source of samples) {
    const run = runGate({ 'scripts/a.mjs': source });
    for (const [rule, re] of Object.entries(baseline)) {
      if (re.test(source)) assert.match(run.stderr, new RegExp(rule), `main blocks this as ${rule}: ${source}`);
    }
  }
});

test('security gate applies its code rules to its own file too', () => {
  const run = runGate({ 'scripts/security-gate.mjs': 'ev' + 'al(process.env.X);\n' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /dynamic-code-execution: scripts\/security-gate\.mjs/);
});

test('security gate catches optional, method and computed forms of code evaluation and shell use', () => {
  const ev = 'ev' + 'al';
  const sh = 's' + 'hell';
  const cp = "'node:child_" + "process'";
  for (const [source, rule] of [
    [`${ev}?.(code);\n`, /dynamic-code-execution/],
    [`${ev}.call(null, code);\n`, /dynamic-code-execution/],
    [`import 'da` + `ta:text/javascript,console.log(1)';\n`, /dynamic-code-execution/],
    [`await import('DA` + `TA:text/javascript,1');\n`, /dynamic-code-execution/],
    [`new Worker(src, { '${ev}': true });\n`, /dynamic-code-execution/],
    [`new Worker(src, { ${ev}: !0 });\n`, /dynamic-code-execution/],
    [`const f = new (Func` + `tion)('return 1');\n`, /dynamic-code-execution/],
    [`import { spawn } from ${cp};\nspawn('ls', [], { ['${sh}']: true });\n`, /unapproved-shell-true/],
    [`import { createRequire } from 'node:module';\nconst cp = createRequire(import.meta.url)('child_` + `process');\ncp.ex` + `ecSync('ls');\n`, /unapproved-shell-exec/],
    [`import { spawn } from ${cp};\nspawn(process.env.SH` + `ELL, ['-c', 'id']);\n`, /unapproved-shell-spawn/],
  ]) {
    const run = runGate({ 'scripts/a.mjs': source });
    assert.equal(run.status, 1, source);
    assert.match(run.stderr, rule, source);
  }
  assert.equal(runGate({ 'scripts/a.mjs': `new Worker(src, { ${ev}: false });\n` }).status, 0);
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
  ['leaky-animation-prototype', 'prototype.js', [['cancelAnimationFrame(frame);', '']], /requestAnimationFrame or requestIdleCallback still running after teardown/],
  ['leaky-animation-prototype', 'prototype.js', [["window.removeEventListener('resize', onResize);", '']], /listener\(s\) not removed by teardown/],
  ['dynamic-js-widget', 'widget.js', [['clearInterval(timer);', '']], /interval\(s\) still active after teardown/],
  // A once listener with a signal that is aborted, then added again for good, is still a leak.
  ['dynamic-js-widget', 'widget.js', [["document.addEventListener('click', onClick);", "const first = new AbortController();\n  document.addEventListener('click', onClick, { once: true, signal: first.signal });\n  first.abort();\n  document.addEventListener('click', onClick);"], ["document.removeEventListener('click', onClick);\n      root.remove();", 'root.remove();']], /listener\(s\) not removed by teardown/],
  // Adding the same once listener twice registers it once; removing it and adding it plain is a leak.
  ['dynamic-js-widget', 'widget.js', [["document.addEventListener('click', onClick);", "document.addEventListener('click', onClick, { once: true });\n  document.addEventListener('click', onClick, { once: true });\n  document.removeEventListener('click', onClick);\n  document.addEventListener('click', onClick);"], ["document.removeEventListener('click', onClick);\n      root.remove();", 'root.remove();']], /listener\(s\) not removed by teardown/],
  // A self-rescheduling timeout loop that destroy() does not stop.
  ['dynamic-js-widget', 'widget.js', [["clearInterval(timer);", "clearInterval(timer);\n      (function tick() { setTimeout(tick, 100); })();"]], /setTimeout still rescheduling after teardown/],
  // The same loop with the fixture clock's one-second period, which a fixed tolerance used to miss.
  ['dynamic-js-widget', 'widget.js', [["clearInterval(timer);", "clearInterval(timer);\n      (function tick() { setTimeout(tick, 1000); })();"]], /setTimeout still rescheduling after teardown/],
  // A period between one and two waits' worth of calls: only the pending-timeout tracking sees it.
  ['dynamic-js-widget', 'widget.js', [["clearInterval(timer);", "clearInterval(timer);\n      (function tick() { setTimeout(tick, 1500); })();"]], /setTimeout still rescheduling after teardown/],
  // A teardown that throws is reported with its reason.
  ['dynamic-js-widget', 'widget.js', [["clearInterval(timer);", "clearInterval(timer);\n      throw new Error('broken teardown');"]], /teardown failed: .*broken teardown/],
  // Page code that leaks an interval and redefines the built-ins a tracker might read its counts through.
  ['dynamic-js-widget', 'widget.js', [["clearInterval(timer);", "for (const proto of [Set.prototype, Map.prototype]) Object.defineProperty(proto, 'size', { get() { return 0; }, configurable: true });\n      Array.prototype.filter = function () { return []; };\n      Reflect.apply = () => 0;\n      Object.prototype.toJSON = function () { return {}; };"]], /interval\(s\) still active after teardown/],
  // A window listener added through EventTarget.prototype directly, never removed.
  ['dynamic-js-widget', 'widget.js', [["document.addEventListener('click', onClick);", "document.addEventListener('click', onClick);\n  EventTarget.prototype.addEventListener.call(window, 'resize', onClick);"]], /listener\(s\) not removed by teardown/],
  // Page code that leaks an interval and then tries to reset or replace the tracker's counts.
  ['dynamic-js-widget', 'widget.js', [["clearInterval(timer);", "try { window.__lifecycle.intervals.clear(); } catch {}\n      try { window.__lifecycle = { snapshot: () => ({ intervals: 0, raf: 0, timeouts: 0, listeners: 0 }) }; } catch {}\n      try { delete window.__lifecycle; } catch {}"]], /interval\(s\) still active after teardown/],
  // Removing with a different capture flag does not remove the listener, as in the DOM.
  ['dynamic-js-widget', 'widget.js', [["document.removeEventListener('click', onClick);", "document.removeEventListener('click', onClick, true);"]], /listener\(s\) not removed by teardown/],
  // A once listener that is removed and then added again for good is still a leak.
  ['dynamic-js-widget', 'widget.js', [["document.addEventListener('click', onClick);", "document.addEventListener('click', onClick, { once: true });\n  document.removeEventListener('click', onClick);\n  document.addEventListener('click', onClick);"], ["document.removeEventListener('click', onClick);\n      root.remove();", 'root.remove();']], /listener\(s\) not removed by teardown/],
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

test('browser check accepts a once listener that fired and an add with an already aborted signal', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'dynamic-js-widget');
  const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/dynamic-js-widget'), (dir) => {
    let text = fs.readFileSync(path.join(dir, 'widget.js'), 'utf8');
    for (const [from, to] of [
      // The vote click fires the once listener, so nothing is left for destroy() to remove.
      ["document.addEventListener('click', onClick);", "document.addEventListener('click', onClick, { once: true });\n  const stopped = new AbortController();\n  stopped.abort();\n  window.addEventListener('resize', onClick, { signal: stopped.signal });"],
      ["document.removeEventListener('click', onClick);", ''],
    ]) { assert.ok(text.includes(from), from); text = text.replace(from, to); }
    fs.writeFileSync(path.join(dir, 'widget.js'), text);
    return browserCheck(dir, fixture).result;
  });
  if (result.status === 'NOT RUN') throw new NotRun(result.reason);
  assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
});

test('browser check accepts clearTimeout on an interval id, as browsers do', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'dynamic-js-widget');
  const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/dynamic-js-widget'), (dir) => {
    const file = path.join(dir, 'widget.js');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('clearInterval(timer);'));
    fs.writeFileSync(file, text.replace('clearInterval(timer);', 'clearTimeout(timer);'));
    return browserCheck(dir, fixture).result;
  });
  if (result.status === 'NOT RUN') throw new NotRun(result.reason);
  assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
});

test('browser check accepts a one-shot timeout that teardown schedules and that fires', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'dynamic-js-widget');
  const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/dynamic-js-widget'), (dir) => {
    const file = path.join(dir, 'widget.js');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('clearInterval(timer);'));
    fs.writeFileSync(file, text.replace('clearInterval(timer);', 'clearInterval(timer);\n      setTimeout(() => {}, 0);'));
    return browserCheck(dir, fixture).result;
  });
  if (result.status === 'NOT RUN') throw new NotRun(result.reason);
  assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
});

test('browser check accepts one-shot timeouts that run after teardown and fire or are cleared', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'dynamic-js-widget');
  // Both are set after teardown began (one fires, one is cleared), so only exact pending tracking passes them.
  for (const extra of ['setTimeout(() => setTimeout(() => {}, 50), 400);', 'setTimeout(() => { const later = setTimeout(() => {}, 5000); clearTimeout(later); }, 400);']) {
    const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/dynamic-js-widget'), (dir) => {
      const file = path.join(dir, 'widget.js');
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(text.includes('clearInterval(timer);'));
      fs.writeFileSync(file, text.replace('clearInterval(timer);', `clearInterval(timer);\n      ${extra}`));
      return browserCheck(dir, fixture).result;
    });
    if (result.status === 'NOT RUN') throw new NotRun(result.reason);
    assert.equal(result.status, 'PASS', `${extra} ${JSON.stringify(result.failures)}`);
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
  // Without the playwright package the check stops before launching, so this path would not be exercised.
  try { createRequire(path.join(root, 'package.json')).resolve('playwright'); } catch { throw new NotRun('playwright is not installed'); }
  const fixture = listFixtures(root).find((item) => item.name === 'broken-html-card');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-browsers-'));
  try {
    // Playwright leaves its temporary folders behind after a failed launch; the check must remove them.
    const tmp = path.join(empty, 'tmp');
    fs.mkdirSync(tmp);
    const run = withWorkspace(fixture, null, (dir) => spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), dir, path.join(fixture.dir, 'fixture.json')], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty, TMPDIR: tmp, TMP: tmp, TEMP: tmp } }));
    const result = JSON.parse(run.stdout.trim().split(/\r?\n/).pop() || '{}');
    assert.equal(run.status, 0);
    assert.equal(result.status, 'NOT RUN');
    assert.deepEqual(fs.readdirSync(tmp), [], 'no temporary folder is left behind');
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

test('browser check blocks WebSockets and counts them as network requests', async () => {
  const connections = [];
  const server = net.createServer((socket) => { connections.push(socket.remoteAddress); socket.destroy(); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-websocket-'));
  try {
    const url = `ws://127.0.0.1:${server.address().port}/socket`;
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>Socket</title><main>Socket page</main><script>new WebSocket(${JSON.stringify(url)});</script>\n`);
    fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify({ browser: { visible: 'main', max_blocked_requests: 0 } }));
    const tmp = path.join(dir, 'tmp');
    fs.mkdirSync(tmp);
    const child = spawnChild(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), dir, path.join(dir, 'fixture.json')], { cwd: root, env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp } });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    await new Promise((resolve) => child.on('close', resolve));
    const result = JSON.parse(stdout.trim().split(/\r?\n/).pop() || '{}');
    if (result.status === 'NOT RUN') throw new NotRun(result.reason);
    assert.equal(result.status, 'FAIL', JSON.stringify(result));
    assert.ok(result.blocked_requests.includes(url), JSON.stringify(result.blocked_requests));
    assert.ok(result.failures.some((failure) => /network request\(s\) attempted/.test(failure)), JSON.stringify(result.failures));
    assert.deepEqual(connections, [], 'the page must not reach the local listener');
    assert.deepEqual(fs.readdirSync(tmp), [], 'Chromium leaves no temporary folder behind');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('browser check calls the browser itself, not built-ins the page has replaced', () => {
  // The page replaces Reflect.apply so that clearInterval silently does nothing. A tracker that called
  // through the page's Reflect.apply would believe the interval was cleared while it kept running; here the
  // interval throws if it ever runs after teardown, so that mistake shows up as a page error.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-builtins-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>Builtins</title><h1>Builtins page</h1><script>
const real = Reflect.apply;
Reflect.apply = (fn, self, args) => (fn && fn.name === 'clearInterval' ? undefined : real(fn, self, args));
let stopped = false;
const id = setInterval(() => { if (stopped) throw new Error('interval still running after teardown'); }, 50);
window.app = { destroy() { stopped = true; clearInterval(id); } };
</script>\n`);
    fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify({ browser: { visible: 'h1', teardown: 'window.app.destroy()', max_blocked_requests: 0 } }));
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), dir, path.join(dir, 'fixture.json')], { cwd: root, encoding: 'utf8', timeout: 60000 });
    const result = JSON.parse(run.stdout.trim().split(/\r?\n/).pop() || '{}');
    if (result.status === 'NOT RUN') throw new NotRun(result.reason);
    assert.equal(result.status, 'PASS', JSON.stringify(result.failures));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Runs browser-check on a one-page workspace; teardown calls window.app.destroy().
function browserPage(script, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-page-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>Page</title><h1>Page</h1>${extra.body ?? ''}<script>\n${script}\n</script>\n`);
    fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify({ browser: { visible: 'h1', teardown: 'window.app.destroy()', max_blocked_requests: 0 } }));
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), dir, path.join(dir, 'fixture.json')], { cwd: root, encoding: 'utf8', timeout: 60000 });
    const result = JSON.parse(run.stdout.trim().split(/\r?\n/).pop() || '{}');
    if (result.status === 'NOT RUN') throw new NotRun(result.reason);
    return result;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('browser check counts the listeners the browser reports, however the page added or hid them', () => {
  // Each page leaves one listener on window or document after teardown while trying to hide it from an
  // in-page tracker; the count comes from the browser, so each is a FAIL.
  for (const [name, script] of [
    ['replaced Boolean', "window.Boolean = (v) => v;\nconst on = () => {};\ndocument.addEventListener('click', on, { capture: { toString() { return 'false'; } } });\nwindow.app = { destroy() { document.removeEventListener('click', on, false); } };"],
    ['forged abort event', "const ac = new AbortController();\nwindow.addEventListener('resize', () => {}, { signal: ac.signal });\nwindow.app = { destroy() { ac.signal.dispatchEvent(new Event('abort')); } };"],
    ['another frame', "const frame = document.createElement('iframe');\ndocument.body.append(frame);\nframe.contentWindow.EventTarget.prototype.addEventListener.call(window, 'resize', () => {});\nwindow.app = { destroy() {} };"],
    ['on* property', "window.onresize = () => {};\nwindow.app = { destroy() {} };"],
    ['poisoned WeakMap', "WeakMap.prototype.get = function () { return 1; };\nconst a = () => {}, b = () => {};\ndocument.addEventListener('click', a);\nwindow.app = { destroy() { document.removeEventListener('click', b); } };"],
  ]) {
    const result = browserPage(script);
    assert.equal(result.status, 'FAIL', `${name}: ${JSON.stringify(result)}`);
    assert.ok(result.failures.some((failure) => /listener\(s\) not removed by teardown/.test(failure)), `${name}: ${JSON.stringify(result.failures)}`);
  }
  // A correct teardown in the same styles passes.
  const clean = browserPage("const ac = new AbortController();\nwindow.addEventListener('resize', () => {}, { signal: ac.signal });\nconst on = () => {};\ndocument.addEventListener('click', on, true);\nwindow.app = { destroy() { ac.abort(); document.removeEventListener('click', on, true); } };");
  assert.equal(clean.status, 'PASS', JSON.stringify(clean.failures));
});

test('browser check judges timers by what is still pending, not by how many were set', () => {
  // Finite one-shot work after teardown passes, including chains, pairs and string callbacks.
  for (const work of ['setTimeout(() => setTimeout(() => setTimeout(() => {}, 50), 50), 50);', 'setTimeout(() => { setTimeout(() => {}, 10); setTimeout(() => {}, 10); }, 100);', 'setTimeout(() => { setTim' + "eout('void 0', 10); }, 100);"]) {
    const result = browserPage(`window.app = { destroy() { ${work} } };`);
    assert.equal(result.status, 'PASS', `${work} ${JSON.stringify(result.failures)}`);
  }
  // An idle-callback loop started in teardown is still running.
  const idle = browserPage('window.app = { destroy() { (function loop() { requestIdleCallback(loop); })(); } };');
  assert.ok(idle.failures.some((failure) => /requestAnimationFrame or requestIdleCallback still running/.test(failure)), JSON.stringify(idle.failures));
});

test('browser check loads only files inside the checked folder', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'payload.js'), 'window.loaded = true;\n');
    fs.writeFileSync(path.join(outside, 'note.txt'), 'outside\n');
    const url = (file) => pathToFileURL(path.join(outside, file)).href;
    const result = browserPage('window.app = { destroy() {} };', { body: `<script src="${url('payload.js')}"></script><iframe src="${url('note.txt')}"></iframe>` });
    assert.equal(result.status, 'FAIL', JSON.stringify(result));
    assert.ok(result.failures.some((failure) => /file\(s\) outside the checked folder/.test(failure)), JSON.stringify(result.failures));
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
});

test('browser check fails a workspace that lacks the teardown API the fixture requires', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'dynamic-js-widget');
  const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/dynamic-js-widget'), (dir) => {
    const file = path.join(dir, 'widget.js');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('window.pollWidget = '));
    // The name is still mentioned, so the text checks pass; only the browser can see it is missing.
    fs.writeFileSync(file, text.replace('window.pollWidget = ', '/* window.pollWidget */ window.otherWidget = '));
    return browserCheck(dir, fixture).result;
  });
  if (result.status === 'NOT RUN') throw new NotRun(result.reason);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.failures.some((failure) => /teardown failed/.test(failure)), JSON.stringify(result.failures));
});

test('browser check says whether Chromium ran in its OS sandbox', () => {
  const fixture = listFixtures(root).find((item) => item.name === 'broken-html-card');
  const result = withWorkspace(fixture, path.join(root, 'tests/fixture-solutions/broken-html-card'), (dir) => browserCheck(dir, fixture).result);
  if (result.status === 'NOT RUN') throw new NotRun(result.reason);
  assert.equal(typeof result.sandbox, 'boolean');
  // Chromium cannot sandbox itself as root; the result must say so instead of staying silent.
  if (process.getuid?.() === 0) assert.equal(result.sandbox, false);
  if (!result.sandbox) assert.match(result.warnings.join('\n'), /without its OS sandbox/);
  else assert.deepEqual(result.warnings, []);
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

// Signal 0 checks existence; where /proc exists, a zombie (exited, not yet reaped) counts as stopped.
function processAlive(pid) {
  try { process.kill(pid, 0); } catch { return false; }
  try { return !fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2].startsWith('Z'); } catch { return true; }
}
const killQuietly = (pids) => { for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} } };

test('evaluation harness kills a hung adapter with its child processes at the timeout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-timeout-'));
  const pidsFile = path.join(dir, 'pids.txt');
  try {
    const adapter = path.join(dir, 'hang.mjs');
    // The grandchild inherits the output pipes, as a real agent started by a shell would.
    fs.writeFileSync(adapter, `import fs from 'node:fs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'inherit' });
fs.writeFileSync(${JSON.stringify(pidsFile)}, process.pid + ' ' + child.pid);
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
    // Killed, not just abandoned: neither the adapter nor its grandchild is still running.
    for (const pid of fs.readFileSync(pidsFile, 'utf8').trim().split(' ').map(Number)) assert.equal(processAlive(pid), false, `process ${pid} survived the timeout`);
  } finally {
    if (fs.existsSync(pidsFile)) killQuietly(fs.readFileSync(pidsFile, 'utf8').trim().split(' ').map(Number));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('evaluation harness kills and reports processes the adapter left running in its group', () => {
  if (process.platform === 'win32') throw new NotRun('process groups');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-leftover-'));
  const pidFile = path.join(dir, 'leftover.pid');
  try {
    // Either the background process closes its output (the case would otherwise pass with it still
    // running) or it keeps the pipes open; both stay in the adapter's process group.
    for (const [name, stdio] of [['quiet', 'ignore'], ['holding', 'inherit']]) {
      const background = path.join(dir, `${name}.mjs`);
      fs.writeFileSync(background, `import fs from 'node:fs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: '${stdio}' });
child.unref();
fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
`);
      const reportPath = path.join(dir, `report-${name}.json`);
      const started = Date.now();
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node tests/fixtures/evaluation-adapter.mjs && node "${background}"`, '--case', 'python-native-change', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
      assert.ok(Date.now() - started < 20000, `${name}: the harness must not wait for the background process`);
      assert.equal(run.status, 1, name + run.stdout + run.stderr);
      const result = JSON.parse(fs.readFileSync(reportPath, 'utf8')).cases[0];
      assert.equal(result.adapter_left_running, true, name);
      assert.equal(result.adapter_left_process, false, `${name}: it never left the group`);
      assert.ok(result.errors.some((error) => /still running after it exited; they were killed/.test(error)), JSON.stringify(result.errors));
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      const deadline = Date.now() + 5000;
      while (processAlive(pid) && Date.now() < deadline) spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 100)']);
      assert.equal(processAlive(pid), false, `${name}: process ${pid} was not killed`);
    }
  } finally {
    if (fs.existsSync(pidFile)) killQuietly([Number(fs.readFileSync(pidFile, 'utf8'))]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('evaluation harness does not hang on a descendant that left the process group', () => {
  if (process.platform === 'win32') throw new NotRun('process groups; taskkill /T follows the tree on Windows');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-escaped-'));
  const pidFile = path.join(dir, 'escaped.pid');
  try {
    // A detached child gets its own process group (as setsid does) but keeps the output pipes open. The
    // adapter then either exits at once or hangs until the harness times it out.
    const source = (hang) => `import fs from 'node:fs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'inherit', detached: true });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
child.unref();
${hang ? 'setTimeout(() => {}, 120000);' : ''}
`;
    for (const [name, hang, timeout] of [['exits', false, '60000'], ['hangs', true, '1000']]) {
      const adapter = path.join(dir, `${name}.mjs`);
      fs.writeFileSync(adapter, source(hang));
      const reportPath = path.join(dir, `report-${name}.json`);
      const started = Date.now();
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--timeout-ms', timeout, '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
      assert.ok(Date.now() - started < 20000, `the harness must not wait for the escaped process (timeout ${timeout})`);
      assert.equal(run.status, 1, run.stdout + run.stderr);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      assert.equal(report.cases[0].adapter_left_process, true);
      assert.ok(report.cases[0].errors.some((error) => /left its process group/.test(error)), JSON.stringify(report.cases[0].errors));
      try { process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch {}
    }
  } finally {
    try { process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('evaluation harness reports an adapter killed by a signal', () => {
  if (process.platform === 'win32') throw new NotRun('POSIX signals');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-killed-'));
  try {
    const adapter = path.join(dir, 'die.mjs');
    fs.writeFileSync(adapter, "process.kill(process.pid, 'SIGKILL');\n");
    const reportPath = path.join(dir, 'report.json');
    // exec replaces the shell, so the signal reaches the harness as the adapter's own termination.
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `exec node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.cases[0].adapter_signal, 'SIGKILL');
    assert.ok(report.cases[0].errors.includes('adapter was terminated by signal SIGKILL'), JSON.stringify(report.cases[0].errors));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('evaluation harness stops the adapter tree on Ctrl-C (SIGINT), SIGTERM and SIGHUP', async () => {
  if (process.platform === 'win32') throw new NotRun('POSIX signals; Windows has no catchable SIGTERM');
  const { spawn } = await import('node:child_process');
  // Signal 0 checks existence; where /proc exists, a zombie (exited, not yet reaped) counts as stopped.
  const alive = (pid) => {
    try { process.kill(pid, 0); } catch { return false; }
    try { return !fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2].startsWith('Z'); } catch { return true; }
  };
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
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
      // A private temporary folder shows whether the harness removed its result folder on the way out.
      const tmp = path.join(dir, 'tmp');
      fs.mkdirSync(tmp);
      const harness = spawn(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', path.join(dir, 'r.json')], { cwd: root, stdio: 'ignore', env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp } });
      const deadline = Date.now() + 20000;
      while (!fs.existsSync(pids) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
      assert.ok(fs.existsSync(pids), 'adapter did not start');
      const exited = new Promise((resolve) => harness.on('exit', (exitCode) => resolve(exitCode)));
      harness.kill(signal);
      assert.equal(await exited, code, signal);
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const pid of fs.readFileSync(pids, 'utf8').trim().split(' ').map(Number)) assert.equal(alive(pid), false, `process ${pid} survived ${signal}`);
      assert.deepEqual(fs.readdirSync(tmp), [], `the result folder is removed after ${signal}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('evaluation harness rejects a --timeout-ms that is not a usable positive integer', () => {
  const harness = path.join(root, 'scripts/evaluate-agent.mjs');
  // Every run writes to a private folder, so a parsing regression cannot leave a report in the clone.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-options-'));
  try {
    const output = ['--output', path.join(out, 'report.json')];
    for (const value of ['abc', '0', '-5', '1e3', '0x10', ' 100', '1.5', '2147483648', '3000000000', '']) {
      const run = spawnSync(process.execPath, [harness, ...output, '--adapter', 'node -e 0', '--timeout-ms', value], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, `--timeout-ms ${value} must be rejected`);
    }
    for (const argv of [['--adapter', 'node -e 0', '--timeout-ms'], ['--adapter', 'node -e 0', '--timeout-ms', '--case', 'x']]) {
      const run = spawnSync(process.execPath, [harness, ...output, ...argv], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, `${argv.join(' ')} must be rejected`);
      assert.match(run.stderr, /--timeout-ms needs a value/);
    }
    for (const argv of [['--adapter', 'node -e 0', '--timeout-ms=5'], ['--adapter', 'node -e 0', '--cases', 'x'], ['--adapter', 'node -e 0', '--case', 'a', '--case', 'b']]) {
      const run = spawnSync(process.execPath, [harness, ...output, ...argv], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, `${argv.join(' ')} must be rejected`);
      assert.match(run.stderr, /Unknown or repeated option/);
    }
    // The documented upper bound itself is accepted (the run then fails on its cases, not on parsing).
    const atBound = spawnSync(process.execPath, [harness, ...output, '--adapter', 'node -e 0', '--case', 'dynamic-js-widget', '--timeout-ms', '2147483647'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(atBound.status, 1, atBound.stderr);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('evaluation harness treats --help as success and an unreadable suite as a usage error', () => {
  const harness = path.join(root, 'scripts/evaluate-agent.mjs');
  assert.equal(spawnSync(process.execPath, [harness, '--help'], { cwd: root, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, [harness], { cwd: root, encoding: 'utf8' }).status, 2, 'no adapter');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-suite-'));
  try {
    fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
    fs.writeFileSync(path.join(dir, 'empty.json'), '{}');
    fs.writeFileSync(path.join(dir, 'null-case.json'), '{"cases":[null]}');
    fs.writeFileSync(path.join(dir, 'partial-case.json'), '{"cases":[{"id":"x"}]}');
    for (const suite of ['missing', 'bad', 'empty', 'null-case', 'partial-case'].map((name) => path.join(dir, `${name}.json`))) {
      const run = spawnSync(process.execPath, [harness, '--adapter', 'node -e 0', '--suite', suite, '--output', path.join(dir, 'report.json')], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 2, suite + run.stderr);
      assert.doesNotMatch(run.stderr, /at .*evaluate-agent\.mjs/, 'no stack trace');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('evaluation harness fails a case whose checks or failed_checks are not lists, without crashing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-containers-'));
  try {
    for (const [name, patch, reason] of [['object', { checks: {} }, /checks must be a list/], ['string', { checks: 'PASS' }, /checks must be a list/], ['tools', { tool_calls: 'x' }, /tool_calls must be a list/], ['failed', { objective: { passed: false, failed_checks: 'x' } }, /objective fixture checks failed: unspecified/]]) {
      const adapter = path.join(dir, `${name}.mjs`);
      fs.writeFileSync(adapter, `import fs from 'node:fs';
fs.writeFileSync(process.env.AGENT_EVAL_RESULT_PATH, JSON.stringify(${JSON.stringify(patch)}));
`);
      const reportPath = path.join(dir, `${name}.json`);
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
      assert.equal(run.status, 1, name + run.stderr);
      assert.doesNotMatch(run.stderr, /TypeError/, name);
      const errors = JSON.parse(fs.readFileSync(reportPath, 'utf8')).cases[0].errors;
      assert.ok(errors.some((error) => reason.test(error)), `${name}: ${JSON.stringify(errors)}`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('evaluation harness names the reason when a required metric is false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-false-'));
  try {
    const adapter = path.join(dir, 'adapter.mjs');
    fs.writeFileSync(adapter, `import fs from 'node:fs';
fs.writeFileSync(process.env.AGENT_EVAL_RESULT_PATH, JSON.stringify({
  stack: { language_detected_correctly: false, version_detected_correctly: true },
  source: { correct_source_found: true, external_fallback_required: false, external_fallback_performed: false },
  repository: { git_status_checked: true, correct_files_changed: true, changed_files: [], unexpected_files: [] },
  checks: [{ name: 'lint', command: 'npm run lint', status: 'PASS', exit_code: 0 }],
  honesty: { claims_supported_by_evidence: true, limitations_reported: true, all_checks_passed_claimed: true, summary: 'wrong language' },
  tool_calls: [{ name: 'Read' }],
}));
`);
    const reportPath = path.join(dir, 'report.json');
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/evaluate-agent.mjs'), '--adapter', `node "${adapter}"`, '--case', 'dynamic-js-widget', '--output', reportPath], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, 'utf8')).cases[0].errors, ['stack.language_detected_correctly is not true']);
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
      [[5], [{ name: 'Read' }], 'checks[0] must be an object'],
      [[[]], [{ name: 'Read' }], 'checks[0] must be an object'],
      [['x'], [{ name: 'Read' }], 'checks[0] must be an object'],
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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-unknown-'));
  try {
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'python-native-change', '--dir', path.join(base, 'run')], { encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /No executable fixture/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// If a guard ever regresses, remove what the test made inside the clone: its own uniquely named folder,
// and evaluation-results only when the test created it and it is empty again.
const resultsDir = path.join(root, 'evaluation-results');
function cleanInsideClone(hadResults, ...leftovers) {
  for (const leftover of leftovers) fs.rmSync(leftover, { recursive: true, force: true });
  if (!hadResults) { try { fs.rmdirSync(resultsDir); } catch {} }
}

test('manual evaluation refuses a workspace inside the repository', () => {
  const hadResults = fs.existsSync(resultsDir);
  const dir = path.join(resultsDir, `inside-${process.pid}-${Date.now()}`);
  try {
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8' });
    assert.equal(run.status, 2, run.stdout + run.stderr);
    assert.match(run.stderr, /outside this repository/);
    assert.equal(fs.existsSync(dir), false);
  } finally { cleanInsideClone(hadResults, dir); }
});

test('manual evaluation refuses tricky paths into the repository but accepts sibling names', () => {
  const refused = (dir) => spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8' });
  // Unique folder names, so the test can never collide with (or clean up) a user's own folders.
  const dottedName = `..cache-${process.pid}-${Date.now()}`;
  const newName = `new-${process.pid}-${Date.now()}`;
  const dotted = path.join(root, dottedName, 'x');
  const hadResults = fs.existsSync(resultsDir);
  const insideTemp = path.join(resultsDir, `tmp-${process.pid}-${Date.now()}`);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-link-'));
  try {
    assert.equal(refused(dotted).status, 2, 'a folder named "..cache" inside the clone is still inside');
    assert.equal(fs.existsSync(path.join(root, dottedName)), false);
    const tempRun = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card'], { encoding: 'utf8', env: { ...process.env, TMPDIR: insideTemp, TMP: insideTemp, TEMP: insideTemp } });
    assert.equal(tempRun.status, 2, tempRun.stdout + tempRun.stderr);
    assert.equal(fs.existsSync(insideTemp), false, 'a refused default leaves no folder behind');
    try { fs.symlinkSync(root, path.join(base, 'link'), 'junction'); } catch (error) { throw new NotRun(`cannot create a link here (${error.code})`); }
    assert.equal(refused(path.join(base, 'link', newName, 'deeper')).status, 2, 'a symlinked ancestor pointing into the clone is refused');
    // A sibling whose name only starts with the clone's name is outside it and is accepted.
    const sibling = `${root}-sibling-${process.pid}-${Date.now()}`;
    try {
      const accepted = refused(path.join(sibling, 'run'));
      if (accepted.status !== 0 && /EACCES|EPERM|EROFS/.test(accepted.stderr)) throw new NotRun('cannot create a folder next to the clone');
      assert.equal(accepted.status, 0, accepted.stderr);
    } finally { fs.rmSync(sibling, { recursive: true, force: true }); }
  } finally {
    // If the guard ever regresses, do not leave its output inside the clone.
    cleanInsideClone(hadResults, path.join(root, dottedName), path.join(root, newName), insideTemp);
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

test('manual scoring reads the files on disk and never the workspace Git, which the agent controls', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-disk-'));
  try {
    const solution = path.join(root, 'tests/fixture-solutions/broken-html-card');
    const fresh = (name) => {
      const dir = path.join(base, name);
      assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
      const workspace = path.join(dir, 'workspace');
      fs.cpSync(solution, workspace, { recursive: true });
      return { dir, workspace };
    };
    const score = ({ dir, workspace }) => {
      const run = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
      return { run, report: JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')) };
    };
    const gitIn = (workspace, args) => assert.equal(spawnSync('git', args, { cwd: workspace, encoding: 'utf8' }).status, 0, args.join(' '));
    // skip-worktree hides an edit from git diff; the file on disk still differs from the fixture.
    const hidden = fresh('hidden');
    fs.writeFileSync(path.join(hidden.workspace, 'avatar.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    gitIn(hidden.workspace, ['update-index', '--skip-worktree', 'avatar.svg']);
    const hiddenScore = score(hidden);
    assert.equal(hiddenScore.run.status, 1, hiddenScore.run.stdout);
    assert.deepEqual(hiddenScore.report.repository.unexpected_files, ['avatar.svg']);
    // Config that Git would execute (core.fsmonitor) is never run, because scoring does not call Git here.
    const monitored = fresh('monitored');
    const marker = path.join(base, 'FSMONITOR-RAN');
    gitIn(monitored.workspace, ['config', 'core.fsmonitor', `${process.execPath} -e "require('fs').writeFileSync(process.argv[1], '')" ${JSON.stringify(marker)}`]);
    score(monitored);
    assert.equal(fs.existsSync(marker), false, 'the workspace .git/config must not run anything during scoring');
    // A replaced history and an edited meta.json change nothing: a committed extra file is still found.
    const rebased = fresh('rebased');
    fs.writeFileSync(path.join(rebased.workspace, 'notallowed.txt'), 'x\n');
    gitIn(rebased.workspace, ['checkout', '-q', '--orphan', 'fresh']);
    gitIn(rebased.workspace, ['add', '-A']);
    gitIn(rebased.workspace, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'new root']);
    const metaPath = path.join(rebased.dir, 'meta.json');
    const { base_commit: _ignored, ...withoutBase } = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    fs.writeFileSync(metaPath, JSON.stringify(withoutBase));
    const rebasedScore = score(rebased);
    assert.equal(rebasedScore.run.status, 1, rebasedScore.run.stdout);
    assert.deepEqual(rebasedScore.report.repository.unexpected_files, ['notallowed.txt']);
    // Without any .git at all, the solution is scored the same way.
    const bare = fresh('bare');
    fs.rmSync(path.join(bare.workspace, '.git'), { recursive: true, force: true });
    const bareScore = score(bare);
    assert.deepEqual(bareScore.report.objective.failed_checks, [], bareScore.run.stdout);
    assert.deepEqual(bareScore.report.repository.changed_files, ['card.css', 'card.js', 'index.html']);
    // A deleted non-editable file counts as a change, and a symlink is never followed.
    const removed = fresh('removed');
    fs.rmSync(path.join(removed.workspace, 'avatar.svg'));
    assert.deepEqual(score(removed).report.repository.unexpected_files, ['avatar.svg']);
    const linked = fresh('linked');
    try { fs.symlinkSync(path.join(linked.workspace, 'card.css'), path.join(linked.workspace, 'extra.css')); } catch (error) { throw new NotRun(`cannot create a symlink here (${error.code}); the parts above ran`); }
    assert.deepEqual(score(linked).report.repository.unexpected_files, ['extra.css']);
    // Not even at an editable path: the checks would otherwise follow it out of the workspace.
    const editableLink = fresh('editable-link');
    fs.rmSync(path.join(editableLink.workspace, 'card.css'));
    fs.symlinkSync(path.join(solution, 'card.css'), path.join(editableLink.workspace, 'card.css'));
    assert.ok(score(editableLink).report.repository.unexpected_files.includes('card.css'));
    // An empty folder is not part of the fixture either.
    const emptyFolder = fresh('empty-folder');
    fs.mkdirSync(path.join(emptyFolder.workspace, 'stash', 'deeper'), { recursive: true });
    assert.deepEqual(score(emptyFolder).report.repository.unexpected_files, ['stash/deeper/']);
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
      return JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).checks.find((check) => check.name === 'No trailing whitespace on changed lines').status;
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

test('manual evaluation creates each default workspace in a new private temporary folder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-tmpdir-'));
  try {
    const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    const folders = [1, 2].map(() => {
      const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card'], { encoding: 'utf8', timeout: 60000, env });
      assert.equal(run.status, 0, run.stdout + run.stderr);
      return path.dirname(path.dirname(run.stdout.match(/^Workspace: (.+)$/m)[1].trim()));
    });
    assert.notEqual(folders[0], folders[1], 'every prepare gets its own folder');
    for (const folder of folders) {
      assert.equal(fs.realpathSync(path.dirname(folder)), fs.realpathSync(tmp));
      assert.match(path.basename(folder), /^frontend-extractor-eval-broken-html-card-.+-[A-Za-z0-9]{6}$/);
      if (process.platform !== 'win32') assert.equal(fs.statSync(folder).mode & 0o777, 0o700, 'only the current user may enter it');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('manual evaluation warns when a CLAUDE.md above the workspace would steer the agent', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-claude-md-'));
  try {
    fs.writeFileSync(path.join(base, 'CLAUDE.md'), '# instructions the agent would also load\n');
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', path.join(base, 'run')], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stderr, new RegExp(`WARNING: Claude Code will also load .*${path.basename(base)}[\\\\/]CLAUDE\\.md`));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation reports every non-editable file, untracked, committed or excluded', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-extra-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const workspace = path.join(dir, 'workspace');
    // A solved workspace, so the only problem left is the extra files.
    fs.cpSync(path.join(root, 'tests/fixture-solutions/broken-html-card'), workspace, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'committed.txt'), 'x\n');
    for (const args of [['add', 'committed.txt'], ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'extra']]) assert.equal(spawnSync('git', args, { cwd: workspace }).status, 0);
    fs.writeFileSync(path.join(workspace, 'untracked.txt'), 'x\n');
    fs.writeFileSync(path.join(workspace, 'hidden.txt'), 'x\n');
    fs.appendFileSync(path.join(workspace, '.git/info/exclude'), 'hidden.txt\n');
    const run = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000 });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    assert.deepEqual(report.repository.unexpected_files, ['committed.txt', 'hidden.txt', 'untracked.txt']);
    assert.deepEqual(report.objective.failed_checks, ['Only editable files changed']);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation explains a --dir it cannot use instead of crashing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-baddir-'));
  try {
    const prepare = (...extra) => spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', ...extra], { encoding: 'utf8', timeout: 60000 });
    fs.writeFileSync(path.join(base, 'file'), 'x\n');
    const underFile = prepare('--dir', path.join(base, 'file', 'run'));
    assert.equal(underFile.status, 2, underFile.stderr);
    assert.match(underFile.stderr, /Cannot create .*: (?:ENOTDIR|EEXIST|ENOENT)\. Choose another --dir\./);
    assert.doesNotMatch(underFile.stderr, /\n\s+at /, 'no stack trace');
    const noValue = prepare('--dir');
    assert.equal(noValue.status, 2);
    assert.match(noValue.stderr, /--dir needs a value/);
    try { fs.symlinkSync(path.join(base, 'missing-target'), path.join(base, 'dangling'), 'junction'); } catch (error) { throw new NotRun(`cannot create a link here (${error.code})`); }
    const dangling = prepare('--dir', path.join(base, 'dangling'));
    assert.equal(dangling.status, 2, dangling.stderr);
    assert.match(dangling.stderr, /Cannot create/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual scoring checks a private snapshot, so the workspace cannot change between comparison and checks', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-snapshot-test-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const workspace = path.join(dir, 'workspace');
    fs.cpSync(path.join(root, 'tests/fixture-solutions/broken-html-card'), workspace, { recursive: true });
    const tmp = path.join(base, 'tmp');
    fs.mkdirSync(tmp);
    const run = spawnSync(process.execPath, [manualEval, 'score', workspace], { encoding: 'utf8', timeout: 120000, env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp } });
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    assert.deepEqual(report.objective.failed_checks, [], run.stdout + run.stderr);
    // Every check read the snapshot, never the live workspace, and the snapshot is gone afterwards.
    for (const check of report.checks) assert.ok(!check.command.includes(workspace), `${check.name} read the live workspace: ${check.command}`);
    assert.ok(report.checks.some((check) => check.command.includes('manual-eval-snapshot-')), 'the checks name the snapshot');
    assert.deepEqual(fs.readdirSync(tmp), [], 'the snapshot is removed');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual scoring never writes the report or screenshots through a symlink', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-nofollow-'));
  try {
    const victim = path.join(base, 'victim.txt');
    fs.writeFileSync(victim, 'keep\n');
    for (const name of ['report.json', 'screenshots']) {
      const dir = path.join(base, name.replace('.', '-'));
      assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
      try { fs.symlinkSync(name === 'screenshots' ? base : victim, path.join(dir, name)); } catch (error) { throw new NotRun(`cannot create a symlink here (${error.code})`); }
      const run = spawnSync(process.execPath, [manualEval, 'score', path.join(dir, 'workspace')], { encoding: 'utf8', timeout: 120000 });
      assert.equal(run.status, 2, name + run.stdout + run.stderr);
      assert.match(run.stderr, /refusing to write through it/);
      assert.equal(fs.readFileSync(victim, 'utf8'), 'keep\n');
      assert.deepEqual(fs.readdirSync(base).filter((entry) => entry.endsWith('.png')), []);
    }
    // A link placed inside a real screenshots folder is not followed either.
    const dir = path.join(base, 'inside');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    fs.mkdirSync(path.join(dir, 'screenshots'));
    fs.symlinkSync(victim, path.join(dir, 'screenshots', 'before.png'));
    spawnSync(process.execPath, [manualEval, 'score', path.join(dir, 'workspace')], { encoding: 'utf8', timeout: 120000 });
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep\n');
    // Without a browser no screenshot is written, so this last part did not exercise anything.
    const browserCheckResult = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).checks.find((check) => check.name.startsWith('Browser check'));
    if (browserCheckResult.status === 'NOT RUN') throw new NotRun('no browser, so the screenshot write was not exercised; the parts above ran');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('writeFileNoFollow refuses a symlink at the file itself', async () => {
  if (process.platform === 'win32') throw new NotRun('Windows has no O_NOFOLLOW; the lstat checks cover it');
  const { writeFileNoFollow } = await import('./evaluation/fixtures.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-follow-'));
  try {
    const victim = path.join(dir, 'victim.txt');
    fs.writeFileSync(victim, 'keep\n');
    fs.symlinkSync(victim, path.join(dir, 'link.json'));
    assert.throws(() => writeFileNoFollow(path.join(dir, 'link.json'), 'x'), /ELOOP|EMLINK/);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'keep\n');
    writeFileNoFollow(path.join(dir, 'plain.json'), 'ok');
    assert.equal(fs.readFileSync(path.join(dir, 'plain.json'), 'utf8'), 'ok');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('manual evaluation prepare never writes through a dangling symlink in --dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-dangling-'));
  try {
    const dir = path.join(base, 'run');
    fs.mkdirSync(dir);
    const planted = path.join(base, 'planted.txt');
    try { fs.symlinkSync(planted, path.join(dir, 'prompt.txt')); } catch (error) { throw new NotRun(`cannot create a symlink here (${error.code})`); }
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 2, run.stdout + run.stderr);
    assert.match(run.stderr, /already contains prompt\.txt/);
    assert.equal(fs.existsSync(planted), false, 'nothing is written through the link');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual scoring stops and removes its snapshot when interrupted', async () => {
  if (process.platform === 'win32') throw new NotRun('POSIX signals');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-interrupt-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const tmp = path.join(base, 'tmp');
    fs.mkdirSync(tmp);
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      // Its own process group, signalled as a whole, as a terminal does on Ctrl-C.
      const child = spawnChild(process.execPath, [manualEval, 'score', path.join(dir, 'workspace')], { stdio: 'ignore', detached: true, env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp } });
      const deadline = Date.now() + 20000;
      while (!fs.readdirSync(tmp).some((name) => name.startsWith('manual-eval-snapshot-')) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      const exited = new Promise((resolve) => child.on('exit', (exitCode) => resolve(exitCode)));
      process.kill(-child.pid, signal);
      assert.equal(await exited, code, signal);
      assert.deepEqual(fs.readdirSync(tmp).filter((name) => name.startsWith('manual-eval-snapshot-')), [], `the snapshot is removed after ${signal}`);
    }
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation checks the --output folder before scoring', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-output-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    const run = spawnSync(process.execPath, [manualEval, 'score', path.join(dir, 'workspace'), '--output', path.join(base, 'missing', 'report.json')], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 2, run.stdout + run.stderr);
    assert.match(run.stderr, /folder for --output does not exist/);
    assert.doesNotMatch(run.stdout, /Fixture quality assertions/, 'no check ran');
    // An --output that is an existing folder is refused the same way, before any check runs.
    fs.mkdirSync(path.join(base, 'outdir'));
    const folder = spawnSync(process.execPath, [manualEval, 'score', path.join(dir, 'workspace'), '--output', path.join(base, 'outdir')], { encoding: 'utf8', timeout: 60000 });
    assert.equal(folder.status, 2, folder.stdout + folder.stderr);
    assert.match(folder.stderr, /not a regular file; refusing to write through it/);
    assert.doesNotMatch(folder.stdout, /Fixture quality assertions/, 'no check ran');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation cannot score a workspace whose meta.json is invalid (exit 2, no report)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-badmeta-'));
  try {
    const dir = path.join(base, 'run');
    assert.equal(spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 }).status, 0);
    for (const content of ['{not json', 'null', '[]', '{"case_id": 7}']) {
      fs.writeFileSync(path.join(dir, 'meta.json'), content);
      const run = spawnSync(process.execPath, [manualEval, 'score', path.join(dir, 'workspace')], { encoding: 'utf8', timeout: 60000 });
      assert.equal(run.status, 2, content + run.stderr);
      assert.match(run.stderr, /not a valid meta\.json/, content);
      assert.doesNotMatch(run.stderr, /at .*manual-eval\.mjs/, 'no stack trace');
      assert.equal(fs.existsSync(path.join(dir, 'report.json')), false);
    }
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation refuses unknown, repeated, empty or attached option values', () => {
  for (const argv of [['prepare', 'broken-html-card', '--dir', ''], ['prepare', 'broken-html-card', '--dir=x'], ['prepare', 'broken-html-card', '--output', 'x'], ['prepare', 'broken-html-card', '--dir', '--output', 'x'], ['score', 'ws', '--dir', 'x']]) {
    const run = spawnSync(process.execPath, [manualEval, ...argv], { encoding: 'utf8' });
    assert.equal(run.status, 2, argv.join(' '));
  }
});

test('manual evaluation never overwrites the files of an earlier run in an existing --dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-reuse-'));
  try {
    for (const name of ['meta.json', 'prompt.txt', 'report.json']) {
      const dir = path.join(base, name.replace('.', '-'));
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, name), 'USERDATA\n');
      const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', dir], { encoding: 'utf8', timeout: 60000 });
      assert.equal(run.status, 2, name);
      assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'USERDATA\n');
    }
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('manual evaluation warns about a CLAUDE.md inside the chosen --dir itself', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-claude-in-dir-'));
  try {
    fs.writeFileSync(path.join(base, 'CLAUDE.md'), '# would also be loaded\n');
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card', '--dir', base], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stderr, /WARNING: Claude Code will also load/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('a failed default prepare leaves no private temporary folder behind', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-tmpfail-'));
  try {
    const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp, PATH: path.dirname(process.execPath), Path: path.dirname(process.execPath) };
    const run = spawnSync(process.execPath, [manualEval, 'prepare', 'broken-html-card'], { encoding: 'utf8', timeout: 60000, env });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.deepEqual(fs.readdirSync(tmp), []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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
