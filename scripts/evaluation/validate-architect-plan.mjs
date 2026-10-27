#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { parseDocument } from 'yaml';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/evaluation/validate-architect-plan.mjs <plan.yaml>');
  process.exit(2);
}
let source;
try { source = fs.readFileSync(input, 'utf8'); }
catch (error) { console.error(`Cannot read plan: ${error.message}`); process.exit(2); }
const doc = parseDocument(source, { uniqueKeys: true, strict: true });
if (doc.errors.length) {
  for (const error of doc.errors) console.error(`YAML error: ${error.message}`);
  process.exit(1);
}
const plan = doc.toJS();
const failures = [];
const requireType = (path, value, type) => {
  if (typeof value !== type) failures.push(`${path} must be ${type}`);
};
requireType('schema_version', plan?.schema_version, 'number');
if (plan?.schema_version !== 1) failures.push('schema_version must equal 1');
if (!['READY', 'NEEDS_INPUT', 'BLOCKED'].includes(plan?.status)) failures.push('status must be READY, NEEDS_INPUT, or BLOCKED');
requireType('request_summary', plan?.request_summary, 'string');
for (const key of ['repository_evidence','requirements','tasks','dependencies','risks','open_questions']) {
  if (!Array.isArray(plan?.[key])) failures.push(`${key} must be an array`);
}
if (!plan?.approach || typeof plan.approach !== 'object') failures.push('approach must be an object');
if (!plan?.verification || typeof plan.verification !== 'object') failures.push('verification must be an object');
requireType('rollback', plan?.rollback, 'string');
const approval = plan?.human_approval;
if (!approval || approval.status !== 'PENDING' || approval.required_before_implementation !== true || approval.approved_by !== null) {
  failures.push('human_approval must remain {status: PENDING, required_before_implementation: true, approved_by: null}');
}
for (const [index, req] of (Array.isArray(plan?.requirements) ? plan.requirements : []).entries()) {
  for (const key of ['id','requirement','acceptance_test','source']) if (!req?.[key]) failures.push(`requirements[${index}].${key} is required`);
}
for (const [index, task] of (Array.isArray(plan?.tasks) ? plan.tasks : []).entries()) {
  for (const key of ['id','description','files','depends_on','verification']) if (task?.[key] === undefined) failures.push(`tasks[${index}].${key} is required`);
}
for (const [index, evidence] of (Array.isArray(plan?.repository_evidence) ? plan.repository_evidence : []).entries()) {
  for (const key of ['path','observation','relevance']) if (!evidence?.[key]) failures.push(`repository_evidence[${index}].${key} is required`);
}
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
console.log(`PASS  YAML syntax and architect-plan schema v1: ${input}`);
