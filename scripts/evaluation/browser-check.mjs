#!/usr/bin/env node
/**
 * Optional browser check for an evaluation workspace. Runs only when Playwright
 * is resolvable; otherwise prints NOT RUN. Network is blocked except file: URLs.
 * Usage: node scripts/evaluation/browser-check.mjs <workspace> <fixture.json> [--screenshots <dir>]
 * Prints one JSON line {status, failures, blocked_requests, screenshots} and exits 1 on FAIL.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMissingBrowserDownload } from './fixtures.mjs';

const args = process.argv.slice(2);
const workspace = args[0] && path.resolve(args[0]);
const manifestPath = args[1] && path.resolve(args[1]);
const shotsArg = args.indexOf('--screenshots') >= 0 ? args[args.indexOf('--screenshots') + 1] : null;
const report = (result) => { console.log(JSON.stringify(result)); if (result.status === 'FAIL') process.exitCode = 1; };

if (!workspace || !manifestPath || !fs.existsSync(path.join(workspace, 'index.html')) || !fs.existsSync(manifestPath)) {
  console.error('Usage: browser-check.mjs <workspace> <fixture.json> [--screenshots <dir>]');
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).browser ?? {};

let chromium;
try {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  ({ chromium } = createRequire(path.join(repoRoot, 'package.json'))('playwright'));
} catch {
  report({ status: 'NOT RUN', reason: 'playwright is not installed; browser check skipped', failures: [] });
  process.exit(0);
}

// Tracks timers and window/document listeners so teardown can be verified. A listener counts once per
// (target, type, callback, capture), as in the DOM, and removing one that was never added changes nothing.
const trackerScript = () => {
  const state = { intervals: new Set(), rafCalls: 0, listeners: new Set() };
  window.__lifecycle = state;
  const setI = window.setInterval.bind(window), clearI = window.clearInterval.bind(window), raf = window.requestAnimationFrame.bind(window);
  window.setInterval = (...a) => { const id = setI(...a); state.intervals.add(id); return id; };
  window.clearInterval = (id) => { state.intervals.delete(id); return clearI(id); };
  window.requestAnimationFrame = (cb) => { state.rafCalls += 1; return raf(cb); };
  const callbackIds = new WeakMap();
  let nextId = 0;
  const keyOf = (targetName, type, callback, options) => {
    if (!callbackIds.has(callback)) callbackIds.set(callback, ++nextId);
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    return `${targetName}|${type}|${callbackIds.get(callback)}|${capture}`;
  };
  for (const [targetName, target] of [['window', window], ['document', document]]) {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, callback, options) => {
      if (callback && (typeof callback === 'function' || typeof callback === 'object')) {
        const key = keyOf(targetName, type, callback, options);
        state.listeners.add(key);
        // The DOM removes a `once` listener after it fires and a `signal` listener when the signal aborts.
        if (options?.once) add(type, () => state.listeners.delete(key), { once: true, capture: typeof options === 'boolean' ? options : Boolean(options?.capture) });
        if (options?.signal) options.signal.addEventListener('abort', () => state.listeners.delete(key), { once: true });
      }
      return add(type, callback, options);
    };
    target.removeEventListener = (type, callback, options) => {
      if (callback && (typeof callback === 'function' || typeof callback === 'object')) state.listeners.delete(keyOf(targetName, type, callback, options));
      return remove(type, callback, options);
    };
  }
};

const failures = [];
const errors = [];
const blocked = [];
const screenshots = [];
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  // The playwright package can be installed without its browser download; that is NOT RUN, not FAIL.
  // Only a missing browser download is NOT RUN. Any other launch error (crash, sandbox, missing system
  // library) means the check could not verify the page, so it fails.
  if (isMissingBrowserDownload(error.message)) {
    report({ status: 'NOT RUN', reason: 'Chromium for Playwright is not installed (run npx playwright install chromium); browser check skipped', failures: [] });
    process.exit(0);
  }
  report({ status: 'FAIL', failures: ['browser could not start: ' + error.message.split('\n')[0].slice(0, 300)] });
  process.exit(1);
}
try {
  const viewport = { width: config.viewport_width ?? 360, height: 800 };
  const page = await browser.newPage({ viewport });
  await page.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : (blocked.push(route.request().url()), route.abort())));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource|net::ERR_/.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(trackerScript);
  await page.goto(pathToFileURL(path.join(workspace, 'index.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const shot = async (name) => {
    if (!shotsArg) return;
    fs.mkdirSync(path.resolve(shotsArg), { recursive: true });
    const file = path.join(path.resolve(shotsArg), name + '.png');
    await page.screenshot({ path: file, fullPage: true });
    screenshots.push(file);
  };
  await shot('before');

  if (!(await page.locator(config.visible).first().isVisible().catch(() => false))) failures.push(`${config.visible} is not visible`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) failures.push(`horizontal overflow of ${overflow}px at ${viewport.width}px`);
  for (const { role, name } of config.roles ?? []) {
    if (await page.getByRole(role, { name: new RegExp(name, 'i') }).count() === 0) failures.push(`no ${role} with accessible name /${name}/i`);
  }
  const bodyText = () => page.evaluate(() => document.body.innerText);
  if (config.literal_text && !(await bodyText()).includes(config.literal_text)) failures.push(`text "${config.literal_text}" not shown literally`);
  if (config.click) {
    // The expected result must appear because of the click: it is checked absent before and present after.
    const expected = config.click.expect_pattern ? new RegExp(config.click.expect_pattern) : null;
    const label = expected ? `/${config.click.expect_pattern}/` : `"${config.click.expect_text}"`;
    const shows = (text) => (expected ? expected.test(text) : text.includes(config.click.expect_text));
    const target = page.getByRole(config.click.role, { name: new RegExp(config.click.name, 'i') }).first();
    if (await target.count() === 0) failures.push(`cannot click ${config.click.role} /${config.click.name}/i`);
    else {
      if (shows(await bodyText())) failures.push(`${label} is already shown before the click`);
      await target.click();
      await page.waitForTimeout(200);
      if (!shows(await bodyText())) failures.push(`after click, ${label} is not shown`);
    }
  }
  await shot('after');

  if (config.teardown) {
    await page.evaluate(config.teardown);
    const rafBefore = await page.evaluate(() => window.__lifecycle.rafCalls);
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({ intervals: window.__lifecycle.intervals.size, raf: window.__lifecycle.rafCalls, listeners: window.__lifecycle.listeners.size }));
    if (state.intervals) failures.push(`${state.intervals} interval(s) still active after teardown`);
    if (state.raf > rafBefore + 1) failures.push('requestAnimationFrame still running after teardown');
    if (state.listeners > 0) failures.push(`${state.listeners} window/document listener(s) not removed by teardown`);
  }
  if (typeof config.max_blocked_requests === 'number' && blocked.length > config.max_blocked_requests) failures.push(`${blocked.length} network request(s) attempted; page must work offline`);
  for (const error of errors) failures.push('page error: ' + error.slice(0, 200));
} finally {
  await browser.close();
}
report({ status: failures.length ? 'FAIL' : 'PASS', failures, blocked_requests: blocked, screenshots });
