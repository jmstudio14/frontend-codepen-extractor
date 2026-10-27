#!/usr/bin/env node
/**
 * Builds the plugin copies of the bundled specialist agents from .claude/agents.
 * Specialists are copied verbatim; the coordinator gets plugin-scoped delegate names.
 * Usage: node scripts/sync-plugin-agents.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGIN_NAME = 'frontend-codepen-extractor';
export const COORDINATOR = 'agent-ecosystem-coordinator';
export const BUNDLED_SPECIALISTS = [
  'frontend-architect-planner', 'frontend-qa-test-engineer', 'frontend-security-reviewer',
  'frontend-extractor-validation-agent', 'frontend-performance-optimizer', 'frontend-documentation-maintainer',
  'frontend-code-auditor',
];
const PLUGIN_NOTE = `Plugin note: this plugin bundles only the delegates listed in \`tools\`. Specialists in this table that are not bundled (dependency/license, privacy, model evaluation, release, run diagnostics) run only if your project provides them; otherwise record them as NOT RUN.

`;

export function pluginCoordinator(source) {
  const scoped = (name) => `${PLUGIN_NAME}:${name}`;
  let text = source.replace(/^tools:\s*Agent\([^)]*\)/m, `tools: Agent(${BUNDLED_SPECIALISTS.map(scoped).join(', ')})`);
  text = text.split(`claude --agent ${COORDINATOR}`).join(`claude --agent ${scoped(COORDINATOR)}`);
  for (const name of BUNDLED_SPECIALISTS) text = text.split(`\`${name}\``).join(`\`${scoped(name)}\``);
  return text.replace('\n## Delivery decision', `\n${PLUGIN_NOTE}## Delivery decision`);
}

export function expectedPluginAgents(root) {
  const read = (name) => fs.readFileSync(path.join(root, '.claude/agents', `${name}.md`), 'utf8');
  const files = Object.fromEntries(BUNDLED_SPECIALISTS.map((name) => [name, read(name)]));
  files[COORDINATOR] = pluginCoordinator(read(COORDINATOR));
  return files;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'plugins', PLUGIN_NAME, 'agents');
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [name, content] of Object.entries(expectedPluginAgents(root))) {
    const target = path.join(dir, `${name}.md`);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === content) continue;
    if (check) { stale += 1; console.error(`STALE ${path.relative(root, target)}`); }
    else { fs.writeFileSync(target, content); console.log(`WROTE ${path.relative(root, target)}`); }
  }
  if (check && stale) process.exitCode = 1;
}
