// Scarica una pagina con Chrome headless e ne stampa l'HTML su stdout.
// Serve per le fonti che rispondono con una challenge anti-bot in JavaScript:
// il browser esegue la challenge e la pagina reale viene servita.
//
// Uso: node scripts/browser_fetch.mjs <url> [timeoutMs]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const timeoutMs = Number(process.argv[3] || 45000);
if (!url) {
  console.error('url mancante');
  process.exit(2);
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function spawnChrome(port, profileDir) {
  for (const binary of CHROME_CANDIDATES) {
    try {
      const child = spawn(binary, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--window-size=1440,2400',
        'about:blank',
      ], { stdio: 'ignore' });
      return child;
    } catch (error) {
      console.error(`browser non disponibile (${binary}): ${error.message}`);
    }
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

const port = 9300 + Math.floor(Math.random() * 400);
const profileDir = mkdtempSync(join(tmpdir(), `fp-chrome-${port}-`));
const chrome = spawnChrome(port, profileDir);

try {
  const target = await waitForTarget(port);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let messageId = 0;
  const pending = new Map();

  const send = (method, params = {}) => new Promise((resolve, reject) => {
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
  await send('Page.navigate', { url });

  const deadline = Date.now() + timeoutMs;
  let html = '';
  while (Date.now() < deadline) {
    await sleep(1000);
    const result = await send('Runtime.evaluate', {
      expression: 'document.documentElement ? document.documentElement.outerHTML : ""',
      returnByValue: true,
    });
    html = result.result.value || '';
    if (html.includes('movie--preview') || html.includes('inner-film') || html.includes('</html>')) {
      // La challenge WAF si risolve in pochi secondi: aspetta che la pagina sia stabile.
      await sleep(1500);
      const again = await send('Runtime.evaluate', {
        expression: 'document.documentElement ? document.documentElement.outerHTML : ""',
        returnByValue: true,
      });
      html = again.result.value || html;
      if (html.includes('movie--preview') || html.includes('inner-film')) break;
    }
  }

  process.stdout.write(html);
  socket.close();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (chrome) chrome.kill();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  process.exit(process.exitCode || 0);
}
