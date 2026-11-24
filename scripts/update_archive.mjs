import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayTitle, normalizeSchedule } from './normalize_schedule.mjs';

// Archivio dei film passati sul sito (data/film-archive.json).
// Serve a due cose:
// - le schede dei film usciti dalle sale rispondono 200 con «Non più in sala»
//   invece di 404 (e 410 dopo sei mesi), così i link condivisi non si rompono;
// - la sitemap usa per ogni scheda la data dell'ultima modifica reale
//   (changedAt), non l'ora dell'ultimo aggiornamento di tutto il sito.
// Lo aggiornano il bot (workflow update-schedule) e la build (archive:update).

// Identica a slugify() in src/lib/server/data.ts: le chiavi sono gli slug delle schede.
export function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const filmSlug = (movie) => `${slugify(movie.title)}-${movie.year || movie.id}`;

const isoDate = (value) => {
  const [day, month, year] = String(value || '').split('/');
  return year && month && day ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '';
};

function programming(movie) {
  const items = new Map();
  for (const item of movie.announcedDates || []) items.set(`${item.date}|${item.venue}`, { date: isoDate(item.date), venue: item.venue, times: [] });
  for (const group of movie.shows || []) {
    items.set(`${group.date}|${group.venue}`, {
      date: isoDate(group.date), venue: group.venue,
      times: (group.shows || []).map((show) => show.time).sort(),
    });
  }
  return [...items.values()].filter((item) => item.date).sort((a, b) => `${a.date}${a.venue}`.localeCompare(`${b.date}${b.venue}`));
}

const FIELDS = ['id', 'title', 'year', 'poster', 'director', 'duration', 'genres', 'synopsis'];

/** Aggiunge o aggiorna nell'archivio i film della programmazione. Non rimuove nulla. */
export function updateArchive(archive, schedule, now = new Date().toISOString()) {
  const result = { ...archive };
  const { movies } = normalizeSchedule(schedule);
  for (const raw of movies) {
    if (!raw.title) continue;
    const movie = { ...raw, title: displayTitle(raw.title) };
    const key = filmSlug(movie);
    const plan = programming(movie);
    const previous = result[key] || {};
    const details = Object.fromEntries(FIELDS.filter((field) => movie[field] && (!Array.isArray(movie[field]) || movie[field].length))
      .map((field) => [field, movie[field]]));
    const hash = createHash('sha1').update(JSON.stringify({ details, plan })).digest('hex').slice(0, 16);
    const dates = plan.map((item) => item.date);
    // Le date passate escono dal feed: l'archivio conserva la prima e l'ultima mai viste.
    const firstDate = [previous.firstDate, dates[0]].filter(Boolean).sort()[0] || '';
    const lastDate = [previous.lastDate, dates.at(-1)].filter(Boolean).sort().at(-1) || '';
    const venues = [...new Set([...(previous.venues || []), ...plan.map((item) => item.venue)])].sort();
    result[key] = {
      ...previous,
      ...details,
      firstDate, lastDate, venues,
      firstSeenAt: previous.firstSeenAt || now,
      changedAt: previous.hash === hash ? previous.changedAt || now : now,
      hash,
    };
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const scheduleFile = path.join(root, 'data/schedule.json');
  const archiveFile = path.join(root, 'data/film-archive.json');
  const schedule = JSON.parse(await readFile(scheduleFile, 'utf8'));
  const archive = JSON.parse(await readFile(archiveFile, 'utf8').catch(() => '{}'));
  const updated = updateArchive(archive, schedule);
  const changed = Object.keys(updated).filter((key) => updated[key].hash !== archive[key]?.hash).length;
  await writeFile(archiveFile, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`Archivio film: ${Object.keys(updated).length} schede, ${changed} aggiornate.`);
}
