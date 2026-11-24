import { readFile, writeFile } from 'node:fs/promises';

// In produzione la programmazione arriva dal sito pubblicato dal bot: un deploy
// del solo codice non deve riportare online orari vecchi. Se la rete o il file
// non rispondono restano i dati già presenti nel repository.
const base = process.env.FP_PUBLISHED_BASE || 'https://danieleavolio.github.io/fuori-programma-cosenza/';
const dryRun = process.env.FP_PULL_DRY_RUN === '1' || process.argv.includes('--dry-run');

if (!process.env.VERCEL && !process.env.FP_PULL_PUBLISHED && !dryRun) {
  console.log('Programmazione: uso la copia nel repository (fuori da Vercel).');
  process.exit(0);
}

const files = [
  { path: 'data/schedule.json', valid: (data) => Array.isArray(data.movies) && data.movies.length > 0 && Array.isArray(data.venues) },
  { path: 'data/venues-info.json', valid: (data) => data && typeof data === 'object' && Object.keys(data).length > 0 },
  // Archivio dei film passati: lo aggiorna il bot anche quando il push su main non riesce.
  { path: 'data/film-archive.json', valid: (data) => data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0 },
];

for (const file of files) {
  const url = new URL(file.path, base);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!file.valid(data)) throw new Error('formato inatteso');
    // Durante il primo deploy il feed pubblicato può non avere ancora gli
    // annunci. Conserva solo questo campo, senza sostituire gli orari più nuovi.
    if (file.path === 'data/schedule.json' && !Object.hasOwn(data, 'comingSoon')) {
      const local = JSON.parse(await readFile(file.path, 'utf8'));
      if (Array.isArray(local.comingSoon)) data.comingSoon = local.comingSoon;
    }
    if (!dryRun) await writeFile(file.path, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Programmazione pubblicata: ${file.path} (${dryRun ? 'verifica' : 'aggiornato'})`);
  } catch (error) {
    console.warn(`Programmazione pubblicata non disponibile per ${file.path}: ${error.message}. Uso la copia nel repository.`);
  }
}
