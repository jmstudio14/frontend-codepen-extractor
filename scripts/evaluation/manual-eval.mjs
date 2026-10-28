#!/usr/bin/env node
/**
 * Manual evaluation without any API key: prepare a fixture workspace, work on it in Claude Code
 * with a normal subscription, then score it with the fixture's objective and browser checks.
 * Usage:
 *   node scripts/evaluation/manual-eval.mjs prepare <case-id> [--dir <path>]
 *   node scripts/evaluation/manual-eval.mjs score <workspace> [--output <report.json>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPrompt, findFixture, hostOnlyFiles, writeFileNoFollow } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [command, target, ...rest] = process.argv.slice(2);
const usage = () => { console.error('Usage: manual-eval.mjs prepare <case-id> [--dir <path>] | score <workspace> [--output <report.json>]'); process.exit(2); };
// Options are strict: only the ones a command takes, each once, with a non-empty value. An unknown
// option, `--name=value` or an empty value is an error rather than a silent no-op.
const ALLOWED_OPTIONS = { prepare: ['--dir'], score: ['--output'] };
const options = {};
for (let i = 0; i < rest.length; i += 2) {
  const name = rest[i], value = rest[i + 1];
  if (!(ALLOWED_OPTIONS[command] ?? []).includes(name) || name in options) { console.error(`Unknown or repeated option for ${command}: ${name}`); usage(); }
  if (value === undefined || value === '' || value.startsWith('--')) { console.error(`${name} needs a value.`); process.exit(2); }
  options[name] = value;
}
const option = (name) => options[name] ?? null;
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60000 });
  return { command: [cmd, ...args].join(' '), exit_code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error?.message || null };
};
// Scoring runs its checks asynchronously, so a signal is handled at once rather than after the run: the
// running check is stopped, and the exit handler removes the snapshot.
let activeCheck = null;
const runCheck = (cmd, args, cwd) => new Promise((resolve) => {
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  activeCheck = child;
  let stdout = '', stderr = '', error = null;
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  child.on('error', (err) => { error = err.message; });
  child.on('close', (code) => {
    clearTimeout(timer);
    activeCheck = null;
    resolve({ command: [cmd, ...args].join(' '), exit_code: code ?? 1, stdout, stderr, error });
  });
});
const git = (args, cwd) => run('git', args, cwd);
// The workspace must live outside this clone: Claude Code loads CLAUDE.md from every parent directory,
// and the solutions and assertion scripts would be a few directories away from the agent.
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
};
// Resolves symlinks through the nearest existing ancestor, so a link pointing into the clone is caught
// even when the folders below it do not exist yet.
function resolveThroughExisting(target) {
  let existing = path.resolve(target);
  const rest = [];
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) { rest.unshift(path.basename(existing)); existing = path.dirname(existing); }
  try { return path.join(fs.realpathSync(existing), ...rest); } catch { return path.resolve(target); }
}
// The fixture's source files as the agent receives them: host-only files, .git and node_modules excluded.
const copyFixture = (fixture, destination) => fs.cpSync(fixture.dir, destination, { recursive: true, filter: (src) => !['.git', 'node_modules', ...hostOnlyFiles(fixture.manifest)].includes(path.basename(src)) });
// Regular files under dir by relative path ('/' separators), skipping the top-level .git. Symlinks and other
// special entries are listed apart: no fixture has them, and following one could read outside the workspace.
function listTree(dir) {
  const files = new Map(), special = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (rel === '.git') continue;
      if (entry.isDirectory()) {
        // An empty folder is not part of any fixture, so it is reported like a special entry.
        const before = files.size + special.length;
        walk(path.join(current, entry.name), rel + '/');
        if (files.size + special.length === before) special.push(rel + '/');
      }
      else if (entry.isFile()) files.set(rel, path.join(current, entry.name));
      else special.push(rel);
    }
  };
  walk(dir, '');
  return { files, special };
}
// A private copy of the workspace's regular files, each read once. The comparison and every check read
// only this copy, so the workspace changing during scoring does not change the result. (A process still
// running as the same user could write into the copy too; scoring trusts that there is none, as the
// measurement protocol says.) Symlinks and other special entries are not copied; they are reported instead.
function snapshotWorkspace(workspace, dir) {
  const { files, special } = listTree(workspace);
  for (const [rel, full] of files) {
    const target = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, fs.readFileSync(full));
  }
  return special;
}
// The snapshot compared byte for byte with a fresh copy of the fixture. The workspace's own Git repository
// is never read while scoring: the agent controls it (index flags such as skip-worktree, a rewritten
// history, core.fsmonitor and other config that Git would execute), so it is not evidence.
function compareWithFixture(fixture, snapshot, special) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-fixture-'));
  try {
    copyFixture(fixture, path.join(dir, 'fixture'));
    const original = listTree(path.join(dir, 'fixture')).files, current = listTree(snapshot);
    const changed = new Set(special);
    const contents = new Map();
    for (const rel of new Set([...original.keys(), ...current.files.keys()])) {
      const before = original.has(rel) ? fs.readFileSync(original.get(rel)) : null;
      const after = current.files.has(rel) ? fs.readFileSync(current.files.get(rel)) : null;
      if (before && after && before.equals(after)) continue;
      changed.add(rel);
      contents.set(rel, { before, after });
    }
    return { changed: [...changed].sort(), contents };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// Trailing spaces or tabs on lines the agent added; a CRLF line ending (common on Windows) is not one.
function trailingWhitespace(contents) {
  const problems = [];
  for (const [rel, { before, after }] of contents) {
    if (!after || after.includes(0)) continue;
    const old = new Map();
    for (const line of (before?.toString('utf8') ?? '').split('\n')) old.set(line, (old.get(line) ?? 0) + 1);
    after.toString('utf8').split('\n').forEach((line, index) => {
      if (old.get(line)) { old.set(line, old.get(line) - 1); return; }
      if (/[ \t]$/.test(line.replace(/\r$/, ''))) problems.push(`${rel}:${index + 1}: trailing whitespace`);
    });
  }
  return problems;
}

function prepare(caseId) {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const testCase = suite.cases.find((item) => item.id === caseId);
  const fixture = testCase && findFixture(root, caseId);
  if (!fixture) { console.error(`No executable fixture for case "${caseId}". Cases with fixtures: see tests/fixtures/*/fixture.json.`); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Without --dir, mkdtemp creates a fresh private folder, so another user of a shared temp folder cannot
  // pre-create it or own it.
  // Check the temporary folder before creating anything in it, so a refusal leaves nothing behind.
  if (!option('--dir') && isInside(resolveThroughExisting(os.tmpdir()), resolveThroughExisting(root))) {
    console.error(`The system temporary folder (${os.tmpdir()}) is inside this repository; pass --dir with a folder outside it.`);
    process.exit(2);
  }
  const privateTemp = option('--dir') ? null : fs.mkdtempSync(path.join(os.tmpdir(), `frontend-extractor-eval-${caseId}-${stamp}-`));
  const base = path.resolve(option('--dir') || path.join(privateTemp, 'run'));
  if (isInside(resolveThroughExisting(base), resolveThroughExisting(root)) || isInside(base, root)) {
    console.error(`The workspace must be outside this repository (${root}); Claude Code would load its CLAUDE.md and the solutions would be reachable. Choose another --dir.`);
    process.exit(2);
  }
  const workspace = path.join(base, 'workspace');
  if (fs.existsSync(workspace)) { console.error(`Workspace already exists: ${workspace}`); process.exit(2); }
  // Never overwrite the files of an earlier run (or anyone's files with these names) in an existing --dir.
  // lstat, so a dangling symlink with one of these names counts as existing and is never written through.
  const present = (file) => { try { fs.lstatSync(file); return true; } catch { return false; } };
  const existing = ['meta.json', 'prompt.txt', 'report.json'].filter((name) => present(path.join(base, name)));
  if (existing.length) { console.error(`${base} already contains ${existing.join(', ')}; choose an empty or new --dir.`); process.exit(2); }
  // On failure, remove only what this run created: the first new folder, or else just the workspace.
  let createdRoot;
  try { createdRoot = fs.mkdirSync(base, { recursive: true }); }
  catch (error) { console.error(`Cannot create ${base}: ${error.code || error.message}. Choose another --dir.`); process.exit(2); }
  try { copyFixture(fixture, workspace); }
  catch (error) {
    fs.rmSync(privateTemp ?? createdRoot ?? workspace, { recursive: true, force: true });
    console.error(`Could not copy the fixture into ${workspace}: ${error.code || error.message}`);
    process.exit(1);
  }
  // Signing and hooks from the user's global Git config must not break or alter the initial commit.
  const steps = [['init', '-q'], ['config', 'user.name', 'Manual Evaluation'], ['config', 'user.email', 'manual-evaluation@localhost'], ['add', '.'], ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'Initial fixture'], ['rev-parse', 'HEAD']];
  let baseCommit = null;
  for (const args of steps) {
    const r = git(args, workspace);
    if (r.exit_code) {
      fs.rmSync(privateTemp ?? createdRoot ?? workspace, { recursive: true, force: true });
      console.error('Could not initialize the workspace Git repository: ' + (r.stderr || r.error));
      process.exit(1);
    }
    baseCommit = r.stdout.trim();
  }
  // Claude Code loads CLAUDE.md from every parent folder; one above the workspace would steer the agent.
  const inherited = [];
  for (let dir = path.dirname(workspace); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) inherited.push(path.join(dir, 'CLAUDE.md'));
    if (path.dirname(dir) === dir) break;
  }
  if (inherited.length) console.warn(`WARNING: Claude Code will also load ${inherited.join(', ')} in this workspace. Choose a --dir without CLAUDE.md above it for a clean measurement.`);
  const prompt = buildPrompt(testCase, fixture.manifest);
  writeFileNoFollow(path.join(base, 'meta.json'), JSON.stringify({ case_id: caseId, fixture: path.relative(root, fixture.dir), base_commit: baseCommit, prepared_at: new Date().toISOString() }, null, 2) + '\n');
  writeFileNoFollow(path.join(base, 'prompt.txt'), prompt + '\n');
  console.log(`Workspace: ${workspace}\nPrompt saved to: ${path.join(base, 'prompt.txt')}\n\nNext:\n  1. cd "${workspace}"\n  2. claude   (with the frontend-codepen-extractor plugin installed)\n  3. Paste the prompt below, let the agent finish, and save its final answer.\n  4. node "${path.join(root, 'scripts/evaluation/manual-eval.mjs')}" score "${workspace}"\n\n--- prompt ---\n${prompt}`);
}

async function score(workspaceArg) {
  const workspace = path.resolve(workspaceArg);
  // Checked before any check runs, so a typo in --output does not throw away a finished scoring run.
  if (option('--output')) {
    const folder = path.dirname(path.resolve(option('--output')));
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) { console.error(`The folder for --output does not exist: ${folder}`); process.exit(2); }
  }
  const metaPath = path.join(path.dirname(workspace), 'meta.json');
  if (!fs.existsSync(metaPath)) { console.error(`No meta.json next to ${workspace}; prepare the workspace with manual-eval.mjs prepare.`); process.exit(2); }
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { meta = null; }
  if (!meta || typeof meta !== 'object' || typeof meta.case_id !== 'string') { console.error(`${metaPath} is not a valid meta.json; prepare the workspace again.`); process.exit(2); }
  const fixture = findFixture(root, meta.case_id);
  if (!fixture) { console.error(`Fixture for case "${meta.case_id}" no longer exists.`); process.exit(2); }
  const { manifest } = fixture;
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) { console.error(`${workspace} is not a workspace folder.`); process.exit(2); }
  // The report and the screenshots are never written through a link placed next to the workspace.
  const output = path.resolve(option('--output') || path.join(path.dirname(workspace), 'report.json'));
  const shots = path.join(path.dirname(workspace), 'screenshots');
  for (const [target, kind, ok] of [[output, 'file', (stat) => stat.isFile()], [shots, 'folder', (stat) => stat.isDirectory()]]) {
    let stat = null;
    try { stat = fs.lstatSync(target); } catch {}
    if (stat && (stat.isSymbolicLink() || !ok(stat))) { console.error(`${target} exists but is not a regular ${kind}; refusing to write through it.`); process.exit(2); }
  }
  // Removed on every exit, Ctrl-C and SIGTERM included, so no copy of the agent's work is left behind. The
  // handlers are in place before the folder exists, so a signal cannot arrive in between.
  let snapshot = null;
  process.on('exit', () => { if (snapshot) { try { fs.rmSync(snapshot, { recursive: true, force: true }); } catch {} } });
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.on(signal, () => { if (activeCheck) activeCheck.kill('SIGTERM'); process.exit(code); });
  }
  snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-eval-snapshot-'));
  // Committed, staged, untracked and ignored changes all count, because only the files on disk are read.
  let comparison, special;
  try { special = snapshotWorkspace(workspace, snapshot); comparison = compareWithFixture(fixture, snapshot, special); }
  catch (error) { console.error(`Could not read the workspace files (${error.code || error.message}); it cannot be scored.`); process.exit(2); }
  const { changed } = comparison;
  // A symlink or other special entry is never expected, not even at an editable path.
  const unexpected = changed.filter((file) => !manifest.editable_files.includes(file) || special.includes(file));
  const checks = [];
  const add = (name, r) => checks.push({ name, command: r.command, status: r.exit_code === 0 ? 'PASS' : 'FAIL', exit_code: r.exit_code, output_excerpt: [r.stdout, r.stderr, r.error].filter(Boolean).join('\n').slice(-2500) });
  for (const file of manifest.editable_files.filter((f) => f.endsWith('.js'))) {
    if (fs.existsSync(path.join(snapshot, file))) add(`JavaScript syntax: ${file}`, await runCheck(process.execPath, ['--check', path.join(snapshot, file)], root));
  }
  add('Fixture quality assertions', await runCheck(process.execPath, [fixture.checkPath, snapshot], root));
  const browserRun = await runCheck(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), snapshot, path.join(fixture.dir, 'fixture.json'), '--screenshots', shots], root);
  let browser = null;
  try { browser = JSON.parse(browserRun.stdout.trim().split(/\r?\n/).pop()); } catch {}
  const warnings = Array.isArray(browser?.warnings) ? browser.warnings.map(String) : [];
  checks.push({ name: 'Browser check (Playwright, network blocked)', command: browserRun.command, status: browser?.status || 'FAIL', exit_code: browserRun.exit_code, output_excerpt: browser ? JSON.stringify(browser) : [browserRun.stdout, browserRun.stderr].join('\n').slice(-2500) });
  const whitespace = trailingWhitespace(comparison.contents);
  checks.push({ name: 'No trailing whitespace on changed lines', command: 'compare with a fresh copy of the fixture', status: whitespace.length ? 'FAIL' : 'PASS', exit_code: whitespace.length ? 1 : 0, output_excerpt: whitespace.join('\n').slice(-2500) });
  if (unexpected.length) checks.push({ name: 'Only editable files changed', command: 'compare with a fresh copy of the fixture', status: 'FAIL', exit_code: 1, output_excerpt: unexpected.join('\n').slice(-2500) });

  // A check that did not run never counts as passed: no FAIL plus any NOT RUN is INCOMPLETE, not PASS.
  const failed = checks.filter((check) => check.status === 'FAIL').map((check) => check.name);
  const notRun = checks.filter((check) => check.status === 'NOT RUN').map((check) => check.name);
  const status = failed.length ? 'FAIL' : notRun.length ? 'INCOMPLETE' : 'PASS';
  const report = {
    schema_version: 1, mode: 'manual', case_id: meta.case_id, scored_at: new Date().toISOString(), workspace,
    status,
    objective: { passed: status === 'PASS', failed_checks: failed, not_run_checks: notRun, screenshots_dir: browser?.screenshots?.length ? shots : null },
    warnings,
    repository: { compared_with: `a fresh copy of ${path.relative(root, fixture.dir).split(path.sep).join('/')}`, changed_files: changed, editable_files: manifest.editable_files, unexpected_files: unexpected },
    checks,
    human_review: [
      `Is ${meta.case_id} the case you prepared? (meta.json is where the agent could have edited it.)`,
      'Does the agent\'s final report match these check results (no claimed PASS that is FAIL here, browser/visual QA reported as NOT RUN)?',
      'Do the screenshots still show the original component, working at 360px?',
      'Is the Git diff focused, without unrelated rewrites?',
      'Record the session cost shown by /cost in Claude Code.',
    ],
  };
  writeFileNoFollow(output, JSON.stringify(report, null, 2) + '\n');
  for (const check of checks) console.log(`${check.status.padEnd(7)} ${check.name}`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  console.log(`\n${report.status}: ${meta.case_id}.${notRun.length ? ` NOT RUN: ${notRun.join(', ')}.` : ''} Report: ${output}`);
  // Exit codes: 0 PASS, 1 FAIL, 3 INCOMPLETE (no failure, but at least one check did not run).
  process.exitCode = status === 'FAIL' ? 1 : status === 'INCOMPLETE' ? 3 : 0;
}

if (command === 'prepare' && target) prepare(target);
else if (command === 'score' && target) await score(target);
else usage();
