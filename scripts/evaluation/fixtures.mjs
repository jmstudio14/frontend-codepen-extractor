// Locates evaluation fixtures by case ID through their fixture.json manifests.
import fs from 'node:fs';
import path from 'node:path';

// Never copied into an agent workspace: the manifest and the assertions are the answer key.
export const HOST_ONLY_FILES = new Set(['fixture.json', 'check.mjs']);

// Files a fixture keeps on the host in addition to HOST_ONLY_FILES (manifest "host_only_files").
export function hostOnlyFiles(manifest) {
  return new Set([...HOST_ONLY_FILES, ...(Array.isArray(manifest?.host_only_files) ? manifest.host_only_files : [])]);
}

// Writes a file without following a symlink placed at its path (O_NOFOLLOW; Windows lacks the flag, so
// callers also check the path with lstat first).
export function writeFileNoFollow(file, data) {
  const { O_WRONLY, O_CREAT, O_TRUNC, O_NOFOLLOW = 0 } = fs.constants;
  const fd = fs.openSync(file, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0o644);
  try { fs.writeFileSync(fd, data); } finally { fs.closeSync(fd); }
}

// Only a missing browser download means the check could not run. Playwright's missing-system-library
// error suggests `npx playwright install-deps`; that, a crash or a sandbox error is a real failure.
export function isMissingBrowserDownload(message) {
  return /Executable doesn't exist/i.test(message) || /npx playwright install(?!-deps)\b/i.test(message);
}

export function validateManifest(manifest) {
  const errors = [];
  if (typeof manifest?.case_id !== 'string' || !manifest.case_id) errors.push('case_id must be a non-empty string');
  if (!Array.isArray(manifest?.editable_files) || !manifest.editable_files.length) errors.push('editable_files must be a non-empty array');
  if (!Array.isArray(manifest?.source_files) || !manifest.source_files.length) errors.push('source_files must be a non-empty array');
  if (typeof manifest?.check !== 'string' || !manifest.check) errors.push('check must name an assertion script');
  if (typeof manifest?.prompt_suffix !== 'string' || !manifest.prompt_suffix.trim()) errors.push('prompt_suffix is required');
  if (typeof manifest?.browser?.visible !== 'string') errors.push('browser.visible selector is required');
  if (manifest?.host_only_files !== undefined && !Array.isArray(manifest.host_only_files)) errors.push('host_only_files must be an array');
  for (const file of Array.isArray(manifest?.host_only_files) ? manifest.host_only_files : []) {
    // Host-only files are matched by name when the workspace is copied, so a path would never match.
    if (typeof file !== 'string' || !file || /[\\/]/.test(file)) errors.push(`host-only entry ${JSON.stringify(file)} must be a plain file name`);
    if (manifest.editable_files?.includes(file) || manifest.source_files?.includes(file)) errors.push(`host-only file ${file} cannot also be a source or editable file`);
  }
  return errors;
}

export function listFixtures(root) {
  const base = path.join(root, 'tests/fixtures');
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(base, entry.name, 'fixture.json')))
    .map((entry) => {
      const dir = path.join(base, entry.name);
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
        return { name: entry.name, dir, manifest, checkPath: path.resolve(dir, typeof manifest?.check === 'string' ? manifest.check : '') };
      } catch (error) {
        // Reported by validateManifest(null) callers instead of crashing every script that lists fixtures.
        return { name: entry.name, dir, manifest: null, error: `fixture.json does not parse: ${error.message}`, checkPath: null };
      }
    });
}

export function findFixture(root, caseId) {
  return listFixtures(root).find((fixture) => fixture.manifest?.case_id === caseId) ?? null;
}

export function buildPrompt(testCase, manifest) {
  return `${testCase.prompt}\n\nUse the frontend-codepen-extractor skill. Work only in this workspace. Inspect Git status before editing, make focused changes, inspect the diff, and report evidence honestly. ${manifest.prompt_suffix} Do not claim browser or visual QA was run. State that this is vanilla browser JavaScript and whether a runtime version is declared.`;
}
