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
// Every Claude Code subagent, project or plugin, is read-only except the implementation agent.
const WRITE_ALLOWED_AGENT_NAMES = new Set(['frontend-codepen-extractor']);
const SECRET_RULES = [
  ['anthropic-api-key', /sk-ant-[A-Za-z0-9_-]{16,}/],
  // Real keys contain digits; requiring one keeps long hyphenated names such as CSS classes from matching.
  ['openai-api-key', /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
];
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const WRITE_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'];
const BINARY_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|ico|woff2?)$/i;
const findings = [];
function finding(rule, rel, detail) { findings.push({ rule, file: rel, detail }); }

// Fail closed: a file the gate cannot scan (symlink, oversized, or binary without a binary extension)
// is a finding, because it could hide an agent profile, a script or a secret.
const skipped = [];
const relOf = (full) => path.relative(root, full).split(path.sep).join('/');
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) finding('unscanned-symlink', relOf(full), 'symlinks are not followed; commit the real file instead');
    else if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) {
      if (fs.statSync(full).size > MAX_SCAN_BYTES) finding('unscanned-large-file', relOf(full), 'larger than 2 MB');
      else out.push(full);
    }
  }
  return out;
}
const files = walk(root).map((full) => ({ rel: relOf(full), full }));
const textCache = new Map();
// UTF-16 files (with a byte-order mark) are decoded and scanned; other files with NUL bytes are binary.
function read(full) {
  if (textCache.has(full)) return textCache.get(full);
  const bytes = fs.readFileSync(full);
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = bytes.subarray(2).toString('utf16le');
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  else text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  if (text.includes('\u0000')) text = null;
  textCache.set(full, text);
  return text;
}
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// child_process exec/execSync always run through a shell. In a file that loads child_process, any exec or
// execSync call, property access or destructuring is flagged; a RegExp .exec() there needs the allowlist.
// This is a heuristic, not a parser: indirect forms such as computed names are not detected.
const LOADS_CHILD_PROCESS = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"`](?:node:)?child_process['"`]/;
const SHELL_EXEC_FORMS = [
  /(?<![\w$.])(?:exec|execSync)\s*\(/,
  /\.\s*(?:exec|execSync)\s*\(/,
  /\[\s*['"`](?:exec|execSync)['"`]\s*\]/,
  /\{[^{}]*\b(?:exec|execSync)\b[^{}]*\}\s*(?:=|from)/,
];
function firstIndex(text, patterns) {
  const indexes = patterns.map((re) => re.exec(text)?.index).filter((index) => index !== undefined);
  return indexes.length ? Math.min(...indexes) : -1;
}
const shellExecIndex = (text) => (LOADS_CHILD_PROCESS.test(text) ? firstIndex(text, SHELL_EXEC_FORMS) : -1);
// Any shell option other than a literal false, and spawning a shell binary directly, also run a shell.
const SHELL_OPTION = /\bshell\s*:(?!\s*false\b)/;
const SHELL_BINARY = /\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\(\s*['"`](?:sh|bash|zsh|dash|cmd|cmd\.exe|powershell|powershell\.exe|pwsh)['"`]/;
// Node code anywhere, except browser .js files in the fixtures and their solutions (seeded defects).
const isNodeCode = (rel) => /\.(?:mjs|cjs)$/.test(rel) || (/\.js$/.test(rel) && !/^tests\/(?:fixtures|fixture-solutions)\//.test(rel));

for (const { rel, full } of files) {
  const text = read(full);
  if (text === null) {
    if (BINARY_EXTENSIONS.test(rel)) skipped.push(`${rel} (binary)`);
    else finding('unscanned-binary', rel, 'contains NUL bytes but does not have a binary file extension');
    continue;
  }
  for (const [rule, re] of SECRET_RULES) {
    const match = re.exec(text);
    if (match) finding(rule, rel, `line ${lineOf(text, match.index)} (value not printed)`);
  }
  if (isNodeCode(rel)) {
    const dynamic = /\beval\s*\(|\bnew\s+Function\s*\(/.exec(text);
    if (dynamic) finding('dynamic-code-execution', rel, `line ${lineOf(text, dynamic.index)}`);
    if (!SHELL_ALLOWLIST.has(rel)) {
      const shell = SHELL_OPTION.exec(text);
      if (shell) finding('unapproved-shell-true', rel, `line ${lineOf(text, shell.index)} (shell option other than false)`);
      const exec = shellExecIndex(text);
      if (exec >= 0) finding('unapproved-shell-exec', rel, `line ${lineOf(text, exec)} (child_process exec/execSync always uses a shell)`);
      const binary = SHELL_BINARY.exec(text);
      if (binary) finding('unapproved-shell-spawn', rel, `line ${lineOf(text, binary.index)} (spawns a shell directly)`);
    }
  }
}

for (const { rel, full } of files.filter((item) => /^\.github\/workflows\/.*\.ya?ml$/.test(item.rel))) {
  const text = read(full) ?? '';
  if (/permissions\s*:\s*write-all/.test(text)) finding('workflow-write-all', rel, 'permissions: write-all');
  if (!/^permissions\s*:\s*\r?\n\s+contents\s*:\s*read\b/m.test(text)) finding('workflow-default-permissions', rel, 'top-level permissions must set contents: read');
}

// Project agents are addressed by name; plugin agents by "<plugin>:<name>".
const agentFiles = files.flatMap((item) => {
  const project = item.rel.match(/^\.claude\/agents\/(?:.+\/)?([^/]+)\.md$/);
  if (project) return [{ ...item, name: project[1], id: project[1] }];
  const plugin = item.rel.match(/^plugins\/([^/]+)\/agents\/(?:.+\/)?([^/]+)\.md$/);
  return plugin ? [{ ...item, name: plugin[2], id: `${plugin[1]}:${plugin[2]}` }] : [];
});
const agentsById = new Map(agentFiles.map((item) => [item.id, item]));
// Frontmatter is parsed as YAML, so both `tools: Read, Grep` and a YAML list of tools are understood.
const { parse: parseYaml } = await import('yaml').catch(() => {
  console.error('Security gate needs the yaml package: run npm ci --ignore-scripts');
  process.exit(2);
});
const toolList = (value) => {
  const items = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? [value] : [];
  return items.flatMap((item) => item.match(/[A-Za-z][\w-]*(?:\([^)]*\))?|\*/g) ?? []);
};
// `Edit(src/**)` still grants Edit, so permission rules are compared by their base tool name.
const baseTool = (tool) => tool.replace(/\(.*$/, '');
function frontmatterOf(rel, full) {
  const match = (read(full) ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) { finding('agent-frontmatter-missing', rel, 'agent file has no YAML frontmatter'); return null; }
  try { return parseYaml(match[1]) ?? {}; }
  catch (error) { finding('agent-frontmatter-invalid', rel, error.message.split('\n')[0]); return null; }
}
for (const item of agentFiles) item.meta = frontmatterOf(item.rel, item.full);
const toolsOf = (item) => toolList(item.meta?.tools).join(', ');

for (const item of agentFiles) {
  if (!item.meta || WRITE_ALLOWED_AGENT_NAMES.has(item.name)) continue;
  // Only an unscoped entry such as `Edit` denies the whole tool; `Edit(docs/**)` denies part of it.
  const disallowed = new Set(toolList(item.meta.disallowedTools).filter((tool) => !tool.includes('(')));
  const tools = toolList(item.meta.tools);
  if (!tools.length || tools.includes('*')) {
    // Without a usable tools list a subagent inherits every tool, including the write tools.
    if (!WRITE_TOOLS.every((tool) => disallowed.has(tool))) finding('agent-inherits-all-tools', item.rel, 'no explicit tools list: the agent inherits Edit/Write; list its tools explicitly');
    continue;
  }
  const writes = tools.filter((tool) => WRITE_TOOLS.includes(baseTool(tool)) && !disallowed.has(baseTool(tool)));
  if (writes.length) finding('read-only-agent-can-write', item.rel, `tools: ${toolsOf(item)}`);
}

// Delegating agents must name each delegate, and delegates must exist and be read-only.
for (const item of agentFiles) {
  const { rel } = item;
  // Task is the former name of the Agent tool and grants the same delegation.
  const tools = toolsOf(item).replace(/\bTask\b/g, 'Agent');
  if (!/\bAgent\b/.test(tools)) continue;
  const list = tools.match(/\bAgent\(([^)]*)\)/)?.[1];
  if (list === undefined || /\bAgent\b(?!\()/.test(tools.replace(/\bAgent\([^)]*\)/, ''))) {
    finding('agent-delegation-scope', rel, 'Agent must list its delegates as Agent(name, ...)');
    continue;
  }
  for (const id of list.split(',').map((item) => item.trim()).filter(Boolean)) {
    const delegate = agentsById.get(id);
    if (!delegate) finding('agent-delegation-scope', rel, `delegate ${id} does not exist`);
    else if (WRITE_ALLOWED_AGENT_NAMES.has(delegate.name)) finding('agent-delegation-scope', rel, `delegate ${id} can write`);
  }
}

for (const item of findings) console.error(`BLOCK ${item.rule}: ${item.file} ${item.detail}`);
for (const item of skipped) console.log(`SKIPPED ${item}`);
console.log(`Security gate: ${files.length} files scanned, ${skipped.length} skipped, ${findings.length} finding(s).`);
if (findings.length) process.exitCode = 1;
