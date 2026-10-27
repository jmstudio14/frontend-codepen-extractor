#!/usr/bin/env node
/**
 * Deterministic security gate. Exits 1 on any finding so CI blocks delivery
 * even when no LLM review runs. Pattern checks only; not a full audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root') >= 0 ? args[args.indexOf('--root') + 1] : null;
const root = path.resolve(rootArg || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const SKIP_DIRS = new Set(['.git', 'node_modules', 'evaluation-results', '__pycache__']);
const SHELL_ALLOWLIST = new Set(['scripts/evaluate-agent.mjs']);
// Every Claude Code subagent is read-only except the implementation agent.
const WRITE_ALLOWED_AGENTS = new Set(['.claude/agents/frontend-codepen-extractor.md']);
const SECRET_RULES = [
  ['anthropic-api-key', /sk-ant-[A-Za-z0-9_-]{16,}/],
  ['openai-api-key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
];
const findings = [];
function finding(rule, rel, detail) { findings.push({ rule, file: rel, detail }); }

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && fs.statSync(full).size <= 2 * 1024 * 1024) out.push(full);
  }
  return out;
}
const files = walk(root).map((full) => ({ rel: path.relative(root, full).split(path.sep).join('/'), full }));
const read = (full) => { const text = fs.readFileSync(full, 'utf8'); return text.includes('\u0000') ? null : text; };
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

for (const { rel, full } of files) {
  const text = read(full);
  if (text === null) continue;
  for (const [rule, re] of SECRET_RULES) {
    const match = re.exec(text);
    if (match) finding(rule, rel, `line ${lineOf(text, match.index)} (value not printed)`);
  }
  if (/^scripts\/.*\.(?:mjs|cjs|js)$/.test(rel)) {
    const dynamic = /\beval\s*\(|\bnew\s+Function\s*\(/.exec(text);
    if (dynamic) finding('dynamic-code-execution', rel, `line ${lineOf(text, dynamic.index)}`);
    const shell = /\bshell\s*:\s*true\b/.exec(text);
    if (shell && !SHELL_ALLOWLIST.has(rel)) finding('unapproved-shell-true', rel, `line ${lineOf(text, shell.index)}`);
  }
}

for (const { rel, full } of files.filter((item) => /^\.github\/workflows\/.*\.ya?ml$/.test(item.rel))) {
  const text = read(full) ?? '';
  if (/permissions\s*:\s*write-all/.test(text)) finding('workflow-write-all', rel, 'permissions: write-all');
  if (!/^permissions\s*:\s*\r?\n\s+contents\s*:\s*read\b/m.test(text)) finding('workflow-default-permissions', rel, 'top-level permissions must set contents: read');
}

for (const { rel, full } of files.filter((item) => /^\.claude\/agents\/[^/]+\.md$/.test(item.rel) && !WRITE_ALLOWED_AGENTS.has(item.rel))) {
  const tools = (read(full) ?? '').match(/^---\r?\n[\s\S]*?^tools:\s*(.+)$/m)?.[1] ?? '';
  if (/\b(?:Edit|Write|NotebookEdit)\b/.test(tools)) finding('read-only-agent-can-write', rel, `tools: ${tools}`);
}

// Delegating agents must name each delegate, and delegates must be read-only.
const agentFiles = files.filter((item) => /^\.claude\/agents\/[^/]+\.md$/.test(item.rel));
const agentNames = new Set(agentFiles.map((item) => path.basename(item.rel, '.md')));
for (const { rel, full } of agentFiles) {
  const tools = (read(full) ?? '').match(/^---\r?\n[\s\S]*?^tools:\s*(.+)$/m)?.[1] ?? '';
  if (!/\bAgent\b/.test(tools)) continue;
  const list = tools.match(/\bAgent\(([^)]*)\)/)?.[1];
  if (list === undefined || /\bAgent\b(?!\()/.test(tools.replace(/\bAgent\([^)]*\)/, ''))) {
    finding('agent-delegation-scope', rel, 'Agent must list its delegates as Agent(name, ...)');
    continue;
  }
  for (const name of list.split(',').map((item) => item.trim()).filter(Boolean)) {
    if (!agentNames.has(name)) finding('agent-delegation-scope', rel, `delegate ${name} does not exist`);
    else if (WRITE_ALLOWED_AGENTS.has(`.claude/agents/${name}.md`)) finding('agent-delegation-scope', rel, `delegate ${name} can write`);
  }
}

for (const item of findings) console.error(`BLOCK ${item.rule}: ${item.file} ${item.detail}`);
console.log(`Security gate: ${files.length} files scanned, ${findings.length} finding(s).`);
if (findings.length) process.exitCode = 1;
