import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = path.join(root, 'static', 'legacy');

// Su Windows l'eseguibile si chiama python, sulle immagini di build (Linux, Vercel) spesso solo python3.
const python = ['python', 'python3'].find((candidate) => spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0);
if (!python) throw new Error('Python non trovato: serve per generare i calendari legacy');
const generated = spawnSync(python, ['scripts/build_calendars.py'], { cwd: root, stdio: 'inherit' });
if (generated.status !== 0) throw new Error('Generazione dei calendari legacy fallita');

await rm(legacy, { recursive: true, force: true });
await mkdir(legacy, { recursive: true });
for (const item of ['index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icons', 'calendars']) {
  await cp(path.join(root, item), path.join(legacy, item), { recursive: true });
}
await mkdir(path.join(legacy, 'data'), { recursive: true });
for (const item of ['schedule.json', 'venues-info.json']) {
  await cp(path.join(root, 'data', item), path.join(legacy, 'data', item));
}

// La home SvelteKit e' la stessa app: serviamo i suoi asset anche dalla radice,
// cosi' app.js, styles.css e i calendari restano un'unica copia.
const site = path.join(root, 'static');
for (const item of ['app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icons', 'calendars']) {
  await rm(path.join(site, item), { recursive: true, force: true });
  await cp(path.join(root, item), path.join(site, item), { recursive: true });
}
await mkdir(path.join(site, 'data'), { recursive: true });
for (const item of ['schedule.json', 'venues-info.json']) {
  await cp(path.join(root, 'data', item), path.join(site, 'data', item));
}
