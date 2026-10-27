#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
const matrix=JSON.parse(fs.readFileSync(arg('--matrix')||path.join(root,'evaluation/runtime-compatibility.json'),'utf8'));
const output=arg('--output'),errors=[],criteria=matrix.scoring?.criteria??[];
if(criteria.reduce((s,c)=>s+c.weight_percent,0)!==100)errors.push('criterion weights must total 100');
const ids=new Set();
for(const c of matrix.candidates??[]){if(ids.has(c.id))errors.push('duplicate candidate id: '+c.id);ids.add(c.id);for(const k of criteria){const n=c.scores?.[k.id];if(!Number.isInteger(n)||n<1||n>5)errors.push(c.id+' has invalid score for '+k.id);if(!c.evidence?.[k.id])errors.push(c.id+' missing evidence for '+k.id);}if(!Array.isArray(c.docs)||!c.docs.length)errors.push(c.id+' needs source links');}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
const score=c=>Number(criteria.reduce((s,k)=>s+k.weight_percent*c.scores[k.id]/5,0).toFixed(1));
const command=(cmd,argv)=>{const r=spawnSync(cmd,argv,{cwd:root,encoding:'utf8',timeout:10000});return r.error?'NOT AVAILABLE':(r.stdout||r.stderr||'').trim().split(/\r?\n/)[0].slice(0,160);};
const require=createRequire(import.meta.url);
const installed=Object.fromEntries(matrix.candidates.map(c=>{try{require.resolve(c.package);return[c.id,{package:c.package,installed:true}]}catch{return[c.id,{package:c.package,installed:false}]}}));
const ranking=matrix.candidates.map(c=>({id:c.id,label:c.label,weighted_score:score(c),status:c.status,scores:c.scores})).sort((a,b)=>b.weighted_score-a.weighted_score);
const report={schema_version:1,generated_at:new Date().toISOString(),assessment_type:matrix.assessment_type,scoring_scale:matrix.scoring.scale,source_assessment_date:matrix.assessed_at,ranking,candidates:matrix.candidates,environment_probe:{node:process.version,platform:process.platform,architecture:process.arch,npm:command('npm',['--version']),git:command('git',['--version']),installed_packages:installed,credential_values_read:false,live_model_invocation:'NOT RUN',sdk_runtime_smoke:'NOT RUN',note:'Package availability is a local resolution check only. No package was installed and no credential value was read.'},selection:{selected_runtime:matrix.selected_runtime,status:matrix.status,highest_documented_fit_candidate:ranking[0]?.id??null,decision_gate:matrix.decision_gate},errors:[]};
const rendered=JSON.stringify(report,null,2)+'\n';
if(output){const target=path.resolve(output);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,rendered);}
console.log('Runtime compatibility assessment (documentation-based; not a benchmark)');
for(const c of ranking)console.log(c.weighted_score.toFixed(1).padStart(4)+'/100  '+c.id+'  ['+c.status+']');
console.log('Selected runtime: '+(report.selection.selected_runtime??'NONE'));
console.log('SDK runtime smoke: NOT RUN; live model invocation: NOT RUN');
if(output)console.log('Report written: '+path.relative(process.cwd(),path.resolve(output)));
