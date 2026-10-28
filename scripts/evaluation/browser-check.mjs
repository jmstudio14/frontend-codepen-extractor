#!/usr/bin/env node
/**
 * Optional browser check for an evaluation workspace. Runs only when Playwright
 * is resolvable; otherwise prints NOT RUN. Network is blocked except file: URLs: HTTP(S) requests from
 * every page and worker, WebSockets and service workers. Not covered: WebRTC peer connections.
 * Usage: node scripts/evaluation/browser-check.mjs <workspace> <fixture.json> [--screenshots <dir>]
 * Prints one JSON line {status, failures, blocked_requests, screenshots, sandbox, warnings} and exits 1 on FAIL.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMissingBrowserDownload, writeFileNoFollow } from './fixtures.mjs';

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

// Playwright and Chromium keep their profile and artifacts in the temporary folder, and a failed launch
// leaves them behind. They get a private folder instead, removed on every exit, signals included.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-check-'));
for (const name of ['TMPDIR', 'TMP', 'TEMP']) process.env[name] = scratch;
process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {} });
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(signal, () => process.exit(code));

let chromium;
try {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  ({ chromium } = createRequire(path.join(repoRoot, 'package.json'))('playwright'));
} catch {
  report({ status: 'NOT RUN', reason: 'playwright is not installed; browser check skipped', failures: [] });
  process.exit(0);
}

// Tracks timers and animation callbacks so teardown can be verified. Listeners are not tracked here: the
// browser itself reports them (see listenerCount below), so page code cannot hide one. Timers have no such
// report, so they are counted by wrappers installed before any page code runs. The page under test is
// untrusted, so the wrappers rely on nothing it can redefine: every built-in they use is captured first
// and called through the captured Reflect.apply, counts are plain numbers in objects without a prototype,
// and the page sees only a frozen read-out that returns a string. Not covered: timers taken from another
// frame's window (iframe.contentWindow), and a single timeout set before teardown that fires later.
const trackerScript = () => {
  const apply = Reflect.apply, create = Object.create, freeze = Object.freeze, define = Object.defineProperty;
  const setI = window.setInterval, clearI = window.clearInterval, raf = window.requestAnimationFrame;
  const setT = window.setTimeout, clearT = window.clearTimeout, idle = window.requestIdleCallback;
  const intervals = create(null), pending = create(null);
  let intervalCount = 0, frameCalls = 0, timeoutCalls = 0;
  const dropInterval = (id) => { if (intervals[id]) { intervals[id] = false; intervalCount -= 1; } };
  // Browsers share one id pool: clearTimeout also clears an interval, and clearInterval a timeout.
  const clearAny = (id) => { dropInterval(id); pending[id] = 0; };
  // Timeouts still pending, by the order they were set in, so that one set after teardown began and still
  // pending at the end (a self-rescheduling loop with any period shorter than the wait) is caught, while
  // one-shot timeouts that fire, however many, are not.
  const pendingTimeoutsSetAfter = (mark) => { let count = 0; for (const id in pending) if (pending[id] > mark) count += 1; return count; };
  const snapshot = () => intervalCount + ',' + frameCalls + ',' + timeoutCalls;
  define(window, '__lifecycle', { value: freeze({ snapshot, pendingTimeoutsSetAfter }), writable: false, configurable: false, enumerable: false });
  window.setInterval = function (handler, delay, ...rest) {
    const args = [handler, delay];
    for (let i = 0; i < rest.length; i += 1) args[args.length] = rest[i];
    const id = apply(setI, window, args);
    if (!intervals[id]) { intervals[id] = true; intervalCount += 1; }
    return id;
  };
  window.clearInterval = function (id) { clearAny(id); return apply(clearI, window, [id]); };
  window.clearTimeout = function (id) { clearAny(id); return apply(clearT, window, [id]); };
  // Tracked until it fires or is cleared, so a timeout loop that survives teardown is detected. A string
  // callback cannot be wrapped, so a companion timeout with the same delay marks it as fired.
  window.setTimeout = function (handler, delay, ...rest) {
    const order = ++timeoutCalls;
    let id;
    const run = typeof handler === 'function' ? function (...a) { pending[id] = 0; return apply(handler, this, a); } : handler;
    const args = [run, delay];
    for (let i = 0; i < rest.length; i += 1) args[args.length] = rest[i];
    id = apply(setT, window, args);
    pending[id] = order;
    if (typeof handler !== 'function') apply(setT, window, [() => { pending[id] = 0; }, delay]);
    return id;
  };
  window.requestAnimationFrame = function (callback) { frameCalls += 1; return apply(raf, window, [callback]); };
  if (typeof idle === 'function') window.requestIdleCallback = function (callback, options) { frameCalls += 1; return apply(idle, window, [callback, options]); };
};

// Listeners on window and document as the browser itself reports them (DevTools protocol), whoever added
// them: page code, another frame's EventTarget.prototype, or a listener whose signal never really aborted.
// window and document cannot be redefined by the page. A page without scripts has none.
async function listenerCount(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    let total = 0;
    for (const expression of ['window', 'document']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'lifecycle' });
      total += (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
    }
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'lifecycle' });
    return total;
  } finally { await cdp.detach(); }
}

const failures = [];
const errors = [];
const blocked = [];
const outside = [];
const screenshots = [];
const warnings = [];
// The pages are untrusted, so Chromium runs in its OS sandbox. Chromium cannot sandbox itself as root,
// and some systems forbid the sandbox; then it runs without one and the result says so.
let sandbox = process.getuid?.() !== 0;
let browser;
const launchError = (error) => {
  // The playwright package can be installed without its browser download; that is NOT RUN, not FAIL.
  // Only a missing browser download is NOT RUN. Any other launch error (crash, missing system library)
  // means the check could not verify the page, so it fails.
  if (isMissingBrowserDownload(error.message)) {
    report({ status: 'NOT RUN', reason: 'Chromium for Playwright is not installed (run npx playwright install chromium); browser check skipped', failures: [] });
    process.exit(0);
  }
  report({ status: 'FAIL', failures: ['browser could not start: ' + error.message.split('\n')[0].slice(0, 300)] });
  process.exit(1);
};
try {
  browser = await chromium.launch({ chromiumSandbox: sandbox });
} catch (error) {
  if (!sandbox || !/sandbox/i.test(error.message)) launchError(error);
  sandbox = false;
  try { browser = await chromium.launch({ chromiumSandbox: false }); } catch (retryError) { launchError(retryError); }
}
if (!sandbox) warnings.push('Chromium ran without its OS sandbox (running as root, or the sandbox is unavailable here); run the check as a normal user where possible.');
try {
  const viewport = { width: config.viewport_width ?? 360, height: 800 };
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  // On the context, so popups, frames and workers are covered too. Only files inside the checked folder
  // load: anything else (a script kept in .git, a file elsewhere on disk) would run or show content that
  // was never compared. WebSockets are not HTTP routes; they are closed and counted separately. A
  // Playwright too old to intercept them cannot keep the page offline.
  const workspaceReal = fs.realpathSync(workspace);
  const insideWorkspace = (url) => {
    let target;
    try { target = fileURLToPath(url); } catch { return false; }
    try { target = fs.realpathSync(target); } catch { target = path.resolve(target); }
    const rel = path.relative(workspaceReal, target);
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
  };
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file:') && insideWorkspace(url)) return route.continue();
    if (url.startsWith('file:')) outside.push(url); else blocked.push(url);
    return route.abort();
  });
  if (typeof context.routeWebSocket !== 'function') throw new Error('this Playwright version cannot block WebSockets; use Playwright 1.48 or later');
  await context.routeWebSocket(/.*/, (socket) => { blocked.push(socket.url()); socket.close(); });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource|net::ERR_/.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(trackerScript);
  await page.goto(pathToFileURL(path.join(workspace, 'index.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const shot = async (name) => {
    if (!shotsArg) return;
    // Checked again right before writing, so a folder swapped for a link after earlier checks is refused.
    const dir = path.resolve(shotsArg);
    let stat = null;
    try { stat = fs.lstatSync(dir); } catch {}
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error(`${dir} is not a real folder; refusing to write screenshots through it`);
    if (!stat) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(path.resolve(shotsArg), name + '.png');
    // Written by this script rather than by Playwright, so a symlink placed at the file is not followed.
    writeFileNoFollow(file, await page.screenshot({ fullPage: true }));
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
    // A teardown that throws is a failure with its reason, not a crash without a result.
    const tornDown = await page.evaluate(config.teardown).then(() => true, (error) => { failures.push('teardown failed: ' + error.message.split('\n')[0].slice(0, 200)); return false; });
    if (tornDown) {
      // The read-out is a string of numbers, so no object the page could tamper with is serialised.
      const read = async () => {
        const [intervals, frames, timeouts] = (await page.evaluate(() => window.__lifecycle.snapshot())).split(',').map(Number);
        return { intervals, frames, timeouts };
      };
      const before = await read();
      // More than twice the fixtures' one-second clock, so a loop with that period reschedules in the window.
      await page.waitForTimeout(2200);
      const state = await read();
      const rescheduled = await page.evaluate((mark) => window.__lifecycle.pendingTimeoutsSetAfter(mark), before.timeouts);
      const listeners = await listenerCount(page);
      if (state.intervals) failures.push(`${state.intervals} interval(s) still active after teardown`);
      if (state.frames > before.frames + 1) failures.push('requestAnimationFrame or requestIdleCallback still running after teardown');
      if (rescheduled) failures.push('setTimeout still rescheduling after teardown');
      if (listeners > 0) failures.push(`${listeners} window/document listener(s) not removed by teardown`);
    }
  }
  if (outside.length) failures.push(`page tried to load ${outside.length} file(s) outside the checked folder: ${outside.slice(0, 3).join(', ')}`);
  if (typeof config.max_blocked_requests === 'number' && blocked.length > config.max_blocked_requests) failures.push(`${blocked.length} network request(s) attempted; page must work offline`);
  for (const error of errors) failures.push('page error: ' + error.slice(0, 200));
} catch (error) {
  failures.push('browser check could not complete: ' + error.message.split('\n')[0].slice(0, 300));
} finally {
  await browser.close();
}
report({ status: failures.length ? 'FAIL' : 'PASS', failures, blocked_requests: blocked, screenshots, sandbox, warnings });
