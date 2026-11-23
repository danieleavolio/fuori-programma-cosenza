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
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      runtimeErrors.push(details.exception?.description || details.text);
    }
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
    for (const pathname of ['/', '/calendario', '/programmazione/oggi', '/programmazione/stasera', '/prossimamente', '/cinema/andromeda-river']) {
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
  // Il nuovo accesso ai salvati è un toggle: un secondo click riporta al catalogo.
  const catalogSize = await evaluate('document.querySelectorAll("#movies-grid .movie-catalog-card").length');
  await evaluate('document.querySelector("#movies-grid [data-fav-id]").click()');
  await evaluate('document.querySelector("#fav-toggle-btn").click()');
  assert.equal(await evaluate('document.querySelector("#fav-toggle-btn").getAttribute("aria-pressed")'), 'true');
  assert.equal(await evaluate('document.querySelectorAll("#movies-grid .movie-catalog-card").length'), 1);
  await evaluate('document.querySelector("#fav-toggle-btn").click()');
  assert.equal(await evaluate('document.querySelectorAll("#movies-grid .movie-catalog-card").length'), catalogSize);
  assert.ok(await evaluate(`(() => {
    const movie = scheduleData.movies.find(movie => filmHref(movie));
    const url = new URL(filmHref(movie), document.querySelector('link[rel="canonical"]').href).href;
    return formatFilmShareMessage(movie).includes(url);
  })()`), 'La condivisione deve includere la scheda film del sito');
  assert.equal(await evaluate('document.querySelector(".movie-catalog-card img.poster").loading'), 'eager');
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
  // Un refresh dei dati ridisegna la griglia: i link devono restare tutti.
  await evaluate('document.querySelector("#refresh").click()');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const afterRefresh = await evaluate('[document.querySelectorAll(".movie-title a").length, document.querySelectorAll(".movie-catalog-card").length]');
  assert.equal(afterRefresh[0], afterRefresh[1], 'ogni card deve avere il link al film');
  const filmTitleHref = titleLink.href;
  await navigate(new URL(filmTitleHref, base).href, '.film-summary');
  // Tornando indietro il wordmark deve riportare a una home gia' pronta: se la
  // navigazione interna non caricasse app.js la griglia resterebbe inerte.
  await evaluate('document.querySelector(".wordmark").click()');
  await waitFor('document.querySelectorAll("#venue-filter option").length > 1', 'home interattiva dopo il ritorno');
  assert.ok(await evaluate('document.querySelectorAll(".movie-catalog-card").length > 0'));
  // La home non è idratata da Svelte: entrambi i link devono riavviare app.js
  // e i filtri devono rispondere dopo ogni ritorno da Prossimamente.
  for (const view of ['schedule', 'movies']) {
    await evaluate('document.querySelector(".coming-soon-link").click()');
    await waitFor('location.pathname === "/prossimamente" && document.querySelector("#page-title")?.textContent === "Prossimamente"', 'apertura Prossimamente');
    await evaluate(`document.querySelector('.view-switcher a[href="${view === 'schedule' ? '/?view=schedule' : '/'}"]').click()`);
    await waitFor(`location.pathname === '/' && document.querySelector('#venue-filter')?.options.length > 1 && document.querySelector('[data-view="${view}"]')?.getAttribute('aria-selected') === 'true'`, `ritorno a ${view}`);
    await evaluate(`const search = document.querySelector('#search'); search.value = '_titolo_inesistente_'; search.dispatchEvent(new Event('input'));`);
    assert.equal(await evaluate('document.querySelector("#empty-state").hidden'), false, `filtro attivo in ${view}`);
    await evaluate('document.querySelector("#clear-filters").click()');
    const selector = view === 'schedule' ? '#day-layout-list' : '#movie-layout-list';
    await evaluate(`document.querySelector('${selector}').click()`);
    await waitFor(`document.querySelector('${selector}').getAttribute('aria-pressed') === 'true'`, `animazione Lista in ${view}`);
  }
  const optimizedPosters = await evaluate(`(async () => {
    const image = document.querySelector('img.poster[src^="/posters/"]');
    if (!image) return 0;
    image.loading = 'eager';
    await image.decode();
    return image.naturalWidth;
  })()`);
  if (optimizedPosters) assert.ok(optimizedPosters > 450, 'L’immagine in home usa la locandina più nitida');
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
  assert.equal(await evaluate('document.querySelector("#page-title").textContent.trim()'), 'Cinema a Cosenza e Rende');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // Navigazione interna (client-side) tra due pagine: la transizione Svelte non
  // deve impedire il render della pagina nuova.
  await navigate(new URL('/', base).href, '.today-cta');
  await evaluate(`document.querySelector("#search").value = "nessun titolo"; document.querySelector("#search").dispatchEvent(new Event("input")); document.querySelector(".today-cta").click()`);
  await waitFor('location.pathname === "/programmazione/oggi" && document.querySelector("#page-title")?.textContent.includes("Cinema oggi")', 'Oggi in sala apre la pagina dedicata');
  assert.equal(await evaluate('document.querySelectorAll(".period-nav, .quick-chips").length'), 0);
  if (await evaluate('Boolean(document.querySelector(".movie-catalog-card"))')) {
    const cards = await evaluate('document.querySelectorAll(".movie-catalog-card").length');
    await waitFor(`(() => { const list = [...document.querySelectorAll(".layout-button")].find(b => b.textContent.trim() === "Lista"); list?.click(); return list?.getAttribute("aria-pressed") === "true"; })()`, 'lista interattiva in Oggi');
    assert.equal(await evaluate('document.querySelectorAll(".movie-catalog-card").length'), cards);
    assert.equal(await evaluate('document.querySelectorAll(".movie-grid").length'), 0);
  }
  await evaluate('document.querySelector("a.calendar-btn").click()');
  await waitFor('location.pathname === "/calendario" && document.querySelector(".page-enter h1")', 'navigazione interna a /calendario');
  assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
  await cdp('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate(new URL('/', base).href, '.today-cta');
  assert.equal(await evaluate('document.querySelector(".today-cta").getAttribute("href")'), '/programmazione/oggi');
  assert.equal(await evaluate('document.querySelectorAll("#cinema-list a.venue-tile").length'), 5);
  await navigate(new URL('/calendario?cinema=garden', base).href, 'form');
  assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 1);
  assert.ok(await evaluate('document.querySelector("input[type=url]").value.endsWith("/garden.ics")'));
  assert.ok(await evaluate('document.querySelector("a[href^=webcal]").getAttribute("href").endsWith("/garden.ics")'));
  assert.ok(await evaluate('[...document.querySelectorAll("a.calendar-app-link")].some((a) => a.getAttribute("href")?.endsWith("/garden.ics"))'));
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
  console.log(JSON.stringify({ layouts, widths: [320, 390, 768, 1280], comingSoonReturn: ['schedule', 'movies'], optimizedPosterWidth: optimizedPosters, calendarWithoutJavaScript: true, runtimeErrors }));
} finally {
  socket?.close();
  chrome.kill();
}
