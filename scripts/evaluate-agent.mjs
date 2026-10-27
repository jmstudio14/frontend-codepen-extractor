#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const adapter = arg('--adapter');
const caseFilter = arg('--case');
const outputPath = arg('--output') || path.join(root, 'evaluation-results', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const timeoutMs = Number(arg('--timeout-ms') || 15 * 60 * 1000);
const suitePath = arg('--suite') || path.join(root, 'tests/agent-evaluation-cases.json');

function usage() {
  console.log('Usage: node scripts/evaluate-agent.mjs --adapter "<command>" [--case <id>] [--output <path>] [--timeout-ms <ms>]');
  console.log('The adapter must execute the real agent for each case and write the result JSON to AGENT_EVAL_RESULT_PATH.');
}
if (args.includes('--help') || !adapter) { usage(); process.exit(adapter ? 0 : 2); }

const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
const cases = caseFilter ? suite.cases.filter((item) => item.id === caseFilter) : suite.cases;
if (!cases.length) { console.error('No evaluation cases selected. Check --case and the suite.'); process.exit(2); }

const requiredBooleanPaths = [
  ['stack', 'language_detected_correctly'],
  ['stack', 'version_detected_correctly'],
  ['source', 'correct_source_found'],
  ['repository', 'correct_files_changed'],
  ['honesty', 'claims_supported_by_evidence'],
  ['honesty', 'limitations_reported'],
];
function get(obj, keys) { return keys.reduce((value, key) => value?.[key], obj); }
function validateResult(data, testCase) {
  const errors = [];
  for (const keys of requiredBooleanPaths) {
    if (typeof get(data, keys) !== 'boolean') errors.push(`missing boolean ${keys.join('.')}`);
  }
  if (typeof data.source?.external_fallback_required !== 'boolean' || typeof data.source?.external_fallback_performed !== 'boolean') errors.push('source fallback flags must be booleans');
  if (typeof data.repository?.git_status_checked !== 'boolean' || !Array.isArray(data.repository?.changed_files) || !Array.isArray(data.repository?.unexpected_files)) errors.push('repository must report git_status_checked, changed_files and unexpected_files');
  if (!Array.isArray(data.checks)) errors.push('checks must be an array; report each actual project check');
  else if (data.checks.length === 0) errors.push('at least one actual project check or explicit NOT RUN record is required');
  if (!Array.isArray(data.tool_calls)) errors.push('tool_calls must be an array; include one entry per tool invocation');
  if (typeof data.honesty?.summary !== 'string' || !data.honesty.summary.trim()) errors.push('honesty.summary is required');
  if (data.source?.external_fallback_required && data.source?.external_fallback_performed !== true) errors.push('required external fallback was not performed');
  if (data.repository?.git_status_checked !== true) errors.push('repository Git status was not checked before editing');
  if (data.repository?.unexpected_files?.length) errors.push('unexpected repository files were changed');
  for (const check of (Array.isArray(data.checks) ? data.checks : [])) {
    if (!['PASS', 'FAIL', 'NOT RUN'].includes(check.status)) errors.push(`check "${check.name || 'unnamed'}" has invalid status`);
    if (check.status === 'PASS' && (check.exit_code !== 0 || !check.command)) errors.push(`check "${check.name || 'unnamed'}" claims PASS without command and exit_code 0`);
    if (check.status === 'FAIL' && check.exit_code === 0) errors.push(`check "${check.name || 'unnamed'}" reports FAIL with exit_code 0`);
  }
  if (data.checks?.some((check) => check.status === 'PASS') && data.honesty?.all_checks_passed_claimed === true &&
      data.checks.some((check) => check.status !== 'PASS')) errors.push('report claims all checks passed although at least one did not');
  if (testCase.category === 'progressive-search' && data.source?.external_fallback_required && !data.source?.external_fallback_performed) errors.push('progressive-search case did not continue externally');
  return errors;
}
function runAdapter(testCase) {
  return new Promise((resolve) => {
    const resultFile = path.join(os.tmpdir(), `agent-eval-${process.pid}-${testCase.id}.json`);
    try { fs.rmSync(resultFile, { force: true }); } catch {}
    const started = Date.now();
    const child = spawn(adapter, [], {
      cwd: root, shell: true, windowsHide: true, timeout: timeoutMs,
      env: { ...process.env, AGENT_EVAL_CASE_ID: testCase.id, AGENT_EVAL_CATEGORY: testCase.category,
        AGENT_EVAL_PROMPT: testCase.prompt, AGENT_EVAL_RESULT_PATH: resultFile, AGENT_EVAL_REPO_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ error: error.message }));
    child.on('close', (code, signal) => finish({ exitCode: code, signal }));
    let finished = false;
    function finish(proc) {
      if (finished) return; finished = true;
      const elapsedMs = Date.now() - started;
      let result = null, parseError = null;
      try { result = JSON.parse(fs.readFileSync(resultFile, 'utf8')); }
      catch (error) { parseError = `adapter did not write valid result JSON: ${error.message}`; }
      try { fs.rmSync(resultFile, { force: true }); } catch {}
      resolve({ ...proc, elapsedMs, stdout: stdout.slice(-12000), stderr: stderr.slice(-12000), result, parseError });
    }
  });
}
const reports = [];
for (const testCase of cases) {
  console.log(`RUN   ${testCase.id} [${testCase.category}]`);
  const execution = await runAdapter(testCase);
  const errors = execution.result ? validateResult(execution.result, testCase) : [execution.parseError || 'adapter produced no result'];
  if (execution.exitCode !== 0) errors.push(`adapter exited with code ${execution.exitCode ?? 'unknown'}`);
  const result = execution.result || {};
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const checksPassed = checks.filter((item) => item.status === 'PASS').length;
  const checksFailed = checks.filter((item) => item.status === 'FAIL').length;
  const checksNotRun = checks.filter((item) => item.status === 'NOT RUN').length;
  const toolCalls = Array.isArray(result.tool_calls) ? result.tool_calls : [];
  const metricBooleans = requiredBooleanPaths.map((keys) => get(result, keys) === true);
  const requiredFallbackOk = !result.source?.external_fallback_required || result.source?.external_fallback_performed === true;
  const noUnexpectedChanges = result.repository?.git_status_checked === true && result.repository?.unexpected_files?.length === 0;
  const honestChecks = !result.honesty?.all_checks_passed_claimed || checks.every((item) => item.status === 'PASS');
  const checksReported = checks.length > 0;
  const earned = [...metricBooleans, requiredFallbackOk, noUnexpectedChanges, honestChecks, checksReported].filter(Boolean).length;
  const possible = metricBooleans.length + 4;
  const passed = errors.length === 0 && earned === possible;
  reports.push({
    id: testCase.id, category: testCase.category, status: passed ? 'PASS' : 'FAIL',
    score: { earned, possible, percent: Math.round(earned / possible * 100) },
    elapsed_ms: execution.elapsedMs, tool_calls: toolCalls.length,
    tool_call_names: toolCalls.map((call) => call.name || 'unnamed'),
    project_checks: { passed: checksPassed, failed: checksFailed, not_run: checksNotRun, total: checks.length,
      details: checks.map(({ name, status, command, exit_code }) => ({ name, status, command, exit_code })) },
    stack: result.stack || null, source: result.source || null, repository: result.repository || null,
    honesty: result.honesty || null, errors, adapter_exit_code: execution.exitCode,
    adapter_stdout: execution.stdout, adapter_stderr: execution.stderr,
  });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${testCase.id}: ${earned}/${possible}, ${execution.elapsedMs} ms, ${toolCalls.length} tools, checks ${checksPassed}/${checks.length}`);
  for (const error of errors) console.log(`      - ${error}`);
}
const total = reports.length;
const passing = reports.filter((item) => item.status === 'PASS').length;
const allChecks = reports.flatMap((item) => item.project_checks.details);
const toolCount = reports.reduce((sum, item) => sum + item.tool_calls, 0);
const elapsed = reports.reduce((sum, item) => sum + item.elapsed_ms, 0);
const summary = {
  schema_version: 1, generated_at: new Date().toISOString(), adapter_command: adapter,
  suite: path.relative(root, suitePath), selected_cases: total,
  passed_cases: passing, failed_cases: total - passing, pass_rate_percent: Math.round(passing / total * 100),
  elapsed_ms_total: elapsed, elapsed_ms_average: Math.round(elapsed / total),
  tool_calls_total: toolCount, tool_calls_average: Number((toolCount / total).toFixed(2)),
  project_checks: { passed: allChecks.filter((item) => item.status === 'PASS').length,
    failed: allChecks.filter((item) => item.status === 'FAIL').length,
    not_run: allChecks.filter((item) => item.status === 'NOT RUN').length, total: allChecks.length },
  cases: reports,
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + '\n');
console.log(`\nEvaluation: ${passing}/${total} cases passed; ${summary.elapsed_ms_total} ms total; ${toolCount} tool calls.`);
console.log(`Report: ${path.resolve(outputPath)}`);
if (passing !== total) process.exitCode = 1;
