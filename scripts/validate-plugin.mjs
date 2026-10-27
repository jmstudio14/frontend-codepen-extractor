#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { BUNDLED_SPECIALISTS, COORDINATOR, PLUGIN_NAME, expectedPluginAgents, toLF } from './sync-plugin-agents.mjs';

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
  try { return toLF(fs.readFileSync(path.join(root, relativePath), 'utf8')); }
  catch { return null; }
}
function listFiles(relativeDir) {
  const base = path.join(root, relativeDir);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(base, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .sort();
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

const SKILL_COPIES = [
  '.agents/skills/frontend-codepen-extractor',
  '.claude/skills/frontend-codepen-extractor',
  pluginRoot + '/skills/frontend-codepen-extractor',
];
const REQUIRED_REFERENCES = [
  'agent-architecture.md', 'codemyui-ingestion.md', 'codepen-ingestion.md', 'css-tricks-reference.md',
  'dependency-policy.md', 'framework-patterns.md', 'multilanguage-engineering.md', 'progressive-search.md',
  'quality-checklist.md', 'reconstruction-playbook.md', 'uiverse-ingestion.md',
];
const required = [
  '.claude-plugin/marketplace.json',
  'INSTALL.md',
  'tests/agent-evaluation-cases.json', 'scripts/evaluate-agent.mjs', 'docs/agent-evaluation.md', 'tests/fixtures/evaluation-adapter.mjs',
  'scripts/evaluation/check-web-fixture.mjs', 'scripts/evaluation/manual-eval.mjs',
  '.github/agents/frontend-codepen-extractor.agent.md',
  '.github/copilot-instructions.md',
  '.github/prompts/extract-codepen.prompt.md',
  pluginRoot + '/.claude-plugin/plugin.json',
  pluginRoot + '/README.md',
  pluginRoot + '/agents/frontend-codepen-extractor.md',
  ...SKILL_COPIES.flatMap((dir) => [dir + '/SKILL.md', ...REQUIRED_REFERENCES.map((name) => dir + '/references/' + name)]),
];
for (const relativePath of required) {
  check(readFile(relativePath) !== null, 'Required distribution file exists: ' + relativePath);
}

const packageVersion = loadJson('package.json')?.version;
check(/^\d+\.\d+\.\d+$/.test(packageVersion ?? ''), 'package.json version is semantic: ' + packageVersion);
const marketplace = loadJson('.claude-plugin/marketplace.json');
if (marketplace) {
  check(marketplace.name === 'jmstudio14-claude-plugins', 'Marketplace name is correct');
  check(marketplace.version === packageVersion, 'Marketplace version matches package.json (' + packageVersion + ')');
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
  check(manifest.version === packageVersion, 'Plugin version matches package.json (' + packageVersion + ')');
  check(typeof manifest.description === 'string' && manifest.description.length > 10, 'Plugin manifest description is present');
  check(typeof manifest.author?.name === 'string' && manifest.author.name.length > 0, 'Plugin manifest author.name is present');
  check(/^https:\/\//.test(manifest.homepage || ''), 'Plugin homepage is a valid HTTPS URL');
  check(manifest.license === 'MIT', 'Plugin manifest declares the MIT license');
  check(readFile('LICENSE') !== null, 'Repository LICENSE file exists');
}

const agent = readFile(pluginRoot + '/agents/frontend-codepen-extractor.md') || '';
const agentMeta = agent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check(Boolean(agentMeta), 'Plugin agent frontmatter is present');
if (agentMeta) {
  check(/^name:\s*frontend-codepen-extractor\s*$/m.test(agentMeta[1]), 'Plugin agent name is correct');
  check(/^description:\s*\S/m.test(agentMeta[1]), 'Plugin agent description is present');
  check(/^skills:\s*\r?\n\s*-\s*frontend-codepen-extractor\s*$/m.test(agentMeta[1]), 'Plugin agent declares its matching skill');
}

const expectedAgents = expectedPluginAgents(root);
for (const name of [...BUNDLED_SPECIALISTS, COORDINATOR]) {
  const rel = pluginRoot + '/agents/' + name + '.md';
  const content = readFile(rel);
  const meta = content?.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  check(content !== null, 'Bundled plugin agent exists: ' + rel);
  check(new RegExp('^name:\\s*' + name + '\\s*$', 'm').test(meta) && /^description:\s*\S/m.test(meta) && /^tools:\s*\S/m.test(meta), 'Bundled plugin agent declares name, description and tools: ' + name);
  check(content === expectedAgents[name], 'Bundled plugin agent matches .claude/agents source (run node scripts/sync-plugin-agents.mjs): ' + name);
}
const pluginCoordinatorTools = readFile(pluginRoot + '/agents/' + COORDINATOR + '.md')?.match(/^tools:\s*(.+)$/m)?.[1] ?? '';
const delegates = pluginCoordinatorTools.match(/\bAgent\(([^)]*)\)/)?.[1]?.split(',').map((item) => item.trim()) ?? [];
check(delegates.length === BUNDLED_SPECIALISTS.length && delegates.every((id) => BUNDLED_SPECIALISTS.includes(id.replace(PLUGIN_NAME + ':', '')) && id.startsWith(PLUGIN_NAME + ':')), 'Plugin coordinator delegates only to bundled, plugin-scoped specialists');

const skill = readFile(pluginRoot + '/skills/frontend-codepen-extractor/SKILL.md') || '';
const skillMeta = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check(Boolean(skillMeta), 'Plugin skill frontmatter is present');
if (skillMeta) {
  check(/^name:\s*frontend-codepen-extractor\s*$/m.test(skillMeta[1]), 'Plugin skill name is correct');
  check(/^description:\s*\S/m.test(skillMeta[1]), 'Plugin skill description is present');
}

// Every copy of the skill must hold exactly the same files with the same content.
const [canonicalSkill, ...otherSkills] = SKILL_COPIES;
const canonicalFiles = listFiles(canonicalSkill);
check(canonicalFiles.includes('SKILL.md'), 'Canonical skill has SKILL.md: ' + canonicalSkill);
for (const copy of otherSkills) {
  const files = listFiles(copy);
  check(JSON.stringify(files) === JSON.stringify(canonicalFiles), 'Skill copy has the same files as ' + canonicalSkill + ': ' + copy);
  for (const file of canonicalFiles) {
    if (files.includes(file)) check(readFile(copy + '/' + file) === readFile(canonicalSkill + '/' + file), 'Skill copy stays in sync: ' + copy + '/' + file);
  }
}
const canonicalSkillText = readFile(canonicalSkill + '/SKILL.md') || '';
for (const ref of new Set(canonicalSkillText.match(/references\/[\w.-]+\.md/g) ?? [])) {
  check(canonicalFiles.includes(ref), 'SKILL.md reference exists: ' + ref);
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

console.log('\nPlugin packaging validation: ' + (total - failed) + '/' + total + ' checks passed.');
if (failed > 0) process.exitCode = 1;
