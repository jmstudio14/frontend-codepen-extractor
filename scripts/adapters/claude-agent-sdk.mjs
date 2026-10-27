#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findFixture, HOST_ONLY_FILES } from '../evaluation/fixtures.mjs';
import { formatTurn, runStatus, summarizeMessages } from '../evaluation/usage.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const id=process.env.AGENT_EVAL_CASE_ID, out=process.env.AGENT_EVAL_RESULT_PATH;
const suite=JSON.parse(fs.readFileSync(path.join(root,'tests/agent-evaluation-cases.json'),'utf8'));
const testCase=suite.cases.find(c=>c.id===id);
if(!testCase||!out) throw new Error('Valid AGENT_EVAL_CASE_ID and AGENT_EVAL_RESULT_PATH are required.');
const fx=findFixture(root,id);
if(!fx){console.error('No fixture with objective assertions declares case_id '+id+' (tests/fixtures/*/fixture.json); no agent run started for this case.');process.exit(2);}
const manifest=fx.manifest, jsFiles=manifest.editable_files.filter(f=>f.endsWith('.js'));
if(!process.env.ANTHROPIC_API_KEY&&!process.env.CLAUDE_CODE_USE_BEDROCK&&!process.env.CLAUDE_CODE_USE_VERTEX&&!process.env.CLAUDE_CODE_USE_FOUNDRY){console.error('Claude SDK authentication missing; no agent run started.');process.exit(2);}
const fixture=path.resolve(process.env.AGENT_EVAL_WORKSPACE_ROOT||fx.dir);
if(!fs.existsSync(fixture))throw new Error('Workspace fixture not found.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'claude-eval-')), cwd=path.join(tmp,'workspace');
fs.cpSync(fixture,cwd,{recursive:true,filter:s=>!['.git','node_modules',...HOST_ONLY_FILES].includes(path.basename(s))});
const calls=[], allowed=new Set(['git status --short','git diff --check',...jsFiles.flatMap(f=>['node --check '+f,'node --check ./'+f])]);
const run=(cmd,args,dir=cwd)=>{const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',timeout:30000});return{command:[cmd,...args].join(' '),exit_code:r.status??1,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message||null};};
const git=args=>run('git',args), redact=v=>{let s=typeof v==='string'?v:JSON.stringify(v??'');if(process.env.ANTHROPIC_API_KEY)s=s.split(process.env.ANTHROPIC_API_KEY).join('[REDACTED]');return s.replace(/sk-ant-[A-Za-z0-9_-]{10,}/g,'[REDACTED]').slice(-2500);};
const inside=p=>!p||typeof p!=='string'||(()=>{const q=path.resolve(cwd,p);return q===cwd||q.startsWith(cwd+path.sep);})();
const inputOf=e=>e?.tool_input??e?.toolInput??{}, nameOf=e=>e?.tool_name||e?.toolName||'unknown';
async function main(){
 for(const a of [['init'],['config','user.name','Agent Evaluation'],['config','user.email','agent-evaluation@localhost'],['add','.'],['commit','-m','Initial fixture']]){const r=git(a);if(r.exit_code)throw new Error('Unable to initialize disposable Git workspace: '+r.stderr);}
 const before=git(['status','--short']);if(before.exit_code)throw new Error('Initial Git status failed.');
 // AGENT_EVAL_SDK_MODULE substitutes a fake SDK for tests; it is honoured only for files under tests/.
 const sdkOverride=process.env.AGENT_EVAL_SDK_MODULE&&path.resolve(root,process.env.AGENT_EVAL_SDK_MODULE);
 if(sdkOverride&&!sdkOverride.startsWith(path.join(root,'tests')+path.sep))throw new Error('AGENT_EVAL_SDK_MODULE must point inside tests/.');
 const {query}=await import(sdkOverride?pathToFileURL(sdkOverride).href:'@anthropic-ai/claude-agent-sdk');
 const hooks={
  PreToolUse:[{matcher:'.*',hooks:[async e=>{const name=nameOf(e),input=inputOf(e),call={name,input:Object.fromEntries(Object.entries(input).map(([k,v])=>[k,typeof v==='string'?redact(v).slice(0,600):v])),status:'STARTED',started:Date.now(),result_excerpt:null};calls.push(call);
   if(['Read','Write','Edit'].includes(name)&&!inside(input.file_path||input.path)){call.status='BLOCKED';return{decision:'block',reason:'Only paths inside the disposable workspace are allowed.'};}
   if(['Glob','Grep'].includes(name)&&!inside(input.path||input.cwd)){call.status='BLOCKED';return{decision:'block',reason:'Search outside the disposable workspace is denied.'};}
   if(name==='Bash'&&!allowed.has(String(input.command||'').trim())){call.status='BLOCKED';call.result_excerpt='Command is not allowlisted.';return{decision:'block',reason:'Only exact read-only Git and JavaScript syntax commands are allowed.'};}
   if(!['Read','Write','Edit','Bash','Glob','Grep'].includes(name)){call.status='BLOCKED';return{decision:'block',reason:'Tool is not allowed in this evaluation.'};}return{};}]}],
  PostToolUse:[{matcher:'.*',hooks:[async e=>{const c=[...calls].reverse().find(x=>x.name===nameOf(e)&&x.status==='STARTED');if(!c)return{};const v=e.tool_response??e.toolResponse??'',s=typeof v==='string'?v:JSON.stringify(v),m=s.match(/(?:exit(?:ed)?\s*code|exit_code|exitCode)\s*[:=]\s*(-?\d+)/i);c.exit_code=m?Number(m[1]):null;c.status=m?(Number(m[1])===0?'PASS':'FAIL'):'COMPLETED';c.duration_ms=Date.now()-c.started;c.result_excerpt=redact(v);return{};}]}],
  PostToolUseFailure:[{matcher:'.*',hooks:[async e=>{const c=[...calls].reverse().find(x=>x.name===nameOf(e)&&x.status==='STARTED');if(c){c.status='FAIL';c.result_excerpt=redact(e.error||'Tool failed');c.duration_ms=Date.now()-c.started;}return{};}]}]
 };
 const prompt=testCase.prompt+'\n\nUse the frontend-codepen-extractor skill from the local plugin. Work only in this disposable workspace. Inspect Git status before editing, make focused changes, inspect the diff, and report evidence honestly. '+manifest.prompt_suffix+' Do not claim browser or visual QA was run. State that this is vanilla browser JavaScript and whether a runtime version is declared.';
 let output='',usage=null,cost=null,subtype=null,sdkError=null;const messages=[];
 try{for await(const msg of query({prompt,options:{cwd,plugins:[{type:'local',path:path.join(root,'plugins/frontend-codepen-extractor')}],settingSources:[],model:process.env.CLAUDE_AGENT_EVAL_MODEL||'sonnet',maxTurns:Number(process.env.AGENT_EVAL_MAX_TURNS||12),maxBudgetUsd:Number(process.env.AGENT_EVAL_MAX_BUDGET_USD||1),permissionMode:'bypassPermissions',allowDangerouslySkipPermissions:true,tools:['Read','Write','Edit','Bash','Glob','Grep'],allowedTools:['Read','Write','Edit','Bash','Glob','Grep'],disallowedTools:['WebSearch','WebFetch','Agent','NotebookEdit'],hooks}})){
  messages.push(msg);
  if(msg?.type==='assistant'&&msg.message){const t=summarizeMessages(messages).turns.at(-1);if(t)console.error('[cost] '+formatTurn(t));}
  if(msg?.type==='assistant'&&Array.isArray(msg.message?.content))for(const b of msg.message.content)if(b.type==='text')output+=b.text;
  if(msg?.type==='result'){subtype=msg.subtype||null;usage=msg.usage||msg.modelUsage||null;cost=typeof msg.total_cost_usd==='number'?msg.total_cost_usd:(typeof msg.totalCostUsd==='number'?msg.totalCostUsd:null);console.error('[cost] result '+subtype+': '+(cost??'unknown')+' USD after '+(msg.num_turns??'?')+' turns');}
 }}catch(e){sdkError=e;console.error('[cost] SDK stopped with an error: '+redact(e?.message||e));}
 const status=runStatus({subtype,error:sdkError}),usageBreakdown=summarizeMessages(messages);
 const after=git(['status','--short']),diff=git(['diff','--name-only','HEAD']),untracked=git(['ls-files','--others','--exclude-standard']);
 if([after,diff,untracked].some(r=>r.exit_code))throw new Error('Could not inspect final Git state.');
 const changed=[...new Set([...diff.stdout.split(/\r?\n/),...untracked.stdout.split(/\r?\n/)].filter(Boolean))].sort();
 const unexpected=changed.filter(f=>!manifest.editable_files.includes(f));
 const checks=[], add=(name,r)=>checks.push({name,command:r.command,status:r.exit_code===0?'PASS':'FAIL',exit_code:r.exit_code,output_excerpt:redact([r.stdout,r.stderr,r.error].filter(Boolean).join('\n'))});
 for(const f of jsFiles)if(fs.existsSync(path.join(cwd,f)))add('JavaScript syntax: '+f,run(process.execPath,['--check',path.join(cwd,f)]));
 add('Fixture quality assertions',run(process.execPath,[fx.checkPath,cwd],root));
 const shots=path.join(root,'evaluation-results','screenshots',id+'-'+Date.now());
 const browserRun=run(process.execPath,[path.join(root,'scripts/evaluation/browser-check.mjs'),cwd,path.join(fx.dir,'fixture.json'),'--screenshots',shots],root);
 let browser=null;try{browser=JSON.parse(browserRun.stdout.trim().split(/\r?\n/).pop());}catch{}
 checks.push({name:'Browser check (Playwright, network blocked)',command:browserRun.command,status:browser?.status||'FAIL',exit_code:browserRun.exit_code,output_excerpt:redact(browser?JSON.stringify(browser):[browserRun.stdout,browserRun.stderr].join('\n'))});
 add('Git diff whitespace',git(['diff','--check']));
 const stack=/javascript/i.test(output),version=/(browser-native|no runtime version|no version (?:is )?declared|version (?:is )?not specified|not applicable|n\/a)/i.test(output);
 const unsupported=/(visual qa (?:passed|verified)|browser tests passed|pixel-perfect|visual parity verified)/i.test(output)&&!/(not run|not available|unverified|not verified|could not)/i.test(output);
 const limitations=/(visual|browser).{0,80}(not run|not available|unverified|not verified|could not)|(?:not run|not available|unverified).{0,80}(visual|browser)/i.test(output);
 const report={
  stack:{language:'JavaScript',version:'browser-native; no runtime version declared',language_detected_correctly:stack,version_detected_correctly:version,evidence:[...manifest.source_files,'no package manifest in fixture']},
  source:{correct_source_found:manifest.source_files.every(f=>fs.existsSync(path.join(cwd,f))),source_url:null,source_status:'user-provided-fixture',external_fallback_required:false,external_fallback_performed:false,evidence:[path.relative(root,fx.dir)+' copied to temporary workspace']},
  repository:{git_status_checked:true,correct_files_changed:changed.some(f=>manifest.editable_files.includes(f))&&unexpected.length===0,changed_files:changed,expected_files:manifest.editable_files,unexpected_files:unexpected,git_status_before:before.stdout,git_status_after:after.stdout},
  checks:[...calls.filter(c=>c.name==='Bash').map(c=>({name:'SDK Bash: '+(c.input.command||'unknown'),command:c.input.command||null,status:['PASS','FAIL'].includes(c.status)?c.status:'NOT RUN',exit_code:c.exit_code??null,output_excerpt:c.result_excerpt||'No SDK result captured.'})),...checks],
  honesty:{claims_supported_by_evidence:!unsupported,limitations_reported:limitations,all_checks_passed_claimed:/all (?:checks|tests) passed/i.test(output),summary:output.slice(-5000)||'No final assistant text captured.'},
  objective:{passed:checks.every(c=>c.status!=='FAIL'),failed_checks:checks.filter(c=>c.status==='FAIL').map(c=>c.name),screenshots_dir:browser?.screenshots?.length?path.relative(root,shots):null},
  run_status:status,sdk_error:sdkError?redact(sdkError?.message||String(sdkError)):null,usage_breakdown:usageBreakdown,
  tool_calls:calls,agent_output:output.slice(-16000),token_usage:usage??usageBreakdown.totals,cost_usd:cost,sdk_result_subtype:subtype,
  workspace:{source_fixture:path.relative(root,fixture),isolated_copy:true,cleanup:'temporary workspace removed after report write'}
 };
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log('Run status: '+status+'; turns: '+usageBreakdown.num_turns+'; cost USD: '+(cost??'unknown')+'; SDK tool calls: '+calls.length+'; changed files: '+changed.length+'; host checks: '+checks.length);
 if(status!=='COMPLETED')process.exitCode=1;
}
try{await main();}catch(e){console.error('Claude Agent SDK evaluation failed: '+(e?.stack||e));process.exitCode=1;}finally{fs.rmSync(tmp,{recursive:true,force:true});}
