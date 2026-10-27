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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPrompt, findFixture, hostOnlyFiles } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [command, target, ...rest] = process.argv.slice(2);
const option = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
const usage = () => { console.error('Usage: manual-eval.mjs prepare <case-id> [--dir <path>] | score <workspace> [--output <report.json>]'); process.exit(2); };
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60000 });
  return { command: [cmd, ...args].join(' '), exit_code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error?.message || null };
};
const git = (args, cwd) => run('git', args, cwd);
// The workspace must live outside this clone: Claude Code loads CLAUDE.md from every parent directory,
// and the solutions and assertion scripts would be a few directories away from the agent.
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const realOrSelf = (target) => { try { return fs.realpathSync(target); } catch { return target; } };

function prepare(caseId) {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const testCase = suite.cases.find((item) => item.id === caseId);
  const fixture = testCase && findFixture(root, caseId);
  if (!fixture) { console.error(`No executable fixture for case "${caseId}". Cases with fixtures: see tests/fixtures/*/fixture.json.`); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.resolve(option('--dir') || path.join(os.tmpdir(), 'frontend-extractor-eval', `${caseId}-${stamp}`));
  if (isInside(realOrSelf(path.dirname(base)), realOrSelf(root)) || isInside(base, root)) {
    console.error(`The workspace must be outside this repository (${root}); Claude Code would load its CLAUDE.md and the solutions would be reachable. Choose another --dir.`);
    process.exit(2);
  }
  const workspace = path.join(base, 'workspace');
  if (fs.existsSync(workspace)) { console.error(`Workspace already exists: ${workspace}`); process.exit(2); }
  const hidden = hostOnlyFiles(fixture.manifest);
  fs.mkdirSync(base, { recursive: true });
  fs.cpSync(fixture.dir, workspace, { recursive: true, filter: (src) => !['.git', 'node_modules', ...hidden].includes(path.basename(src)) });
  // Signing and hooks from the user's global Git config must not break or alter the initial commit.
  const steps = [['init', '-q'], ['config', 'user.name', 'Manual Evaluation'], ['config', 'user.email', 'manual-evaluation@localhost'], ['add', '.'], ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'Initial fixture'], ['rev-parse', 'HEAD']];
  let baseCommit = null;
  for (const args of steps) {
    const r = git(args, workspace);
    if (r.exit_code) {
      fs.rmSync(base, { recursive: true, force: true });
      console.error('Could not initialize the workspace Git repository: ' + (r.stderr || r.error));
      process.exit(1);
    }
    baseCommit = r.stdout.trim();
  }
  const prompt = buildPrompt(testCase, fixture.manifest);
  fs.writeFileSync(path.join(base, 'meta.json'), JSON.stringify({ case_id: caseId, fixture: path.relative(root, fixture.dir), base_commit: baseCommit, prepared_at: new Date().toISOString() }, null, 2) + '\n');
  fs.writeFileSync(path.join(base, 'prompt.txt'), prompt + '\n');
  console.log(`Workspace: ${workspace}\nPrompt saved to: ${path.join(base, 'prompt.txt')}\n\nNext:\n  1. cd "${workspace}"\n  2. claude   (with the frontend-codepen-extractor plugin installed)\n  3. Paste the prompt below, let the agent finish, and save its final answer.\n  4. node "${path.join(root, 'scripts/evaluation/manual-eval.mjs')}" score "${workspace}"\n\n--- prompt ---\n${prompt}`);
}

function score(workspaceArg) {
  const workspace = path.resolve(workspaceArg);
  const metaPath = path.join(path.dirname(workspace), 'meta.json');
  if (!fs.existsSync(metaPath)) { console.error(`No meta.json next to ${workspace}; prepare the workspace with manual-eval.mjs prepare.`); process.exit(2); }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const fixture = findFixture(root, meta.case_id);
  if (!fixture) { console.error(`Fixture for case "${meta.case_id}" no longer exists.`); process.exit(2); }
  const { manifest } = fixture;
  // Diff against the prepared commit, not HEAD, so commits made by the agent are still scored.
  const baseCommit = meta.base_commit || 'HEAD';
  const diff = git(['diff', '--name-only', baseCommit], workspace), untracked = git(['ls-files', '--others', '--exclude-standard'], workspace);
  if (diff.exit_code || untracked.exit_code) { console.error('Could not read the workspace Git state.'); process.exit(1); }
  const changed = [...new Set([...diff.stdout.split(/\r?\n/), ...untracked.stdout.split(/\r?\n/)].filter(Boolean))].sort();
  const unexpected = changed.filter((file) => !manifest.editable_files.includes(file));
  const checks = [];
  const add = (name, r) => checks.push({ name, command: r.command, status: r.exit_code === 0 ? 'PASS' : 'FAIL', exit_code: r.exit_code, output_excerpt: [r.stdout, r.stderr, r.error].filter(Boolean).join('\n').slice(-2500) });
  for (const file of manifest.editable_files.filter((f) => f.endsWith('.js'))) {
    if (fs.existsSync(path.join(workspace, file))) add(`JavaScript syntax: ${file}`, run(process.execPath, ['--check', path.join(workspace, file)], root));
  }
  add('Fixture quality assertions', run(process.execPath, [fixture.checkPath, workspace], root));
  const shots = path.join(path.dirname(workspace), 'screenshots');
  const browserRun = run(process.execPath, [path.join(root, 'scripts/evaluation/browser-check.mjs'), workspace, path.join(fixture.dir, 'fixture.json'), '--screenshots', shots], root);
  let browser = null;
  try { browser = JSON.parse(browserRun.stdout.trim().split(/\r?\n/).pop()); } catch {}
  checks.push({ name: 'Browser check (Playwright, network blocked)', command: browserRun.command, status: browser?.status || 'FAIL', exit_code: browserRun.exit_code, output_excerpt: browser ? JSON.stringify(browser) : [browserRun.stdout, browserRun.stderr].join('\n').slice(-2500) });
  // CRLF line endings (common on Windows) are not trailing whitespace; real trailing spaces still fail.
  add('Git diff whitespace', git(['-c', 'core.whitespace=cr-at-eol', 'diff', '--check', baseCommit], workspace));
  if (unexpected.length) checks.push({ name: 'Only editable files changed', command: `git diff --name-only ${baseCommit}`, status: 'FAIL', exit_code: 1, output_excerpt: unexpected.join('\n') });

  const failed = checks.filter((check) => check.status === 'FAIL').map((check) => check.name);
  const report = {
    schema_version: 1, mode: 'manual', case_id: meta.case_id, scored_at: new Date().toISOString(), workspace,
    status: failed.length ? 'FAIL' : 'PASS',
    objective: { passed: failed.length === 0, failed_checks: failed, screenshots_dir: browser?.screenshots?.length ? shots : null },
    repository: { changed_files: changed, editable_files: manifest.editable_files, unexpected_files: unexpected },
    checks,
    human_review: [
      'Does the agent\'s final report match these check results (no claimed PASS that is FAIL here, browser/visual QA reported as NOT RUN)?',
      'Do the screenshots still show the original component, working at 360px?',
      'Is the Git diff focused, without unrelated rewrites?',
      'Record the session cost shown by /cost in Claude Code.',
    ],
  };
  const output = path.resolve(option('--output') || path.join(path.dirname(workspace), 'report.json'));
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  for (const check of checks) console.log(`${check.status.padEnd(7)} ${check.name}`);
  console.log(`\n${report.status}: ${meta.case_id}. Report: ${output}`);
  if (failed.length) process.exitCode = 1;
}

if (command === 'prepare' && target) prepare(target);
else if (command === 'score' && target) score(target);
else usage();
