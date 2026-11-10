// Scarica pagine con Chrome headless e le serve su stdin/stdout.
//
// Le fonti 18tickets rispondono ai runner GitHub con una challenge anti-bot in
// JavaScript: il browser la risolve da solo e restituisce la pagina reale.
// Modalita' server: un URL per riga su stdin, una risposta JSON per riga su
// stdout. Il processo resta vivo finche' stdin resta aperto.
//
// Uso: node scripts/browser_fetch.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const PAGE_TIMEOUT_MS = Number(process.env.FP_BROWSER_TIMEOUT || 60000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// La pagina e' quella vera solo se contiene uno di questi segnali.
const CONTENT_MARKERS = [
  'movie--preview',
  'inner-film',
  'plotPanel',
  'movie__title',
  'time-select__place',
];
// Segnali di challenge anti-bot (AWS WAF, Cloudflare): non e' ancora la pagina.
const CHALLENGE_MARKERS = [
  'awsWafCookieDomainList',
  'gokuProps',
  'aws-waf-token',
  'cf-chl',
  'challenge-platform',
  'cf-2fa-verify',
  'Just a moment',
];

const isChallenge = (html) => CHALLENGE_MARKERS.some((marker) => html.includes(marker));
const hasContent = (html) => CONTENT_MARKERS.some((marker) => html.includes(marker));

async function spawnChrome(port, profileDir) {
  for (const binary of CHROME_CANDIDATES) {
    let child;
    try {
      child = spawn(binary, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate,BackForwardCache',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--window-size=1440,2400',
        'about:blank',
      ], { stdio: 'ignore' });
    } catch (error) {
      process.stderr.write(`browser non disponibile (${binary}): ${error.message}\n`);
      continue;
    }
    let failed = null;
    child.on('error', (error) => { failed = error; });
    await sleep(300);
    if (failed) {
      process.stderr.write(`browser non disponibile (${binary}): ${failed.message}\n`);
      continue;
    }
    return child;
  }
  return null;
}

async function waitForTarget(port) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('browser non raggiungibile');
}

const port = 9300 + Math.floor(Math.random() * 500);
const profileDir = mkdtempSync(join(tmpdir(), `fp-chrome-${port}-`));
const chrome = await spawnChrome(port, profileDir);

function shutdown(code) {
  if (chrome) chrome.kill();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

if (!chrome) shutdown(1);

let send;
try {
  const target = await waitForTarget(port);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let messageId = 0;
  const pending = new Map();

  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await new Promise((resolve) => socket.addEventListener('open', resolve));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  shutdown(1);
}

async function readHtml() {
  const result = await send('Runtime.evaluate', {
    expression: 'document.documentElement ? document.documentElement.outerHTML : ""',
    returnByValue: true,
  });
  return result.result.value || '';
}

async function loadPage(url) {
  await send('Page.navigate', { url });
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let html = '';
  let lastReload = Date.now();
  while (Date.now() < deadline) {
    await sleep(1500);
    html = await readHtml();
    if (hasContent(html) && !isChallenge(html)) break;
    // La challenge non si risolve: si ricarica la pagina ogni 10 secondi.
    if (isChallenge(html) && Date.now() - lastReload > 10000) {
      lastReload = Date.now();
      try { await send('Page.reload', { ignoreCache: true }); } catch {}
    }
  }
  return html;
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  const url = line.trim();
  if (!url) continue;
  if (url === '__exit__') break;
  try {
    const html = await loadPage(url);
    process.stdout.write(`${JSON.stringify({ url, html })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ url, error: error.message })}\n`);
  }
}

shutdown(0);
