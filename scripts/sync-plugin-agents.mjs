#!/usr/bin/env node
/**
 * Builds the plugin copies of the bundled specialist agents from .claude/agents.
 * Specialists are copied verbatim; the coordinator gets plugin-scoped delegate names.
 * Usage: node scripts/sync-plugin-agents.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const PLUGIN_NAME = 'frontend-codepen-extractor';
export const COORDINATOR = 'agent-ecosystem-coordinator';
export const BUNDLED_SPECIALISTS = [
  'frontend-architect-planner', 'frontend-qa-test-engineer', 'frontend-security-reviewer',
  'frontend-extractor-validation-agent', 'frontend-performance-optimizer', 'frontend-documentation-maintainer',
  'frontend-code-auditor',
];
// The plugin coordinator's Agent(...) allowlist names only bundled specialists, so it cannot launch the others.
const PLUGIN_NOTE = `Plugin note: this copy of the coordinator can launch only the specialists bundled with the plugin, which are the ones listed in \`tools\`. The dependency/license, privacy, release and run-diagnostics specialists ship only with the extractor repository and cannot be launched from here. When the procedure or the routing table names one of them, record it as NOT RUN with the reason "not bundled with the plugin" and list it in \`unresolved_items\`; like any routed specialist that does not PASS, a human must accept it before delivery.

`;

export function pluginCoordinator(source) {
  const scoped = (name) => `${PLUGIN_NAME}:${name}`;
  let text = source.replace(/^tools:\s*Agent\([^)]*\)/m, `tools: Agent(${BUNDLED_SPECIALISTS.map(scoped).join(', ')})`);
  text = text.split(`claude --agent ${COORDINATOR}`).join(`claude --agent ${scoped(COORDINATOR)}`);
  for (const name of BUNDLED_SPECIALISTS) text = text.split(`\`${name}\``).join(`\`${scoped(name)}\``);
  return text.replace('\n## Delivery decision', `\n${PLUGIN_NOTE}## Delivery decision`);
}

// realpath on both sides so a symlinked or junction checkout still runs the CLI branch.
function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}

// Checkouts made before .gitattributes, or with core.autocrlf=true, may hold CRLF files.
export const toLF = (text) => text.replace(/\r\n/g, '\n');

export function expectedPluginAgents(root) {
  const read = (name) => toLF(fs.readFileSync(path.join(root, '.claude/agents', `${name}.md`), 'utf8'));
  const files = Object.fromEntries(BUNDLED_SPECIALISTS.map((name) => [name, read(name)]));
  files[COORDINATOR] = pluginCoordinator(read(COORDINATOR));
  return files;
}

if (isMainModule(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'plugins', PLUGIN_NAME, 'agents');
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [name, content] of Object.entries(expectedPluginAgents(root))) {
    const target = path.join(dir, `${name}.md`);
    const current = fs.existsSync(target) ? toLF(fs.readFileSync(target, 'utf8')) : null;
    if (current === content) continue;
    if (check) { stale += 1; console.error(`STALE ${path.relative(root, target)}`); }
    else { fs.writeFileSync(target, content); console.log(`WROTE ${path.relative(root, target)}`); }
  }
  if (check && stale) process.exitCode = 1;
}
