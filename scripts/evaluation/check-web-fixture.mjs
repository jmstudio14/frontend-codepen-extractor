#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2]&&path.resolve(process.argv[2]);if(!root||!fs.existsSync(root)){console.error('Usage: check-web-fixture.mjs <workspace>');process.exit(2);}
const js=fs.readFileSync(path.join(root,'prototype.js'),'utf8'),css=fs.readFileSync(path.join(root,'prototype.css'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),bad=[];
for(const [label,re] of [['animation cancellation',/cancelAnimationFrame/],['resize cleanup',/removeEventListener\s*\(\s*['"]resize['"]/],['reduced motion',/matchMedia\s*\(/],['safe text',/textContent\s*=/]])if(!re.test(js))bad.push(label);
if(/innerHTML\s*=/.test(js))bad.push('remove innerHTML assignment');if(/(^|\n)\s*(\*|body|section|button)\s*\{/m.test(css))bad.push('scope global CSS');if(!/aria-label|aria-labelledby|aria-describedby/i.test(html))bad.push('accessible HTML relationship');
if(bad.length){console.error('Failed assertions: '+bad.join('; '));process.exit(1);}console.log('PASS: animation/listener cleanup, reduced motion, safe text, scoped CSS and accessibility.');
