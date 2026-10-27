#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2]&&path.resolve(process.argv[2]);if(!root||!fs.existsSync(root)){console.error('Usage: check.mjs <workspace>');process.exit(2);}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'card.css'),'utf8'),bad=[];
if(!/<html[^>]*\slang=["'][a-z]/i.test(html))bad.push('html lang attribute');
const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)bad.push('unique ids');
const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);if(!imgs.length||imgs.some(tag=>!/\salt=["'][^"']+["']/i.test(tag)))bad.push('alt text on images');
if(/\sstyle=["']/i.test(html))bad.push('remove inline style attributes');
if(/\son[a-z]+=["']/i.test(html))bad.push('remove inline event handlers');
for(const tag of ['div','h2','p','a','button','html','body']){const open=(html.match(new RegExp('<'+tag+'(\\s|>)','gi'))||[]).length,close=(html.match(new RegExp('</'+tag+'>','gi'))||[]).length;if(open!==close)bad.push('balanced <'+tag+'> tags');}
if(((html+fs.readFileSync(path.join(root,'card.js'),'utf8')).match(/<button\b|createElement\s*\(\s*['"]button['"]\s*\)/gi)||[]).length<2)bad.push('two real buttons');
if(/(^|\n|\})\s*(\*|body|html|h2|p|img|a)\s*[{,]/.test(css))bad.push('scope global CSS');
if(/(^|[;{\s])width\s*:\s*(3[6-9]\d|[4-9]\d\d|\d{4,})px/.test(css))bad.push('remove fixed width wider than 360px');
if(bad.length){console.error('Failed assertions: '+bad.join('; '));process.exit(1);}console.log('PASS: valid structure, unique ids, alt text, real buttons, no inline attributes and scoped responsive CSS.');
