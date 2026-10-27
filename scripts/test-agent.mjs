#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCommand } from './block-dangerous-commands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { console.error(`FAIL  ${name}: ${error.message}`); process.exitCode = 1; }
}

for (const [command, expected] of [
  ['git reset --hard HEAD', 'git-hard-reset'],
  ['git clean -fd', 'git-clean-force'],
  ['git push origin main --force', 'forced-git-push'],
  ['rm -rf ./build', 'recursive-force-delete'],
  ['Remove-Item -Recurse -Force ./dist', 'powershell-recursive-delete'],
  ['npm publish', 'package-publish'],
  ['rmdir /s /q C:\\temp\\fixture', 'windows-delete-tree'],
]) {
  test(`guard classifies destructive command: ${command}`, () => assert.equal(classifyCommand(command), expected));
}

for (const command of [
  'git status --short', 'git diff --check', 'npm test', 'npm run build', 'npm install lucide-react',
  'git push origin main', 'git clean -nfd', 'node scripts/validate-agent.mjs',
]) {
  test(`guard leaves ordinary command to normal permission flow: ${command}`, () => assert.equal(classifyCommand(command), null));
}

test('guard treats empty or non-string command as no match', () => {
  assert.equal(classifyCommand(''), null);
  assert.equal(classifyCommand(null), null);
});

test('no local absolute paths are embedded in project instructions', () => {
  for (const rel of ['CLAUDE.md', '.claude/agents/frontend-codepen-extractor.md']) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(content, /(?:C:\\\\Users\\\\|\/Users\/[^\s]+|\/home\/[^\s]+)/, `${rel} should not contain a machine-specific path`);
  }
});

test('evaluation scenario suite parses and declares schema version', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  assert.equal(suite.schema_version, 1);
  assert.ok(Array.isArray(suite.cases));
  assert.ok(suite.cases.length >= 8);
});

test('evaluation scenario IDs are unique and acceptance criteria are non-empty', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const ids = suite.cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of suite.cases) {
    assert.ok(item.prompt?.trim(), `${item.id} needs a prompt`);
    assert.ok(item.must?.length, `${item.id} needs required behavior`);
    assert.ok(item.must_not?.length, `${item.id} needs forbidden behavior`);
  }
});

test('evaluation suite covers core multilingual and extraction risks', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/agent-evaluation-cases.json'), 'utf8'));
  const categories = new Set(suite.cases.map(item => item.category));
  for (const category of ['multilanguage', 'progressive-search', 'provenance', 'verification', 'safety', 'security', 'web-component']) {
    assert.ok(categories.has(category), `missing ${category} scenario`);
  }
});

console.log(`\nSmoke tests finished: ${passed} passed.`);
