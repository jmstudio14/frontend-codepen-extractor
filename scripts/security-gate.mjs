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
// Skipped only at the repository root; a folder with one of these names deeper in the tree is scanned.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'evaluation-results', '__pycache__']);
const SHELL_ALLOWLIST = new Set(['scripts/evaluate-agent.mjs']);
// Every Claude Code subagent, project or plugin, is read-only except the implementation agent.
const WRITE_ALLOWED_AGENT_NAMES = new Set(['frontend-codepen-extractor']);
const SECRET_RULES = [
  ['anthropic-api-key', /sk-ant-[A-Za-z0-9_-]{16,}/],
  // The main-branch rule (32+ alphanumerics, any case) plus the project, service-account and admin key
  // formats, which may contain `_` and `-`. Unprefixed names with hyphens, such as CSS classes, do not match.
  ['openai-api-key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}|\bsk-(?:proj-|svcacct-|admin-)[A-Za-z0-9_-]{32,}/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['pgp-private-key', /-{5}BEGIN PGP PRIVATE KEY BLOCK-{5}/],
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
    const full = path.join(dir, entry.name);
    // Only real directories are skipped: a symlink or file named like one (a committed node_modules link)
    // is still reported below.
    if (SKIP_DIRS.has(entry.name) && dir === root && entry.isDirectory()) continue;
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
// Returns the decodings to scan, or null for a binary file. A UTF-16 byte-order mark is a claim, not proof:
// the bytes after it are scanned as UTF-16 and also as UTF-8, so two leading bytes cannot hide plain text.
// If they are not valid UTF-16 text (odd length, or a NUL code unit), only the UTF-8 reading counts.
// Without a mark, a file with NUL bytes is binary.
function read(full) {
  if (textCache.has(full)) return textCache.get(full);
  const bytes = fs.readFileSync(full);
  const utf8 = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const le = bytes[0] === 0xff && bytes[1] === 0xfe, be = bytes[0] === 0xfe && bytes[1] === 0xff;
  let texts = utf8.includes('\u0000') ? null : [utf8];
  if ((le || be) && bytes.length % 2 === 0) {
    const body = Buffer.from(bytes.subarray(2));
    const utf16 = (be ? body.swap16() : body).toString('utf16le');
    if (!utf16.includes('\u0000')) texts = [utf16, utf8];
  }
  textCache.set(full, texts);
  return texts;
}
// The first decoding is the file as its byte-order mark declares it; used where one reading is needed.
const primary = (full) => read(full)?.[0] ?? null;
// Block comments removed, keeping line breaks, as an extra reading for the code rules: a comment between
// an option key and its colon would otherwise separate them. It only adds matches, never removes the raw-text ones.
const withoutBlockComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Code rules read the raw text. An earlier version masked comments and literals first, but a heuristic
// tokenizer can be steered by ordinary syntax (a regex after `)`, `i++ / 2`, `${...}` in a template) into
// hiding real code, so the gate stays fail-closed: the rules flag the names themselves, wherever they
// appear in Node code, rather than trying to recognise every way of calling them. They are heuristics,
// not a parser. Not detected: names computed at runtime from strings (such as 'ev' + 'al'), reaching the
// constructor through `.constructor`, and running another program (node -e, env, a script file) whose
// arguments carry code; only shells are recognised by name.
//
// child_process exec/execSync always run through a shell. In a file that loads child_process, any call,
// member access, bracket access, destructuring or alias of exec/execSync is flagged.
// Any quoted child_process specifier counts as loading it, which also covers createRequire.
const LOADS_CHILD_PROCESS = /['"`](?:node:)?child_process['"`]/;
const SHELL_EXEC_FORMS = [
  /(?<![\w$.])(?:exec|execSync)\s*\(/,
  /\.\s*(?:exec|execSync)\b/,
  /\[\s*['"`](?:exec|execSync)['"`]\s*\]/,
  /\{[^{}]*\b(?:exec|execSync)\b[^{}]*\}\s*(?:=|from)/,
  /=\s*(?:exec|execSync)\b/,
];
function firstIndex(text, patterns) {
  const indexes = patterns.map((re) => re.exec(text)?.index).filter((index) => index !== undefined);
  return indexes.length ? Math.min(...indexes) : -1;
}
const shellExecIndex = (text) => (LOADS_CHILD_PROCESS.test(text) ? firstIndex(text, SHELL_EXEC_FORMS) : -1);
// A shell option other than a literal false: quoted or unquoted key, shorthand, a property assignment, or
// the quoted name anywhere else (Reflect.set, Object.assign with a computed key).
const SHELL_OPTION_FORMS = [
  /['"`]shell['"`](?!\s*\]?\s*[:=]\s*false\b)/,
  /['"`]?\bshell['"`]?\s*:(?!\s*false\b)/,
  /[{,]\s*shell\s*[,}]/,
  /\.\s*shell\s*=(?!=)(?!\s*false\b)/,
  /\[\s*['"`]shell['"`]\s*\]\s*=(?!=)(?!\s*false\b)/,
  /\[\s*['"`]shell['"`]\s*\]\s*:(?!\s*false\b)/,
  // The main-branch rule, kept verbatim so this gate is never weaker than it.
  /\bshell\s*:\s*true\b/,
];
// Spawning a shell binary directly, by bare name or by path; in a file that loads child_process, any string
// that names a shell also counts, because it may reach spawn through a variable or as an argument of
// another program (env sh -c ...). Paths and .exe names match in any letter case; bare names only in lower
// case, because 'Bash' and 'PowerShell' are also Claude Code tool names.
const SHELL_PATH_LITERAL = /['"`](?:[^'"`\s]*[\\/](?:sh|bash|zsh|dash|ksh|fish|cmd|powershell|pwsh)(?:\.exe)?|(?:sh|bash|zsh|dash|ksh|fish|cmd|powershell|pwsh)\.exe)['"`]/i;
const SHELL_NAME_LITERAL = /['"`](?:sh|bash|zsh|dash|ksh|fish|cmd|powershell|pwsh)['"`]/;
const SHELL_BINARY = /\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\(\s*(?:['"`](?:[^'"`]*[\\/])?(?:sh|bash|zsh|dash|ksh|fish|cmd|powershell|pwsh)(?:\.exe)?['"`]|process\.env\.(?:SHELL|ComSpec|COMSPEC)\b)/i;
// Code built from text: the global code evaluator and the code-from-string constructor named anywhere
// (called, aliased, in an array, as a quoted key or property, through globalThis or Reflect), string timer
// callbacks, any quoted node:vm specifier, Worker code strings and data: URL imports. `eval: false` (a
// Worker option) and longer names such as manual-eval or evaluate are not matches. The first entry is
// the main-branch rule; `[F]` is the same as `F` and only stops this file, which is scanned like any
// other, from matching its own definitions, as do the other bracketed letters.
const DYNAMIC_CODE_FORMS = [
  /\beval\s*\(|\bnew\s+[F]unction\s*\(/,
  /(?<![\w$-])ev[a]l(?![\w$-])(?!['"`]?\s*:\s*false\b)/,
  /(?<![\w$])[F]unction(?![\w$])/,
  /\bset(?:Timeout|Interval|Immediate)\s*\(\s*['"`]/,
  /['"`](?:node:)?v[m]['"`]/,
  /\bimport\s*\(?\s*['"`]data:/i,
];
// Node code anywhere, except browser .js files in the fixtures and their solutions (seeded defects).
const isNodeCode = (rel) => /\.(?:mjs|cjs|mts|cts)$/.test(rel) || (/\.(?:js|ts)$/.test(rel) && !/^tests\/(?:fixtures|fixture-solutions)\//.test(rel));

for (const { rel, full } of files) {
  const texts = read(full);
  if (texts === null) {
    if (BINARY_EXTENSIONS.test(rel)) skipped.push(`${rel} (binary)`);
    else finding('unscanned-binary', rel, 'contains NUL bytes but does not have a binary file extension');
    continue;
  }
  // Each rule is reported once per file, at its first match in any reading.
  const reported = new Set();
  const report = (rule, text, index, detail = '') => {
    if (index < 0 || reported.has(rule)) return;
    reported.add(rule);
    finding(rule, rel, `line ${lineOf(text, index)}${detail}`);
  };
  for (const text of texts) {
    for (const [rule, re] of SECRET_RULES) report(rule, text, re.exec(text)?.index ?? -1, ' (value not printed)');
  }
  if (!isNodeCode(rel)) continue;
  for (const text of texts.flatMap((raw) => [raw, withoutBlockComments(raw)])) {
    report('dynamic-code-execution', text, firstIndex(text, DYNAMIC_CODE_FORMS));
    if (SHELL_ALLOWLIST.has(rel)) continue;
    report('unapproved-shell-true', text, firstIndex(text, SHELL_OPTION_FORMS), ' (shell option other than false)');
    report('unapproved-shell-exec', text, shellExecIndex(text), ' (child_process exec/execSync always uses a shell)');
    const binary = SHELL_BINARY.exec(text) ?? (LOADS_CHILD_PROCESS.test(text) ? SHELL_PATH_LITERAL.exec(text) ?? SHELL_NAME_LITERAL.exec(text) : null);
    report('unapproved-shell-spawn', text, binary?.index ?? -1, ' (spawns a shell directly)');
  }
}

for (const { rel, full } of files.filter((item) => /^\.github\/workflows\/.*\.ya?ml$/.test(item.rel))) {
  const text = primary(full) ?? '';
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
  const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return items.flatMap((item) => item.match(/[A-Za-z][\w-]*(?:\([^)]*\))?|\*/g) ?? []);
};
// A tools value that is not a string or a list of strings has no defined meaning, so it is not guessed at.
const validToolsValue = (value) => value === undefined || value === null || typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
// `Edit(src/**)` still grants Edit, so permission rules are compared by their base tool name.
const baseTool = (tool) => tool.replace(/\(.*$/, '');
function frontmatterOf(rel, full) {
  const match = (primary(full) ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) { finding('agent-frontmatter-missing', rel, 'agent file has no YAML frontmatter'); return null; }
  let meta;
  try { meta = parseYaml(match[1]) ?? {}; }
  catch (error) { finding('agent-frontmatter-invalid', rel, error.message.split('\n')[0]); return null; }
  for (const key of ['tools', 'disallowedTools']) {
    if (!validToolsValue(meta[key])) { finding('agent-frontmatter-invalid', rel, `${key} must be a string or a list of strings`); return null; }
  }
  return meta;
}
for (const item of agentFiles) item.meta = frontmatterOf(item.rel, item.full);
// Claude Code knows a subagent by its frontmatter name. The rules here identify agents by file name, so a
// file whose name differs (an extractor file declaring a reviewer, or the reverse) is not accepted.
for (const item of agentFiles) {
  if (item.meta && item.meta.name !== undefined && item.meta.name !== item.name) finding('agent-name-mismatch', item.rel, `frontmatter name ${JSON.stringify(item.meta.name)} differs from the file name ${item.name}`);
}
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
