#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2]&&path.resolve(process.argv[2]);if(!root||!fs.existsSync(root)){console.error('Usage: check.mjs <workspace>');process.exit(2);}
const js=fs.readFileSync(path.join(root,'widget.js'),'utf8'),css=fs.readFileSync(path.join(root,'widget.css'),'utf8'),bad=[];
if(/\.innerHTML\s*=/.test(js))bad.push('remove innerHTML assignments');
for(const [label,re] of [['interval cleanup',/clearInterval\s*\(/],['listener cleanup',/removeEventListener\s*\(/],['teardown API',/window\.pollWidget\b/],['destroy method',/\bdestroy\b/],['button vote controls',/createElement\s*\(\s*['"]button['"]\s*\)|<button/],['accessible vote name',/Vote for/]])if(!re.test(js))bad.push(label);
if(/(^|\n|\})\s*(\*|body|html|li|ul|h2|p)\s*[{,]/.test(css))bad.push('scope global CSS');
if(/(^|[;{\s])width\s*:\s*(3[6-9]\d|[4-9]\d\d|\d{4,})px/.test(css))bad.push('remove fixed width wider than 360px');
if(bad.length){console.error('Failed assertions: '+bad.join('; '));process.exit(1);}console.log('PASS: text rendering, button controls, lifecycle teardown and scoped responsive CSS.');
