import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { updateArchive } from './update_archive.mjs';

// Ricostruisce data/film-archive.json dalla storia git di data/schedule.json:
// ogni versione committata viene applicata in ordine con la data del suo commit.
// Si usa una volta sola (o per riparare l'archivio); il resto lo fa update_archive.mjs.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const commits = git('log', '--reverse', '--format=%H %cI', '--', 'data/schedule.json')
  .trim().split('\n').filter(Boolean).map((line) => line.split(' '));

let archive = JSON.parse(await readFile('data/film-archive.json', 'utf8').catch(() => '{}'));
let applied = 0;
for (const [sha, date] of commits) {
  let schedule;
  try {
    schedule = JSON.parse(git('show', `${sha}:data/schedule.json`));
  } catch {
    continue;
  }
  if (!Array.isArray(schedule.movies)) continue;
  archive = updateArchive(archive, schedule, new Date(date).toISOString());
  applied += 1;
}
const current = JSON.parse(await readFile('data/schedule.json', 'utf8'));
archive = updateArchive(archive, current);
await writeFile('data/film-archive.json', `${JSON.stringify(archive, null, 2)}\n`);
console.log(`Archivio ricostruito da ${applied} versioni: ${Object.keys(archive).length} schede.`);
