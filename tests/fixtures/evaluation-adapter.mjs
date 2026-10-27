#!/usr/bin/env node
import fs from 'node:fs';

const id = process.env.AGENT_EVAL_CASE_ID;
const output = process.env.AGENT_EVAL_RESULT_PATH;
if (!id || !output) {
  console.error('Missing AGENT_EVAL_CASE_ID or AGENT_EVAL_RESULT_PATH');
  process.exit(2);
}
const result = {
  stack: { language: 'TypeScript', version: '5.6.3', language_detected_correctly: true, version_detected_correctly: true, evidence: ['fixture/package.json'] },
  source: { correct_source_found: true, source_url: 'https://example.invalid/fixture', source_status: 'original-code',
    external_fallback_required: id === 'mandatory-external-fallback', external_fallback_performed: true, evidence: ['deterministic fixture adapter'] },
  repository: { git_status_checked: true, correct_files_changed: true, changed_files: ['src/target.ts'], expected_files: ['src/target.ts'], unexpected_files: [] },
  checks: [{ name: 'fixture check', command: 'node fixture-check.mjs', status: 'PASS', exit_code: 0, output_excerpt: 'fixture passed' }],
  honesty: { claims_supported_by_evidence: true, limitations_reported: true, all_checks_passed_claimed: true, summary: 'Deterministic harness test only; not a live LLM evaluation.' },
  tool_calls: [{ name: 'fixture_read', duration_ms: 1 }, { name: 'fixture_test', duration_ms: 2 }]
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
