import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Il bot pubblica dati grezzi: la stessa sala può annunciare un film con
// apostrofo tipografico (’) mentre un'altra lo elenca con l'apostrofo dritto
// ('). Senza questa normalizzazione nascono due schede: una con locandina e
// orari, l'altra vuota con "orari non ancora pubblicati".
//
// Il file normalizzato viene usato sia dal rendering SSR sia da app.js, che
// scarica /data/schedule.json nel browser.
export function titleToken(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[’'`´‘]/g, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Le sale pubblicano quasi sempre i titoli in MAIUSCOLO: nei risultati di
// ricerca e nelle schede si leggono male. Un titolo tutto maiuscolo diventa
// "Title Case" all'italiana (articoli e preposizioni minuscoli, salvo in testa
// o dopo ":" / " - " / "("); i titoli già scritti con le minuscole restano.
// Lo slug non cambia: slugify() lavora sul minuscolo.
const MINOR_WORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'e', 'o', 'ed', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul',
  'sullo', 'sulla', 'sui', 'sugli', 'sulle', 'col', 'coi', 'l', 'd', 'dell', 'nell', 'all', 'sull', 'dall',
  'of', 'the', 'and', 'an', 'to', 'on', 'at', 'for', 'or', 'vs',
]);
const ROMAN = /^(?:II|III|IV|VI|VII|VIII|IX|XI|XII)$/;

export function displayTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title || /\p{Ll}/u.test(title)) return title;
  return title.replace(/[\p{L}\p{N}]+/gu, (word, offset) => {
    const before = title.slice(0, offset);
    const after = title[offset + word.length] || '';
    const lower = word.toLocaleLowerCase('it');
    const capital = lower.charAt(0).toLocaleUpperCase('it') + lower.slice(1);
    if (ROMAN.test(word)) return word;
    if (word.length === 1 && after === '.') return word; // sigle come "V. O."
    const start = !before.trim() || /(?::|\s[-–]|\()\s*$/.test(before);
    if (/['’]$/.test(before)) return word.length === 1 ? lower : capital; // L'Alba, ma Lady's
    if (start) return capital;
    return MINOR_WORDS.has(lower) ? lower : capital;
  });
}

const showCount = (movie) => (movie.shows || []).reduce((total, group) => total + (group.shows || []).length, 0);

const yearsCompatible = (left, right) =>
  !left.year || !right.year || String(left.year) === String(right.year);

const uniquePush = (list, item, key) => {
  if (!list.some((existing) => key(existing) === key(item))) list.push(item);
};

function mergeShows(base, extra) {
  const shows = (base.shows || []).map((group) => ({ ...group, shows: [...(group.shows || [])] }));
  for (const group of extra.shows || []) {
    const key = `${group.date}|${group.venue}`;
    const target = shows.find((existing) => `${existing.date}|${existing.venue}` === key);
    if (!target) {
      shows.push({ ...group, shows: [...(group.shows || [])] });
      continue;
    }
    for (const show of group.shows || []) {
      uniquePush(target.shows, show, (item) => `${item.time}|${item.room || ''}|${item.url || ''}|${item.format || ''}`);
    }
  }
  return shows;
}

function mergeMovie(base, extra) {
  const merged = { ...base };
  for (const field of ['poster', 'url', 'duration', 'director', 'year', 'language', 'cast', 'trailer', 'synopsis', 'releaseDateIT']) {
    if (!merged[field] && extra[field]) merged[field] = extra[field];
  }
  merged.tags = [...new Set([...(base.tags || []), ...(extra.tags || [])])];
  merged.genres = [...new Set([...(base.genres || []), ...(extra.genres || [])])];
  merged.venueUrls = { ...(extra.venueUrls || {}), ...(base.venueUrls || {}) };
  merged.shows = mergeShows(base, extra);
  merged.announcedDates = [...(base.announcedDates || [])];
  for (const item of extra.announcedDates || []) {
    uniquePush(merged.announcedDates, item, (entry) => `${entry.date}|${entry.venue}`);
  }
  if (!merged.external && extra.external) merged.external = extra.external;
  const dates = [base.firstSeenAt, extra.firstSeenAt].filter(Boolean).sort();
  if (dates.length) merged.firstSeenAt = dates[0];
  return merged;
}

export function normalizeSchedule(schedule) {
  const source = Array.isArray(schedule.movies) ? schedule.movies : [];
  const clusters = [];
  for (const [index, movie] of source.entries()) {
    const token = titleToken(movie.title);
    const cluster = token
      ? [...clusters].reverse().find((item) => item.token === token
        && item.entries.every((entry) => yearsCompatible(entry.movie, movie)))
      : undefined;
    if (cluster) cluster.entries.push({ movie, index });
    else clusters.push({ token, entries: [{ movie, index }] });
  }
  const movies = clusters.map((cluster) => {
    if (cluster.entries.length === 1) return cluster.entries[0].movie;
    // La scheda con più spettacoli reali resta la principale: id, titolo e URL
    // non cambiano per chi ha già condiviso o salvato il film.
    const [primary, ...duplicates] = [...cluster.entries].sort((left, right) =>
      showCount(right.movie) - showCount(left.movie)
      || Number(Boolean(right.movie.poster)) - Number(Boolean(left.movie.poster))
      || left.index - right.index);
    return duplicates.reduce((merged, entry) => mergeMovie(merged, entry.movie), primary.movie);
  });
  return { ...schedule, movies };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'data/schedule.json');
  const original = JSON.parse(await readFile(file, 'utf8'));
  const merged = normalizeSchedule(original);
  const normalized = {
    ...merged,
    movies: merged.movies.map((movie) => ({ ...movie, title: displayTitle(movie.title) })),
    ...(Array.isArray(merged.comingSoon)
      ? { comingSoon: merged.comingSoon.map((item) => ({ ...item, title: displayTitle(item.title) })) }
      : {}),
  };
  const removed = (original.movies || []).length - normalized.movies.length;
  await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`);
  const skipped = normalized.movies.filter((movie) => showCount(movie) === 0).length;
  console.log(`Programmazione normalizzata: ${(normalized.movies || []).length} film (${removed} duplicati uniti, ${skipped} solo annunci).`);
}
