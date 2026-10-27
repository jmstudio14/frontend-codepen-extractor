#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2]&&path.resolve(process.argv[2]);if(!root||!fs.existsSync(root)){console.error('Usage: check.mjs <workspace>');process.exit(2);}
const read=f=>fs.existsSync(path.join(root,f))?fs.readFileSync(path.join(root,f),'utf8'):'';
const html=read('index.html'),js=read('gallery.js'),css=read('gallery.css'),deps=read('DEPENDENCIES.md'),bad=[];
if(/<script[^>]+src=["']https?:/i.test(html))bad.push('no remote scripts at runtime');
if(/\b_\.[a-z]/i.test(js))bad.push('replace lodash calls with native JavaScript');
if(/https?:\/\//i.test(js))bad.push('no remote image URLs in JavaScript');
if(/<img[^>]+src=["']https?:/i.test(html))bad.push('no hotlinked images');
const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);if(!imgs.length||imgs.some(tag=>!/\salt=["'][^"']+["']/i.test(tag)))bad.push('alt text on images');
if(!/assets\/photo-[123]\.svg/.test(js+html))bad.push('use the local images in assets/');
if(/\.innerHTML\s*=/.test(js))bad.push('remove innerHTML assignments');
if(!/font-family\s*:[^;]*\b(sans-serif|serif|system-ui)\b/i.test(css))bad.push('generic font fallback');
if(!deps)bad.push('DEPENDENCIES.md inventory');else for(const term of ['lodash','font','picsum'])if(!deps.toLowerCase().includes(term))bad.push('DEPENDENCIES.md mentions '+term);
for(const forbidden of ['node_modules','package.json','package-lock.json'])if(fs.existsSync(path.join(root,forbidden)))bad.push('no package installation ('+forbidden+' created)');
if(bad.length){console.error('Failed assertions: '+bad.join('; '));process.exit(1);}console.log('PASS: offline-capable, local assets, alt text, font fallback, safe caption and dependency inventory.');
