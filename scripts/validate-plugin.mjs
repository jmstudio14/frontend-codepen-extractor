#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = 'plugins/frontend-codepen-extractor';
let total = 0;
let failed = 0;

function check(condition, label) {
  total += 1;
  if (condition) console.log('PASS  ' + label);
  else {
    failed += 1;
    console.error('FAIL  ' + label);
  }
}
function readFile(relativePath) {
  try { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }
  catch { return null; }
}
function loadJson(relativePath) {
  const content = readFile(relativePath);
  if (content === null) {
    check(false, 'JSON file exists: ' + relativePath);
    return null;
  }
  try {
    const value = JSON.parse(content);
    check(true, 'JSON parses: ' + relativePath);
    return value;
  } catch (error) {
    check(false, 'JSON parses: ' + relativePath + ' (' + error.message + ')');
    return null;
  }
}

const required = [
  '.claude-plugin/marketplace.json',
  'INSTALL.md',
  '.agents/skills/frontend-codepen-extractor/SKILL.md',
  '.agents/skills/frontend-codepen-extractor/references/codepen-ingestion.md',
  '.agents/skills/frontend-codepen-extractor/references/uiverse-ingestion.md',
  '.agents/skills/frontend-codepen-extractor/references/dependency-policy.md',
  '.agents/skills/frontend-codepen-extractor/references/framework-patterns.md',
  '.agents/skills/frontend-codepen-extractor/references/quality-checklist.md',
  '.agents/skills/frontend-codepen-extractor/references/reconstruction-playbook.md',
  '.agents/skills/frontend-codepen-extractor/references/progressive-search.md',
  '.agents/skills/frontend-codepen-extractor/references/codemyui-ingestion.md',
  '.agents/skills/frontend-codepen-extractor/references/multilanguage-engineering.md',
  '.agents/skills/frontend-codepen-extractor/references/agent-architecture.md',
  'tests/agent-evaluation-cases.json', 'scripts/evaluate-agent.mjs', 'docs/agent-evaluation.md', 'tests/fixtures/evaluation-adapter.mjs',
  'scripts/adapters/claude-agent-sdk.mjs', 'scripts/evaluation/run-repeated.mjs', 'scripts/evaluation/check-web-fixture.mjs', 'scripts/evaluation/compare-baseline.mjs', 'scripts/evaluation/run_deepeval.py', 'evaluation/requirements-deepeval.txt', 'evaluation/baselines/README.md',
  'scripts/evaluation/assess-runtimes.mjs', 'evaluation/runtime-compatibility.json', 'docs/runtime-compatibility.md',
  '.github/agents/frontend-codepen-extractor.agent.md',
  '.github/copilot-instructions.md',
  '.github/prompts/extract-codepen.prompt.md',
  pluginRoot + '/.claude-plugin/plugin.json',
  pluginRoot + '/README.md',
  pluginRoot + '/agents/frontend-codepen-extractor.md',
  pluginRoot + '/skills/frontend-codepen-extractor/SKILL.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/codepen-ingestion.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/uiverse-ingestion.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/dependency-policy.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/framework-patterns.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/quality-checklist.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/reconstruction-playbook.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/progressive-search.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/codemyui-ingestion.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/multilanguage-engineering.md',
  pluginRoot + '/skills/frontend-codepen-extractor/references/agent-architecture.md',
];
for (const relativePath of required) {
  check(readFile(relativePath) !== null, 'Required distribution file exists: ' + relativePath);
}

const marketplace = loadJson('.claude-plugin/marketplace.json');
if (marketplace) {
  check(marketplace.name === 'jmstudio14-claude-plugins', 'Marketplace name is correct');
  check(marketplace.version === '2.12.0', 'Marketplace version is 2.12.0');
  check(typeof marketplace.description === 'string' && marketplace.description.length > 0, 'Marketplace description is present');
  check(typeof marketplace.owner?.name === 'string' && marketplace.owner.name.length > 0, 'Marketplace owner.name is present');
  const entry = Array.isArray(marketplace.plugins)
    ? marketplace.plugins.find((item) => item.name === 'frontend-codepen-extractor')
    : null;
  check(Boolean(entry), 'Marketplace lists frontend-codepen-extractor');
  check(entry?.source === './plugins/frontend-codepen-extractor', 'Marketplace source points to plugin directory');
}

const manifest = loadJson(pluginRoot + '/.claude-plugin/plugin.json');
if (manifest) {
  check(manifest.name === 'frontend-codepen-extractor', 'Plugin manifest name matches marketplace entry');
  check(manifest.version === '2.12.0', 'Plugin version is 2.12.0');
  check(typeof manifest.description === 'string' && manifest.description.length > 10, 'Plugin manifest description is present');
  check(typeof manifest.author?.name === 'string' && manifest.author.name.length > 0, 'Plugin manifest author.name is present');
  check(/^https:\/\//.test(manifest.homepage || ''), 'Plugin homepage is a valid HTTPS URL');
}

const agent = readFile(pluginRoot + '/agents/frontend-codepen-extractor.md') || '';
const agentMeta = agent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check(Boolean(agentMeta), 'Plugin agent frontmatter is present');
if (agentMeta) {
  check(/^name:\s*frontend-codepen-extractor\s*$/m.test(agentMeta[1]), 'Plugin agent name is correct');
  check(/^description:\s*\S/m.test(agentMeta[1]), 'Plugin agent description is present');
  check(/^skills:\s*\r?\n\s*-\s*frontend-codepen-extractor\s*$/m.test(agentMeta[1]), 'Plugin agent declares its matching skill');
}

const skill = readFile(pluginRoot + '/skills/frontend-codepen-extractor/SKILL.md') || '';
const skillMeta = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check(Boolean(skillMeta), 'Plugin skill frontmatter is present');
if (skillMeta) {
  check(/^name:\s*frontend-codepen-extractor\s*$/m.test(skillMeta[1]), 'Plugin skill name is correct');
  check(/^description:\s*\S/m.test(skillMeta[1]), 'Plugin skill description is present');
}

const portableSkillPaths = [
  ['.agents/skills/frontend-codepen-extractor/SKILL.md', pluginRoot + '/skills/frontend-codepen-extractor/SKILL.md'],
  ['.agents/skills/frontend-codepen-extractor/references/codepen-ingestion.md', pluginRoot + '/skills/frontend-codepen-extractor/references/codepen-ingestion.md'],
  ['.agents/skills/frontend-codepen-extractor/references/uiverse-ingestion.md', pluginRoot + '/skills/frontend-codepen-extractor/references/uiverse-ingestion.md'],
  ['.agents/skills/frontend-codepen-extractor/references/dependency-policy.md', pluginRoot + '/skills/frontend-codepen-extractor/references/dependency-policy.md'],
  ['.agents/skills/frontend-codepen-extractor/references/framework-patterns.md', pluginRoot + '/skills/frontend-codepen-extractor/references/framework-patterns.md'],
  ['.agents/skills/frontend-codepen-extractor/references/quality-checklist.md', pluginRoot + '/skills/frontend-codepen-extractor/references/quality-checklist.md'],
  ['.agents/skills/frontend-codepen-extractor/references/reconstruction-playbook.md', pluginRoot + '/skills/frontend-codepen-extractor/references/reconstruction-playbook.md'],
  ['.agents/skills/frontend-codepen-extractor/references/progressive-search.md', pluginRoot + '/skills/frontend-codepen-extractor/references/progressive-search.md'],
  ['.agents/skills/frontend-codepen-extractor/references/codemyui-ingestion.md', pluginRoot + '/skills/frontend-codepen-extractor/references/codemyui-ingestion.md'],
  ['.agents/skills/frontend-codepen-extractor/references/multilanguage-engineering.md', pluginRoot + '/skills/frontend-codepen-extractor/references/multilanguage-engineering.md'],
  ['.agents/skills/frontend-codepen-extractor/references/agent-architecture.md', pluginRoot + '/skills/frontend-codepen-extractor/references/agent-architecture.md'],
];
for (const [portablePath, pluginPath] of portableSkillPaths) {
  const portableContent = readFile(portablePath);
  const pluginContent = readFile(pluginPath);
  check(portableContent !== null, 'Portable skill file exists: ' + portablePath);
  if (portableContent !== null && pluginContent !== null) {
    check(portableContent === pluginContent, 'Portable skill stays in sync: ' + portablePath);
  }
}

const evaluationRunner = readFile('scripts/evaluate-agent.mjs') || '';
for (const term of ['language_detected_correctly', 'version_detected_correctly', 'external_fallback_performed', 'tool_calls', 'elapsed_ms']) {
  check(evaluationRunner.includes(term), 'Runtime evaluator records ' + term);
}
const architectureGuide = readFile('.agents/skills/frontend-codepen-extractor/references/agent-architecture.md') || '';
for (const term of ['Core contract', 'Orchestration layer', 'Adapter layer', 'Evidence and provenance record']) {
  check(architectureGuide.toLowerCase().includes(term.toLowerCase()), 'Architecture guide includes ' + term);
}
const evaluationText = readFile('tests/agent-evaluation-cases.json');
try {
  const evaluation = JSON.parse(evaluationText || '');
  const categories = new Set((evaluation.cases || []).map((item) => item.category));
  check((evaluation.cases || []).length >= 8, 'Evaluation scenario suite contains at least eight cases');
  check(new Set((evaluation.cases || []).map((item) => item.id)).size === evaluation.cases.length, 'Evaluation scenario IDs are unique');
  check(['multilanguage', 'progressive-search', 'provenance', 'verification', 'safety', 'security', 'web-component'].every((item) => categories.has(item)), 'Evaluation scenario suite covers key risk categories');
} catch (error) { check(false, 'Evaluation scenario JSON parses (' + error.message + ')'); }

const multiGuide = readFile('.agents/skills/frontend-codepen-extractor/references/multilanguage-engineering.md') || '';
for (const term of ['Detect the actual task and stack first', 'authoritative documentation', 'language-specific', 'PASS / FAIL / NOT RUN']) {
  check(multiGuide.toLowerCase().includes(term.toLowerCase()), 'Multilanguage guide includes ' + term);
}

const searchGuide = readFile('.agents/skills/frontend-codepen-extractor/references/progressive-search.md') || '';
for (const term of ['Mandatory fallback rule', 'proceed to Stage 2 automatically', 'do not ask the user whether to search externally']) {
  check(searchGuide.toLowerCase().includes(term.toLowerCase()), 'Progressive search enforces external fallback: ' + term);
}

const copilotAgent = readFile('.github/agents/frontend-codepen-extractor.agent.md') || '';
const copilotMeta = copilotAgent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check(Boolean(copilotMeta), 'GitHub Copilot custom agent frontmatter is present');
if (copilotMeta) {
  check(/^name:\s*frontend-codepen-extractor\s*$/m.test(copilotMeta[1]), 'Copilot agent name is correct');
  check(/^description:\s*\S/m.test(copilotMeta[1]), 'Copilot agent description is present');
}
const copilotInstructions = readFile('.github/copilot-instructions.md') || '';
check(copilotInstructions.includes('.agents/skills/frontend-codepen-extractor/SKILL.md'), 'Copilot instructions reference the portable skill');

const referencePaths = required.filter((item) => item.includes('/references/'));
for (const relativePath of referencePaths) {
  check(readFile(relativePath) !== null, 'Skill reference exists: ' + relativePath);
}

console.log('\nPlugin packaging validation: ' + (total - failed) + '/' + total + ' checks passed.');
if (failed > 0) process.exitCode = 1;
