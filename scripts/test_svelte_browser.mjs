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
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        // Il contesto JS viene distrutto durante una navigazione: si riprova.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout: ${label}`);
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
  // Il titolo della card linka la scheda film, ma non deve aprire la scheda
  // orari: il click deve arrivare al link senza far scattare l'accordion.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 3, mobile: true });
  await navigate(new URL('/', base).href, '.movie-title a');
  await waitFor('document.querySelectorAll("#venue-filter option").length > 1', 'programmazione caricata');
  const titleLink = await evaluate(`(() => {
    const link = document.querySelector('.movie-title a');
    const card = link.closest('.movie-catalog-card');
    let reached = false;
    const stop = (event) => { if (event.target.closest('.movie-title a')) { event.preventDefault(); reached = true; } };
    document.addEventListener('click', stop);
    link.click();
    const expanded = card.classList.contains('is-expanded');
    const href = link.getAttribute('href');
    document.removeEventListener('click', stop);
    return { href, expanded, reached };
  })()`);
  assert.ok(titleLink.href.startsWith('/film/'), titleLink.href);
  assert.equal(titleLink.reached, true, 'il click sul titolo deve raggiungere il link');
  assert.equal(titleLink.expanded, false, 'il click sul titolo non deve aprire la scheda orari');
  const filmTitleHref = titleLink.href;
  await navigate(new URL(filmTitleHref, base).href, '.film-summary');
  // Tornando indietro il wordmark deve riportare a una home gia' pronta: se la
  // navigazione interna non caricasse app.js la griglia resterebbe inerte.
  await evaluate('document.querySelector(".wordmark").click()');
  await waitFor('document.querySelectorAll("#venue-filter option").length > 1', 'home interattiva dopo il ritorno');
  assert.ok(await evaluate('document.querySelectorAll(".movie-catalog-card").length > 0'));
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });

  // Il pulsante calendario scarica il file .ics sia da telefono sia da computer.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 3, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await navigate(new URL('/', base).href, '#calendar-open');
  await waitFor('document.querySelectorAll("#venue-filter option").length > 1', 'programmazione caricata');
  await evaluate('document.querySelector("#calendar-open").click()');
  assert.ok(await evaluate('document.querySelector("#calendar-dialog").open'));
  await waitFor('document.querySelector("#calendar-google").getAttribute("href")', 'link file .ics');
  const googleHref = await evaluate('document.querySelector("#calendar-google").getAttribute("href")');
  assert.ok(googleHref.endsWith('.ics'), googleHref);
  assert.ok(!googleHref.includes('calendar.google.com'), googleHref);
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(new URL('/', base).href, '#calendar-open');
  await waitFor('document.querySelectorAll("#venue-filter option").length > 1', 'programmazione caricata');
  await evaluate('document.querySelector("#calendar-open").click()');
  await waitFor('document.querySelector("#calendar-google").getAttribute("href")', 'link file .ics desktop');
  const googleDesktop = await evaluate('document.querySelector("#calendar-google").getAttribute("href")');
  assert.ok(googleDesktop.endsWith('.ics'), googleDesktop);

  // Offline: dopo l'installazione il service worker deve servire la home dalla cache.
  await waitFor('Boolean(navigator.serviceWorker.controller)', 'service worker attivo');
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await navigate(new URL('/', base).href, '#page-title');
  assert.equal(await evaluate('document.querySelector("#page-title").textContent.trim()'), 'Programmazione cinema');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // Navigazione interna (client-side) tra due pagine: la transizione Svelte non
  // deve impedire il render della pagina nuova.
  await navigate(new URL('/programmazione/oggi', base).href, '.page-enter h1');
  await evaluate('document.querySelector("a.calendar-btn").click()');
  await waitFor('location.pathname === "/calendario" && document.querySelector(".page-enter h1")', 'navigazione interna a /calendario');
  assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
  await cdp('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate(new URL('/calendario?cinema=garden', base).href, 'form');
  assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 1);
  assert.ok(await evaluate('document.querySelector("input[type=url]").value.endsWith("/garden.ics")'));
  assert.ok(await evaluate('document.querySelector("a[href^=webcal]").getAttribute("href").endsWith("/garden.ics")'));
  assert.ok(await evaluate('[...document.querySelectorAll("a.calendar-app-link")].some((a) => a.getAttribute("href")?.endsWith("/garden.ics"))'));
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
  console.log(JSON.stringify({ layouts, widths: [320, 390, 768, 1280], calendarWithoutJavaScript: true, runtimeErrors }));
} finally {
  socket?.close();
  chrome.kill();
}
