import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const base = process.argv[2] || 'http://127.0.0.1:4173';
const executable = [process.env.CHROME_BIN, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((item) => item && existsSync(item));
assert.ok(executable, 'Impostare CHROME_BIN sul percorso di Chrome/Chromium');
const chrome = spawn(executable, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${path.join(tmpdir(), 'opencode', `fp-svelte-${randomUUID()}`)}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    let stderr = '';
    chrome.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    chrome.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exit ${code}`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  const runtimeErrors = [];
  const loaded = new Set();
  let id = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (item) {
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Page.loadEventFired') {
      for (const resolve of loaded) resolve();
      loaded.clear();
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  const navigate = async (url, selector) => {
    const loading = new Promise((resolve, reject) => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { loaded.delete(done); reject(new Error('Page load timeout')); }, 30000);
      loaded.add(done);
    });
    await cdp('Page.navigate', { url });
    await loading;
    assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), `Missing ${selector} at ${url}`);
  };
  let layouts = 0;
  for (const width of [320, 390, 768, 1280]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    for (const pathname of ['/', '/calendario']) {
      await navigate(new URL(pathname, base).href, 'h1');
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `Overflow ${pathname} at ${width}px`);
      assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
      layouts++;
    }
  }
  await cdp('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate(new URL('/calendario?cinema=garden', base).href, 'form');
  assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 1);
  assert.ok(await evaluate('document.querySelector("input[type=url]").value.endsWith("/garden.ics")'));
  assert.ok(await evaluate('document.querySelector("a[href^=webcal]").getAttribute("href").endsWith("/garden.ics")'));
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
  console.log(JSON.stringify({ layouts, widths: [320, 390, 768, 1280], calendarWithoutJavaScript: true, runtimeErrors }));
} finally {
  socket?.close();
  chrome.kill();
}
