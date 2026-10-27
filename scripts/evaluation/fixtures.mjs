// Locates evaluation fixtures by case ID through their fixture.json manifests.
import fs from 'node:fs';
import path from 'node:path';

export const HOST_ONLY_FILES = new Set(['fixture.json', 'check.mjs']);

export function validateManifest(manifest) {
  const errors = [];
  if (typeof manifest?.case_id !== 'string' || !manifest.case_id) errors.push('case_id must be a non-empty string');
  if (!Array.isArray(manifest?.editable_files) || !manifest.editable_files.length) errors.push('editable_files must be a non-empty array');
  if (!Array.isArray(manifest?.source_files) || !manifest.source_files.length) errors.push('source_files must be a non-empty array');
  if (typeof manifest?.check !== 'string' || !manifest.check) errors.push('check must name an assertion script');
  if (typeof manifest?.prompt_suffix !== 'string' || !manifest.prompt_suffix.trim()) errors.push('prompt_suffix is required');
  if (typeof manifest?.browser?.visible !== 'string') errors.push('browser.visible selector is required');
  return errors;
}

export function listFixtures(root) {
  const base = path.join(root, 'tests/fixtures');
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(base, entry.name, 'fixture.json')))
    .map((entry) => {
      const dir = path.join(base, entry.name);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
      return { name: entry.name, dir, manifest, checkPath: path.resolve(dir, manifest.check ?? '') };
    });
}

export function findFixture(root, caseId) {
  return listFixtures(root).find((fixture) => fixture.manifest.case_id === caseId) ?? null;
}
