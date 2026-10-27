#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let checks = 0;

function pass(message) { checks += 1; console.log(`PASS  ${message}`); }
function fail(message) { checks += 1; failures += 1; console.error(`FAIL  ${message}`); }
function read(rel) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return fs.readFileSync(target, 'utf8');
}
function exists(rel) {
  const target = path.join(root, rel);
  return fs.existsSync(target);
}

const required = [
  '.claude/agents/frontend-extractor-validation-agent.md', 'docs/agents/frontend-extractor-validation-agent.md', 'tests/agent-cases/extractor-validation.json',
  '.claude/agents/frontend-security-reviewer.md', 'docs/agents/frontend-security-reviewer.md', 'tests/agent-cases/security-reviewer.json',
  '.claude/agents/frontend-qa-test-engineer.md', 'docs/agents/frontend-qa-test-engineer.md', 'tests/agent-cases/qa-test-engineer.json',
  '.claude/agents/frontend-codepen-extractor.md',
  '.claude/agents/frontend-code-auditor.md', 'docs/agent-auditor.md',
  '.claude/agents/frontend-architect-planner.md', 'docs/frontend-architect-planner.md', 'tests/architect-planner-cases.json', 'scripts/evaluation/validate-architect-plan.mjs', 'scripts/evaluation/evaluate-planner-live.mjs',
  '.claude/skills/frontend-codepen-extractor/SKILL.md',
  '.claude/skills/frontend-codepen-extractor/references/codepen-ingestion.md',
  '.claude/skills/frontend-codepen-extractor/references/uiverse-ingestion.md',
  '.claude/skills/frontend-codepen-extractor/references/dependency-policy.md',
  '.claude/skills/frontend-codepen-extractor/references/framework-patterns.md',
  '.claude/skills/frontend-codepen-extractor/references/quality-checklist.md',
  '.claude/skills/frontend-codepen-extractor/references/reconstruction-playbook.md',
  '.claude/skills/frontend-codepen-extractor/references/progressive-search.md',
  '.claude/skills/frontend-codepen-extractor/references/codemyui-ingestion.md',
  '.claude/skills/frontend-codepen-extractor/references/multilanguage-engineering.md',
  '.claude/skills/frontend-codepen-extractor/references/agent-architecture.md',
  'tests/agent-evaluation-cases.json', 'scripts/evaluate-agent.mjs', 'docs/agent-evaluation.md', 'tests/fixtures/evaluation-adapter.mjs',
  'scripts/adapters/claude-agent-sdk.mjs', 'scripts/evaluation/run-repeated.mjs', 'scripts/evaluation/check-web-fixture.mjs', 'scripts/evaluation/compare-baseline.mjs', 'scripts/evaluation/run_deepeval.py', 'evaluation/requirements-deepeval.txt', 'evaluation/baselines/README.md',
  'scripts/evaluation/assess-runtimes.mjs', 'scripts/evaluation/probe-runtimes.mjs', 'evaluation/runtime-compatibility.json', 'docs/runtime-compatibility.md',
  '.claude/settings.example.json',
  'CLAUDE.md', 'README.md', 'CHANGELOG.md', 'package.json',
  'scripts/block-dangerous-commands.mjs', 'scripts/test-agent.mjs',
  'scripts/validate-agent.ps1', 'tests/fixtures/leaky-animation-prototype/README.md',
  'tests/fixtures/leaky-animation-prototype/index.html',
  'tests/fixtures/leaky-animation-prototype/prototype.css',
  'tests/fixtures/leaky-animation-prototype/prototype.js',
  '.github/workflows/validate-agent.yml',
];
for (const rel of required) exists(rel) ? pass(`Required file exists: ${rel}`) : fail(`Missing required file: ${rel}`);

const agent = read('.claude/agents/frontend-codepen-extractor.md') ?? '';
const skill = read('.claude/skills/frontend-codepen-extractor/SKILL.md') ?? '';
const auditor = read('.claude/agents/frontend-code-auditor.md') ?? '';
const auditorFrontmatter = auditor.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (auditorFrontmatter && /\bname:\s*frontend-code-auditor\b/.test(auditorFrontmatter[1]) && /\bdescription:\s*\S/.test(auditorFrontmatter[1])) pass('Auditor agent frontmatter is valid');
else fail('Auditor agent frontmatter is valid');
if (/tools:\s*Read, Grep, Glob, Bash/.test(auditor) && !/^tools:.*\b(Edit|Write)\b/m.test(auditorFrontmatter?.[1] ?? '')) pass('Auditor profile is read-only (no Edit/Write tools)');
else fail('Auditor profile is read-only (no Edit/Write tools)');
const auditorGuide = read('docs/agent-auditor.md') ?? '';
for (const term of ['PASS', 'FAIL', 'BLOCKED', 'correction rounds', 'does not automatically trigger itself in CI']) auditorGuide.toLowerCase().includes(term.toLowerCase()) ? pass('Auditor guide covers ' + term) : fail('Auditor guide covers ' + term);

const planner = read('.claude/agents/frontend-architect-planner.md') ?? '';
const plannerFrontmatter = planner.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (plannerFrontmatter && /\bname:\s*frontend-architect-planner\b/.test(plannerFrontmatter[1]) && /\bdescription:\s*\S/.test(plannerFrontmatter[1])) pass('Architect planner frontmatter is valid');
else fail('Architect planner frontmatter is valid');
if (/tools:\s*Read, Grep, Glob, Bash/.test(planner) && !/^tools:.*\b(Edit|Write)\b/m.test(plannerFrontmatter?.[1] ?? '')) pass('Architect planner is read-only');
else fail('Architect planner is read-only');
const plannerGuide = read('docs/frontend-architect-planner.md') ?? '';
for (const term of ['schema_version: 1', 'human_approval.status: PENDING', 'NOT RUN', 'does not automatically approve']) plannerGuide.toLowerCase().includes(term.toLowerCase()) ? pass('Architect planner guide covers ' + term) : fail('Architect planner guide covers ' + term);
try {
  const plannerCases = JSON.parse(read('tests/architect-planner-cases.json') ?? '');
  const ids = plannerCases.cases?.map(item => item.id) ?? [];
  if (plannerCases.schema_version === 1 && ids.length >= 6 && new Set(ids).size === ids.length) pass('Architect planner cases parse with unique IDs');
  else fail('Architect planner cases parse with unique IDs');
  if (plannerCases.cases.every(item => item.prompt && item.must?.length && item.must_not?.length)) pass('Architect planner cases define positive and negative criteria');
  else fail('Architect planner cases define positive and negative criteria');
} catch (error) { fail('Architect planner cases parse (' + error.message + ')'); }
const frontmatter = agent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatter) {
  fail('Agent frontmatter delimiters are present');
} else {
  const fm = frontmatter[1];
  /\bname:\s*frontend-codepen-extractor\b/.test(fm) ? pass('Agent name frontmatter is correct') : fail('Agent name frontmatter is correct');
  /\bdescription:\s*\S/.test(fm) ? pass('Agent description frontmatter is present') : fail('Agent description frontmatter is present');
  /\bskills:\s*\r?\n\s*-\s*frontend-codepen-extractor\b/.test(fm) ? pass('Agent preloads the matching skill') : fail('Agent preloads the matching skill');
  /\btools:\s*.+/.test(fm) ? pass('Agent tools frontmatter is present') : fail('Agent tools frontmatter is present');
}
const skillFm = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (skillFm && /\bname:\s*frontend-codepen-extractor\b/.test(skillFm[1]) && /\bdescription:\s*\S/.test(skillFm[1])) {
  pass('Skill frontmatter contains name and description');
} else {
  fail('Skill frontmatter contains name and description');
}

const settingsText = read('.claude/settings.example.json');
if (settingsText) {
  try {
    const settings = JSON.parse(settingsText);
    const hooks = settings?.hooks?.PreToolUse;
    const hasGuard = Array.isArray(hooks) && hooks.some(entry =>
      Array.isArray(entry.hooks) && entry.hooks.some(hook =>
        hook.command === 'node' && Array.isArray(hook.args) && hook.args.some(arg => String(arg).includes('scripts/block-dangerous-commands.mjs'))
      )
    );
    hasGuard ? pass('Optional settings JSON is valid and points to the guard script') : fail('Optional settings JSON points to the guard script');
  } catch (error) {
    fail(`Optional settings JSON parses (${error.message})`);
  }
}

const packageText = read('package.json');
if (packageText) {
  try {
    const pkg = JSON.parse(packageText);
    if (pkg.type === 'module' && pkg.engines?.node) pass('package.json specifies ESM and a Node engine');
    else fail('package.json specifies ESM and a Node engine');
  } catch (error) { fail(`package.json parses (${error.message})`); }
}

const searchGuide = read('.claude/skills/frontend-codepen-extractor/references/progressive-search.md') ?? '';
for (const term of ['predefined sources', 'external sources', 'Source quality', 'Observed', 'reconstructed', 'Mandatory fallback rule', 'proceed to Stage 2 automatically', 'do not ask the user whether to search externally']) {
  searchGuide.toLowerCase().includes(term.toLowerCase()) ? pass(`Progressive search guide includes ${term}`) : fail(`Progressive search guide includes ${term}`);
}

const architectureGuide = read('.claude/skills/frontend-codepen-extractor/references/agent-architecture.md') ?? '';
for (const term of ['Core contract', 'Orchestration layer', 'Adapter layer', 'Evidence and provenance record', 'PASS / FAIL / NOT RUN', 'Static validators can prove']) {
  architectureGuide.toLowerCase().includes(term.toLowerCase()) ? pass('Architecture guide includes ' + term) : fail('Architecture guide includes ' + term);
}
const architectureCopies = [read('.agents/skills/frontend-codepen-extractor/references/agent-architecture.md'), architectureGuide, read('plugins/frontend-codepen-extractor/skills/frontend-codepen-extractor/references/agent-architecture.md')];
architectureCopies.every((copy) => copy !== null && copy === architectureCopies[0]) ? pass('Architecture guide copies are byte-identical') : fail('Architecture guide copies are byte-identical');
const skillCopies = [read('.agents/skills/frontend-codepen-extractor/SKILL.md'), skill, read('plugins/frontend-codepen-extractor/skills/frontend-codepen-extractor/SKILL.md')];
skillCopies.every((copy) => copy !== null && copy === skillCopies[0]) ? pass('Portable and Claude/plugin skill files are byte-identical') : fail('Portable and Claude/plugin skill files are byte-identical');
const agentCopies = [agent, read('.github/agents/frontend-codepen-extractor.agent.md'), read('plugins/frontend-codepen-extractor/agents/frontend-codepen-extractor.md')];
agentCopies.every((copy) => copy !== null && copy === agentCopies[0]) ? pass('Standalone, Copilot and plugin agent profiles are byte-identical') : fail('Standalone, Copilot and plugin agent profiles are byte-identical');
let evaluationCases = null;
try { evaluationCases = JSON.parse(read('tests/agent-evaluation-cases.json') ?? ''); pass('Agent evaluation cases parse as JSON'); }
catch (error) { fail('Agent evaluation cases parse as JSON (' + error.message + ')'); }
if (evaluationCases) {
  const ids = evaluationCases.cases?.map((item) => item.id) ?? [];
  const categories = new Set(evaluationCases.cases?.map((item) => item.category) ?? []);
  ids.length >= 8 && new Set(ids).size === ids.length ? pass('Evaluation cases have unique IDs and minimum coverage') : fail('Evaluation cases have unique IDs and minimum coverage');
  for (const category of ['multilanguage', 'progressive-search', 'provenance', 'verification', 'safety', 'security', 'web-component']) {
    categories.has(category) ? pass('Evaluation scenarios cover ' + category) : fail('Evaluation scenarios cover ' + category);
  }
  evaluationCases.cases.every((item) => item.prompt && item.must?.length && item.must_not?.length) ? pass('Every evaluation scenario defines prompt, required behavior and forbidden behavior') : fail('Every evaluation scenario defines prompt, required behavior and forbidden behavior');
}

const multiGuide = read('.claude/skills/frontend-codepen-extractor/references/multilanguage-engineering.md') ?? '';
for (const term of ['Detect the actual task and stack first', 'authoritative documentation', 'language-specific', 'PASS / FAIL / NOT RUN', 'Do not install']) {
  multiGuide.toLowerCase().includes(term.toLowerCase()) ? pass(`Multilanguage guide includes ${term}`) : fail(`Multilanguage guide includes ${term}`);
}

const codemyuiGuide = read('.claude/skills/frontend-codepen-extractor/references/codemyui-ingestion.md') ?? '';
for (const term of ['Original source available', 'Preview only', 'reconstruction', 'license', 'canonical original-source URL']) {
  codemyuiGuide.toLowerCase().includes(term.toLowerCase()) ? pass(`CodeMyUI ingestion guide includes ${term}`) : fail(`CodeMyUI ingestion guide includes ${term}`);
}

const frameworkGuide = read('.claude/skills/frontend-codepen-extractor/references/framework-patterns.md') ?? '';
for (const name of ['React', 'Vue 3', 'Svelte', 'Vanilla TypeScript']) {
  frameworkGuide.includes(name) ? pass(`Framework guide covers ${name}`) : fail(`Framework guide covers ${name}`);
}
const checklist = read('.claude/skills/frontend-codepen-extractor/references/quality-checklist.md') ?? '';
const playbook = read('.claude/skills/frontend-codepen-extractor/references/reconstruction-playbook.md') ?? '';
for (const term of ['standalone', 'Visual QA', 'NOT RUN', 'repair']) {
  playbook.toLowerCase().includes(term.toLowerCase()) ? pass(`Reconstruction playbook includes ${term}`) : fail(`Reconstruction playbook includes ${term}`);
}
for (const term of ['lifecycle', 'responsive', 'accessibility', 'Visual evidence', 'NOT RUN']) {
  checklist.toLowerCase().includes(term.toLowerCase()) ? pass(`Quality checklist includes ${term}`) : fail(`Quality checklist includes ${term}`);
}

const agentText = agent + skill;
const evaluationRunner = read('scripts/evaluate-agent.mjs') ?? '';
for (const term of ['language_detected_correctly', 'version_detected_correctly', 'external_fallback_performed', 'changed_files', 'checks', 'tool_calls', 'elapsed_ms']) {
  evaluationRunner.includes(term) ? pass('Runtime evaluator records ' + term) : fail('Runtime evaluator records ' + term);
}
const evaluationGuide = read('docs/agent-evaluation.md') ?? '';
for (const term of ['AGENT_EVAL_RESULT_PATH', 'wall-clock duration', 'real agent run has occurred', 'NOT RUN', 'DeepEval', 'ANTHROPIC_API_KEY']) {
  evaluationGuide.toLowerCase().includes(term.toLowerCase()) ? pass('Evaluation guide explains ' + term) : fail('Evaluation guide explains ' + term);
}
for (const term of ['multilanguage', 'multiframework', 'multilanguage-engineering.md']) {
  agentText.toLowerCase().includes(term.toLowerCase()) ? pass(`Agent instructions include ${term}`) : fail(`Agent instructions include ${term}`);
}
for (const term of ['git status', 'untrusted', 'Do not install', 'NOT RUN']) {
  agentText.toLowerCase().includes(term.toLowerCase()) ? pass(`Agent instructions include ${term}`) : fail(`Agent instructions include ${term}`);
}

const fixtureJS = read('tests/fixtures/leaky-animation-prototype/prototype.js') ?? '';
const fixtureCSS = read('tests/fixtures/leaky-animation-prototype/prototype.css') ?? '';
if (fixtureJS.includes('requestAnimationFrame') && fixtureJS.includes('addEventListener')) pass('Fixture contains lifecycle issues for evaluation');
else fail('Fixture contains lifecycle issues for evaluation');
if (/\bbody\b|\*\s*\{/.test(fixtureCSS)) pass('Fixture contains global CSS that should be scoped');
else fail('Fixture contains global CSS that should be scoped');

console.log(`
Validation finished: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exitCode = 1;
