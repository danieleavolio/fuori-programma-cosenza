import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';

const port = 4387;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
let exited = false;
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });
server.on('exit', () => { exited = true; });

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, base], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file}: exit ${code}`)));
  });
}

try {
  let ready = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !exited) {
    // Wait for this process's listener, not an unrelated server on the same port.
    if (stripVTControlCharacters(output).includes(base)) {
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch { /* Server is still starting. */ }
    }
    await setTimeout(100);
  }
  if (!ready) throw new Error(`Preview non disponibile: ${output}`);
  await run('scripts/test_svelte.mjs');
  if (process.argv.includes('--browser')) await run('scripts/test_svelte_browser.mjs');
} finally {
  server.kill();
}
