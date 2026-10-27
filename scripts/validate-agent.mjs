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
  '.claude/agents/frontend-codepen-extractor.md',
  '.claude/skills/frontend-codepen-extractor/SKILL.md',
  '.claude/skills/frontend-codepen-extractor/references/codepen-ingestion.md',
  '.claude/skills/frontend-codepen-extractor/references/uiverse-ingestion.md',
  '.claude/skills/frontend-codepen-extractor/references/dependency-policy.md',
  '.claude/skills/frontend-codepen-extractor/references/framework-patterns.md',
  '.claude/skills/frontend-codepen-extractor/references/quality-checklist.md',
  '.claude/skills/frontend-codepen-extractor/references/reconstruction-playbook.md',
  '.claude/skills/frontend-codepen-extractor/references/progressive-search.md',
  '.claude/skills/frontend-codepen-extractor/references/codemyui-ingestion.md',
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
for (const term of ['predefined sources', 'external sources', 'Source quality', 'Observed', 'reconstructed']) {
  searchGuide.toLowerCase().includes(term.toLowerCase()) ? pass(`Progressive search guide includes ${term}`) : fail(`Progressive search guide includes ${term}`);
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
for (const term of ['git status', 'untrusted', 'Do not install', 'NOT RUN']) {
  agentText.toLowerCase().includes(term.toLowerCase()) ? pass(`Agent instructions include ${term}`) : fail(`Agent instructions include ${term}`);
}

const fixtureJS = read('tests/fixtures/leaky-animation-prototype/prototype.js') ?? '';
const fixtureCSS = read('tests/fixtures/leaky-animation-prototype/prototype.css') ?? '';
if (fixtureJS.includes('requestAnimationFrame') && fixtureJS.includes('addEventListener')) pass('Fixture contains lifecycle issues for evaluation');
else fail('Fixture contains lifecycle issues for evaluation');
if (/\bbody\b|\*\s*\{/.test(fixtureCSS)) pass('Fixture contains global CSS that should be scoped');
else fail('Fixture contains global CSS that should be scoped');

console.log(`\nValidation finished: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exitCode = 1;
