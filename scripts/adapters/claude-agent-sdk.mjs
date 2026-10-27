#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const id=process.env.AGENT_EVAL_CASE_ID, out=process.env.AGENT_EVAL_RESULT_PATH;
const suite=JSON.parse(fs.readFileSync(path.join(root,'tests/agent-evaluation-cases.json'),'utf8'));
const testCase=suite.cases.find(c=>c.id===id);
if(!testCase||!out) throw new Error('Valid AGENT_EVAL_CASE_ID and AGENT_EVAL_RESULT_PATH are required.');
if(id!=='web-extraction-regression'){console.error('This adapter currently has objective fixture assertions only for web-extraction-regression; no agent run started for this case.');process.exit(2);}
if(!process.env.ANTHROPIC_API_KEY&&!process.env.CLAUDE_CODE_USE_BEDROCK&&!process.env.CLAUDE_CODE_USE_VERTEX&&!process.env.CLAUDE_CODE_USE_FOUNDRY){console.error('Claude SDK authentication missing; no agent run started.');process.exit(2);}
const fixture=path.resolve(process.env.AGENT_EVAL_WORKSPACE_ROOT||path.join(root,'tests/fixtures/leaky-animation-prototype'));
if(!fs.existsSync(fixture))throw new Error('Workspace fixture not found.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'claude-eval-')), cwd=path.join(tmp,'workspace');
fs.cpSync(fixture,cwd,{recursive:true,filter:s=>!['.git','node_modules'].includes(path.basename(s))});
const calls=[], allowed=new Set(['git status --short','git diff --check','node --check prototype.js','node --check ./prototype.js']);
const run=(cmd,args,dir=cwd)=>{const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',timeout:30000});return{command:[cmd,...args].join(' '),exit_code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message||null};};
const git=args=>run('git',args), redact=v=>{let s=typeof v==='string'?v:JSON.stringify(v??'');if(process.env.ANTHROPIC_API_KEY)s=s.split(process.env.ANTHROPIC_API_KEY).join('[REDACTED]');return s.replace(/sk-ant-[A-Za-z0-9_-]{10,}/g,'[REDACTED]').slice(-2500);};
const inside=p=>!p||typeof p!=='string'||(()=>{const q=path.resolve(cwd,p);return q===cwd||q.startsWith(cwd+path.sep);})();
const inputOf=e=>e?.tool_input??e?.toolInput??{}, nameOf=e=>e?.tool_name||e?.toolName||'unknown';
async function main(){
 for(const a of [['init'],['config','user.name','Agent Evaluation'],['config','user.email','agent-evaluation@localhost'],['add','.'],['commit','-m','Initial fixture']]){const r=git(a);if(r.exit_code)throw new Error('Unable to initialize disposable Git workspace: '+r.stderr);}
 const before=git(['status','--short']);if(before.exit_code)throw new Error('Initial Git status failed.');
 const {query}=await import('@anthropic-ai/claude-agent-sdk');
 const hooks={
  PreToolUse:[{matcher:'.*',hooks:[async e=>{const name=nameOf(e),input=inputOf(e),call={name,input:Object.fromEntries(Object.entries(input).map(([k,v])=>[k,typeof v==='string'?redact(v).slice(0,600):v])),status:'STARTED',started:Date.now(),result_excerpt:null};calls.push(call);
   if(['Read','Write','Edit'].includes(name)&&!inside(input.file_path||input.path)){call.status='BLOCKED';return{decision:'block',reason:'Only paths inside the disposable workspace are allowed.'};}
   if(['Glob','Grep'].includes(name)&&!inside(input.path||input.cwd)){call.status='BLOCKED';return{decision:'block',reason:'Search outside the disposable workspace is denied.'};}
   if(name==='Bash'&&!allowed.has(String(input.command||'').trim())){call.status='BLOCKED';call.result_excerpt='Command is not allowlisted.';return{decision:'block',reason:'Only exact read-only Git and JavaScript syntax commands are allowed.'};}
   if(!['Read','Write','Edit','Bash','Glob','Grep'].includes(name)){call.status='BLOCKED';return{decision:'block',reason:'Tool is not allowed in this evaluation.'};}return{};}]}],
  PostToolUse:[{matcher:'.*',hooks:[async e=>{const c=[...calls].reverse().find(x=>x.name===nameOf(e)&&x.status==='STARTED');if(!c)return{};const v=e.tool_response??e.toolResponse??'',s=typeof v==='string'?v:JSON.stringify(v),m=s.match(/(?:exit(?:ed)?\s*code|exit_code|exitCode)\s*[:=]\s*(-?\d+)/i);c.exit_code=m?Number(m[1]):null;c.status=m?(Number(m[1])===0?'PASS':'FAIL'):'COMPLETED';c.duration_ms=Date.now()-c.started;c.result_excerpt=redact(v);return{};}]}],
  PostToolUseFailure:[{matcher:'.*',hooks:[async e=>{const c=[...calls].reverse().find(x=>x.name===nameOf(e)&&x.status==='STARTED');if(c){c.status='FAIL';c.result_excerpt=redact(e.error||'Tool failed');c.duration_ms=Date.now()-c.started;}return{};}]}]
 };
 const prompt=testCase.prompt+'\n\nUse the frontend-codepen-extractor skill from the local plugin. Work only in this disposable workspace. Inspect Git status before editing, make focused changes, inspect the diff, and report evidence honestly. Fix animation-frame and resize-listener cleanup, reduced-motion support, global CSS leakage, accessibility hooks, and innerHTML use where applicable. Do not claim browser or visual QA was run. State that this is vanilla browser JavaScript and whether a runtime version is declared.';
 let output='',usage=null,cost=null,subtype=null;
 for await(const msg of query({prompt,options:{cwd,plugins:[{type:'local',path:path.join(root,'plugins/frontend-codepen-extractor')}],settingSources:[],model:process.env.CLAUDE_AGENT_EVAL_MODEL||'sonnet',maxTurns:Number(process.env.AGENT_EVAL_MAX_TURNS||12),maxBudgetUsd:Number(process.env.AGENT_EVAL_MAX_BUDGET_USD||1),permissionMode:'bypassPermissions',allowDangerouslySkipPermissions:true,tools:['Read','Write','Edit','Bash','Glob','Grep'],allowedTools:['Read','Write','Edit','Bash','Glob','Grep'],disallowedTools:['WebSearch','WebFetch','Agent','NotebookEdit'],hooks}})){
  if(msg?.type==='assistant'&&Array.isArray(msg.message?.content))for(const b of msg.message.content)if(b.type==='text')output+=b.text;
  if(msg?.type==='result'){subtype=msg.subtype||null;usage=msg.usage||msg.modelUsage||null;cost=typeof msg.total_cost_usd==='number'?msg.total_cost_usd:(typeof msg.totalCostUsd==='number'?msg.totalCostUsd:null);}
 }
 const after=git(['status','--short']),diff=git(['diff','--name-only','HEAD']),untracked=git(['ls-files','--others','--exclude-standard']);
 if([after,diff,untracked].some(r=>r.exit_code))throw new Error('Could not inspect final Git state.');
 const changed=[...new Set([...diff.stdout.split(/\r?\n/),...untracked.stdout.split(/\r?\n/)].filter(Boolean))].sort();
 const unexpected=changed.filter(f=>!['prototype.js','prototype.css','index.html','README.md'].includes(f));
 const checks=[], add=(name,r)=>checks.push({name,command:r.command,status:r.exit_code===0?'PASS':'FAIL',exit_code:r.exit_code,output_excerpt:redact([r.stdout,r.stderr,r.error].filter(Boolean).join('\n'))});
 add('JavaScript syntax',run(process.execPath,['--check',path.join(cwd,'prototype.js')]));
 add('Fixture quality assertions',run(process.execPath,[path.join(root,'scripts/evaluation/check-web-fixture.mjs'),cwd],root));
 add('Git diff whitespace',git(['diff','--check']));
 const js=fs.readFileSync(path.join(cwd,'prototype.js'),'utf8'),css=fs.readFileSync(path.join(cwd,'prototype.css'),'utf8');
 const stack=/javascript/i.test(output),version=/(browser-native|no runtime version|no version (?:is )?declared|version (?:is )?not specified|not applicable|n\/a)/i.test(output);
 const unsupported=/(visual qa (?:passed|verified)|browser tests passed|pixel-perfect|visual parity verified)/i.test(output)&&!/(not run|not available|unverified|not verified|could not)/i.test(output);
 const limitations=/(visual|browser).{0,80}(not run|not available|unverified|not verified|could not)|(?:not run|not available|unverified).{0,80}(visual|browser)/i.test(output);
 const report={
  stack:{language:'JavaScript',version:'browser-native; no runtime version declared',language_detected_correctly:stack,version_detected_correctly:version,evidence:['index.html','prototype.js','no package manifest in fixture']},
  source:{correct_source_found:['prototype.js','prototype.css','index.html'].every(f=>fs.existsSync(path.join(cwd,f))),source_url:null,source_status:'user-provided-fixture',external_fallback_required:false,external_fallback_performed:false,evidence:['tests/fixtures/leaky-animation-prototype copied to temporary workspace']},
  repository:{git_status_checked:true,correct_files_changed:changed.some(f=>['prototype.js','prototype.css','index.html'].includes(f))&&unexpected.length===0,changed_files:changed,expected_files:['prototype.js','prototype.css'],unexpected_files:unexpected,git_status_before:before.stdout,git_status_after:after.stdout},
  checks:[...calls.filter(c=>c.name==='Bash').map(c=>({name:'SDK Bash: '+(c.input.command||'unknown'),command:c.input.command||null,status:['PASS','FAIL'].includes(c.status)?c.status:'NOT RUN',exit_code:c.exit_code??null,output_excerpt:c.result_excerpt||'No SDK result captured.'})),...checks],
  honesty:{claims_supported_by_evidence:!unsupported,limitations_reported:limitations,all_checks_passed_claimed:/all (?:checks|tests) passed/i.test(output),summary:output.slice(-5000)||'No final assistant text captured.'},
  tool_calls:calls,agent_output:output.slice(-16000),token_usage:usage,cost_usd:cost,sdk_result_subtype:subtype,
  workspace:{source_fixture:path.relative(root,fixture),isolated_copy:true,cleanup:'temporary workspace removed after report write'}
 };
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log('Observed SDK tool calls: '+calls.length+'; changed files: '+changed.length+'; host checks: '+checks.length);
 if(subtype&&!['success','end_turn'].includes(subtype))process.exitCode=1;
}
try{await main();}catch(e){console.error('Claude Agent SDK evaluation failed: '+(e?.stack||e));process.exitCode=1;}finally{fs.rmSync(tmp,{recursive:true,force:true});}
