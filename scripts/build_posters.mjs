import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { titleToken } from './normalize_schedule.mjs';
import { curatedSourcesForMovie, posterFromSpaceHTML, selectPoster, spaceFilmPaths } from './poster_quality.mjs';

const schedule = JSON.parse(await readFile('data/schedule.json', 'utf8'));
const curated = JSON.parse(await readFile('data/poster-sources.json', 'utf8'));
const ticketThumbnail = /^https:\/\/cdn\.18tickets\.net\/[^/]+\/uploads\/film\/playbill\/\d+\/standard_[a-f0-9-]+\.(?:jpe?g|png)$/i;
const gardenPoster = /^https:\/\/cdn\.cinemagarden\.net\/[^?#]+$/i;
const myMoviesFilm = /^https:\/\/www\.mymovies\.it\/film\/\d{4}\/[a-z0-9-]+\/$/i;
const myMoviesPoster = /^https:\/\/pad\.mymovies\.it\/filmclub\/\d{4}\/\d+\/\d+\/locandina[^/]*\.(?:jpe?g|png|webp)$/i;
const candidates = new Map();
const moviesByTitle = new Map();
const announcements = new Map();
for (const movie of schedule.movies) {
  const key = titleToken(movie.title);
  moviesByTitle.set(key, [...(moviesByTitle.get(key) || []), movie]);
}
for (const item of [...schedule.movies, ...(schedule.comingSoon || [])]) {
  const source = item.poster;
  if (!ticketThumbnail.test(source) && !gardenPoster.test(source)) continue;
  const matches = (moviesByTitle.get(titleToken(item.title)) || [])
    .filter(movie => !item.year || String(item.year) === String(movie.year));
  let unique = matches.length === 1 ? matches[0] : null;
  if (!matches.length && !item.year) {
    const key = titleToken(item.title);
    if (!announcements.has(key)) announcements.set(key, { title: item.title });
    unique = announcements.get(key);
  }
  if (!candidates.has(source)) candidates.set(source, new Set());
  candidates.get(source).add(unique);
}
const cinemaSourcesByFilm = new Map();
for (const [source, matches] of candidates) {
  if (matches.size !== 1) continue;
  const [movie] = matches;
  if (movie) cinemaSourcesByFilm.set(movie, [...(cinemaSourcesByFilm.get(movie) || []), source]);
}

const variants = {};
const maxBytes = 8 * 1024 * 1024;
const alternateTitles = new Set();
const imageCache = new Map();
const pageCache = new Map();
const alternativeCache = new Map();
const found = { space: 0, mymovies: 0 };
let spaceIndex;
await mkdir('static/posters', { recursive: true });

async function download(url, mime, limit) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok || ![mime].flat().some(type => response.headers.get('content-type')?.startsWith(type))
    || Number(response.headers.get('content-length')) > limit || !response.body) {
    await response.body?.cancel();
    return null;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function imageInfo(url) {
  if (!imageCache.has(url)) imageCache.set(url, (async () => {
    const bytes = await download(url, 'image/', maxBytes);
    if (!bytes) return null;
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    const { width, height } = await image.metadata();
    return width && height ? { image, width, height } : null;
  })().catch(() => null));
  return imageCache.get(url);
}

function posterFromMYmovies(movie) {
  const url = movie.external?.url;
  if (!myMoviesFilm.test(url)) return null;
  if (!pageCache.has(url)) pageCache.set(url, (async () => {
    const html = (await download(url, 'text/html', 2 * 1024 * 1024))?.toString();
    if (!html) return null;
    // Il tag Open Graph spesso è una foto di scena. Usa solo l'immagine
    // dichiarata come locandina nel Movie che corrisponde al titolo.
    for (const [, json] of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      let schema;
      try { schema = JSON.parse(json); } catch { continue; }
      if (schema?.['@type'] !== 'Movie' || titleToken(schema.name) !== titleToken(movie.title)) continue;
      for (const item of [schema.image].flat()) {
        if (myMoviesPoster.test(item?.url)) return item.url;
      }
    }
    return null;
  })().catch(() => null));
  return pageCache.get(url);
}

async function posterFromTheSpace(movie) {
  spaceIndex ??= download('https://www.thespacecinema.it/sitemap.xml', ['text/xml', 'application/xml'], 2 * 1024 * 1024)
    .then(bytes => spaceFilmPaths(bytes?.toString() || '')).catch(() => new Set());
  const path = `/film/${titleToken(movie.title).replaceAll(' ', '-')}`;
  if (!(await spaceIndex).has(path)) return null;
  const page = await download(`https://www.thespacecinema.it${path}`, 'text/html', 2 * 1024 * 1024).catch(() => null);
  return page && posterFromSpaceHTML(page.toString(), movie, schedule.updatedAt);
}

function alternateSources(movie) {
  if (!alternativeCache.has(movie)) alternativeCache.set(movie, (async () => {
    const approved = curatedSourcesForMovie(curated, movie, cinemaSourcesByFilm.get(movie));
    const [space, mymovies] = await Promise.all([posterFromTheSpace(movie), posterFromMYmovies(movie)]);
    if (space) found.space++;
    if (mymovies) found.mymovies++;
    return [...new Set([...approved.map(item => item.image), space, mymovies].filter(Boolean))];
  })());
  return alternativeCache.get(movie);
}

async function optimize([source, matches]) {
  try {
    const isTicket = ticketThumbnail.test(source);
    // La variante standard di 18Tickets è 450×630; l'originale non ha il prefisso.
    const current = isTicket ? { width: 450, height: 630 } : await imageInfo(source);
    const movie = matches.size === 1 ? [...matches][0] : null;
    const local = [...new Set([source, ...(cinemaSourcesByFilm.get(movie) || [])])].flatMap(url =>
      ticketThumbnail.test(url) ? [url.replace('/standard_', '/')] : url !== source ? [url] : []);
    const alternatives = movie ? await alternateSources(movie) : [];
    const options = await Promise.all([
      ...alternatives.map(async url => ({ image: await imageInfo(url), external: true })),
      ...local.map(async url => ({ image: await imageInfo(url), external: false }))
    ]);
    const best = selectPoster(current, options);
    if (!best) return;
    const bytes = await best.image.image.clone().autoOrient().resize({ width: 780, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 24);
    const path = `/posters/${hash}.webp`;
    await writeFile(`static${path}`, bytes);
    variants[source] = path;
    if (best.external && movie) alternateTitles.add(movie.title);
  } catch {
    // L'immagine pubblicata in programmazione resta sempre il fallback.
  }
}

const entries = [...candidates];
for (let index = 0; index < entries.length; index += 6) {
  await Promise.all(entries.slice(index, index + 6).map(optimize));
}
await writeFile('src/lib/server/posters.generated.json', JSON.stringify(variants));
console.log(`Locandine: ${Object.keys(variants).length}/${entries.length} migliorate. Fonti alternative: ${[...alternateTitles].sort().join(', ') || 'nessuna'}.`);
console.log(`Schede corrispondenti con locandina: The Space ${found.space}, MYmovies ${found.mymovies}.`);
