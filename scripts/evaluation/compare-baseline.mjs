#!/usr/bin/env node
import fs from 'node:fs';
const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:null;},rp=arg('--report'),bp=arg('--baseline');
if(!rp||!bp){console.error('Usage: compare-baseline.mjs --report report.json --baseline baseline.json');process.exit(2);}
if(!fs.existsSync(bp)){console.log('NOT RUN: no approved measured baseline exists.');process.exit(0);}
const r=JSON.parse(fs.readFileSync(rp,'utf8')),b=JSON.parse(fs.readFileSync(bp,'utf8'));
if(b.approved!==true||typeof b.pass_rate_percent!=='number'){console.log('NOT RUN: baseline is not explicitly approved or has no measured pass rate.');process.exit(0);}
const maxDrop=Number(process.env.EVAL_MAX_PASS_RATE_DROP||b.max_pass_rate_drop_percent||5),issues=[],drop=b.pass_rate_percent-r.pass_rate_percent;
if(drop>maxDrop)issues.push('pass rate dropped '+drop.toFixed(1)+' points (limit '+maxDrop+')');
if(typeof b.cost_usd_per_case==='number'&&typeof r.cost_usd_per_case==='number'&&b.cost_usd_per_case>0){const max=Number(process.env.EVAL_MAX_COST_INCREASE_PERCENT||b.max_cost_increase_percent||20),inc=(r.cost_usd_per_case/b.cost_usd_per_case-1)*100;if(inc>max)issues.push('cost per case increased '+inc.toFixed(1)+'% (limit '+max+'%)');}
console.log('Baseline pass rate: '+b.pass_rate_percent+'%; current: '+r.pass_rate_percent+'%; allowed drop: '+maxDrop);
for(const issue of issues)console.error('REGRESSION: '+issue);if(issues.length)process.exit(1);console.log('No configured baseline regression detected.');
