import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const executable = [process.env.CHROME_BIN, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((item) => item && existsSync(item));
assert.ok(executable, 'Chrome/Chromium richiesto');
const output = path.join(tmpdir(), 'opencode', `catalog-${randomUUID()}`);
await mkdir(output, { recursive: true });
const chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${path.join(output, 'profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map();
  const errors = [];
  let pageLoaded;
  let id = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (item) { pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Page.loadEventFired') pageLoaded?.();
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 30000);
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
  const navigate = async (pathname) => {
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Page timeout: ${pathname}`)), 30000);
      pageLoaded = () => { clearTimeout(timer); pageLoaded = undefined; resolve(); };
    });
    await cdp('Page.navigate', { url: new URL(pathname, base).href });
    await loaded;
    const result = await cdp('Runtime.evaluate', {
      expression: `new Promise(resolve => { const ready = () => { if (document.readyState === 'complete' && document.querySelector('h1')) resolve(true); else requestAnimationFrame(ready); }; ready(); })`,
      returnByValue: true, awaitPromise: true
    });
    assert.equal(result.result.value, true);
  };
  for (const width of [320, 390, 1280]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    for (const pathname of ['/prossimamente', '/programmazione/oggi', '/programmazione/stasera', '/programmazione/weekend']) {
      await navigate(pathname);
      assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
      if (pathname === '/prossimamente') {
        assert.equal(await evaluate('document.querySelectorAll(".period-nav").length'), 0);
        assert.equal(await evaluate('document.querySelector("h1").textContent.trim()'), 'Prossimamente');
        assert.ok(await evaluate('document.querySelector(".page-heading p").textContent.includes("film in arrivo")'));
      }
      const cards = await evaluate('document.querySelectorAll(".movie-catalog-card").length');
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${pathname} overflow ${width}`);
      if (cards) {
        assert.equal(await evaluate('document.querySelectorAll(".poster-link").length'), cards);
        await evaluate(`new Promise((resolve, reject) => { const start = performance.now(); const ready = () => { const button = [...document.querySelectorAll('.layout-button')].find(b => b.textContent.trim() === 'Lista'); button?.click(); requestAnimationFrame(() => { if (button?.getAttribute('aria-pressed') === 'true') resolve(true); else if (performance.now() - start > 10000) reject(new Error('Layout non interattivo')); else ready(); }); }; ready(); })`);
        assert.equal(await evaluate('document.querySelectorAll(".movie-grid").length'), 0);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `Lista ${pathname} overflow ${width}`);
        await evaluate(`[...document.querySelectorAll('.layout-button')].find(b => b.textContent.trim() === 'Griglia').click()`);
        // Il cambio di layout passa da una view transition: un solo frame non basta.
        assert.ok(await evaluate(`new Promise(resolve => { const start = performance.now(); const ready = () => { if (document.querySelectorAll('.movie-grid').length) resolve(true); else if (performance.now() - start > 10000) resolve(false); else requestAnimationFrame(ready); }; ready(); })`), `Griglia ${pathname} ${width}`);
      }
      if (pathname === '/prossimamente' && width !== 320) {
        const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(output, `prossimamente-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      if (pathname === '/prossimamente' && width === 1280) {
        const failedImages = await evaluate(`(async () => {
          const images = [...document.querySelectorAll('.poster')];
          images.forEach(image => image.loading = 'eager');
          await Promise.race([Promise.allSettled(images.map(image => image.decode())), new Promise(resolve => setTimeout(resolve, 20000))]);
          return images.filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src);
        })()`);
        assert.deepEqual(failedImages, [], 'Tutte le locandine devono caricarsi');
        console.log('Tutte le locandine di Prossimamente caricate');
      }
      if (pathname === '/programmazione/oggi' && width === 390) {
        const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(output, 'oggi-390.png'), Buffer.from(screenshot.data, 'base64'));
      }
      console.log(`${pathname} ${width}px: ${cards} card, poster e griglia/lista OK`);
    }
  }
  assert.deepEqual(errors, []);
  console.log(`Screenshot: ${output}`);
} finally {
  socket?.close();
  chrome.kill();
}
