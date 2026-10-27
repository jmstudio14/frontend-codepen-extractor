#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
const matrix=JSON.parse(fs.readFileSync(arg('--matrix')||path.join(root,'evaluation/runtime-compatibility.json'),'utf8'));
const output=arg('--output'),dryRun=args.includes('--dry-run'),timeoutMs=Number(arg('--timeout-ms')||8*60*1000);
const criteria=matrix.scoring?.criteria??[],errors=[];
if(criteria.reduce((s,c)=>s+c.weight_percent,0)!==100)errors.push('criterion weights must total 100');
if(!Array.isArray(matrix.candidates)||!matrix.candidates.length)errors.push('matrix must declare candidates');
for(const c of matrix.candidates??[])if(!c.id||!c.package)errors.push('each candidate needs id and package');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
const run=(cmd,argv,cwd)=>spawnSync(cmd,argv,{cwd,encoding:'utf8',timeout:timeoutMs,maxBuffer:2*1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,CI:'true',npm_config_audit:'false',npm_config_fund:'false'}});
const excerpt=s=>String(s||'').slice(-2000);
const results=[];
for(const c of matrix.candidates){
 const result={id:c.id,package:c.package,status:'NOT RUN',exact_version:null,install_exit_code:null,import_exit_code:null,export_count:null,representative_exports:[],elapsed_ms:0,install_stdout:'',install_stderr:'',import_stdout:'',import_stderr:'',reason:null};
 if(dryRun){result.reason='Dry run requested; no npm registry or package install was invoked.';results.push(result);continue;}
 const started=Date.now(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-probe-'));
 try{
  fs.writeFileSync(path.join(tmp,'package.json'),JSON.stringify({name:'runtime-compatibility-probe',version:'1.0.0',private:true,type:'module'},null,2)+'\n');
  const view=run('npm',['view',c.package,'version','--json'],tmp);
  if(view.error||view.status!==0){result.status='FAIL_REGISTRY_LOOKUP';result.reason=view.error?.message||'npm view exited non-zero';result.install_stderr=excerpt(view.stderr);continue;}
  let version;
  try{version=JSON.parse(view.stdout.trim());}catch{version=view.stdout.trim().replace(/^["']|["']$/g,'');}
  if(typeof version!=='string'||!/^\d+\.\d+\.\d+/.test(version)){result.status='FAIL_REGISTRY_LOOKUP';result.reason='Registry did not return a parseable exact semantic version.';result.install_stdout=excerpt(view.stdout);continue;}
  result.exact_version=version;
  const install=run('npm',['install','--prefix',tmp,'--no-save','--no-package-lock','--ignore-scripts','--no-audit','--no-fund',c.package+'@'+version],tmp);
  result.install_exit_code=install.status??1;result.install_stdout=excerpt(install.stdout);result.install_stderr=excerpt(install.stderr);
  if(install.error||install.status!==0){result.status='FAIL_INSTALL';result.reason=install.error?.message||'npm install exited non-zero';continue;}
  const probePath=path.join(tmp,'probe.mjs');
  fs.writeFileSync(probePath,`const mod=await import(${JSON.stringify(c.package)});const names=Object.keys(mod);if(names.length===0)throw new Error('Module imported but exposed no enumerable exports');console.log(JSON.stringify({export_count:names.length,representative_exports:names.slice(0,20)}));\n`);
  const imp=run(process.execPath,[probePath],tmp);
  result.import_exit_code=imp.status??1;result.import_stdout=excerpt(imp.stdout);result.import_stderr=excerpt(imp.stderr);
  if(imp.error||imp.status!==0){result.status='FAIL_IMPORT';result.reason=imp.error?.message||'Node import smoke test exited non-zero';continue;}
  try{const parsed=JSON.parse(imp.stdout.trim().split(/\r?\n/).at(-1));result.export_count=parsed.export_count;result.representative_exports=parsed.representative_exports;}catch{result.reason='Import succeeded but export summary was not parseable.';result.status='FAIL_IMPORT';continue;}
  result.status='PASS_IMPORT_SMOKE';result.reason='Installed exact registry version with lifecycle scripts disabled and imported module without invoking a model.';
 }catch(error){result.status='FAIL_PROBE';result.reason=String(error?.message||error).slice(0,1000);}
 finally{result.elapsed_ms=Date.now()-started;fs.rmSync(tmp,{recursive:true,force:true});results.push(result);}
 console.log(result.status.padEnd(22)+' '+c.id+' '+(result.exact_version||'version unknown')+' '+(result.reason||''));
}
const report={schema_version:1,generated_at:new Date().toISOString(),node:process.version,platform:process.platform,mode:dryRun?'DRY_RUN':'INSTALL_AND_IMPORT_SMOKE',credential_values_read:false,live_model_invocation:'NOT RUN',package_lifecycle_scripts:'DISABLED',selection:{selected_runtime:matrix.selected_runtime??null,status:matrix.status},results,summary:{total:results.length,import_smoke_passed:results.filter(x=>x.status==='PASS_IMPORT_SMOKE').length,failed:results.filter(x=>x.status.startsWith('FAIL')).length,not_run:results.filter(x=>x.status==='NOT RUN').length}};
if(output){const p=path.resolve(output);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(report,null,2)+'\n');}
console.log('SDK import smoke: '+report.summary.import_smoke_passed+'/'+report.summary.total+' passed; live model calls: NOT RUN; selected runtime: NONE');
if(output)console.log('Report written: '+path.resolve(output));
