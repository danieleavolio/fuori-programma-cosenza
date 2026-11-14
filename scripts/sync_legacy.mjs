import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = path.join(root, 'static', 'legacy');
const generated = spawnSync('python', ['scripts/build_calendars.py'], { cwd: root, stdio: 'inherit' });
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
