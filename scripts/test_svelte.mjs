import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { titleToken } from './normalize_schedule.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const get = async (path) => {
  const response = await fetch(new URL(path, base));
  return { response, text: await response.text() };
};

const home = await get('/');
assert.equal(home.response.status, 200);
assert.match(home.text, /<h1\b[^>]*id="page-title"[^>]*>Cinema a Cosenza e Rende<\/h1>/);
assert.match(home.text, /<title>Cinema a Cosenza e Rende: programmazione e orari \| Fuori programma<\/title>/);
assert.match(home.text, /<a class="today-cta" href="\/programmazione\/oggi">[\s\S]*?Oggi in sala/);
assert.doesNotMatch(home.text, /data-chip=|class="quick-chips/);
assert.equal([...home.text.matchAll(/class="venue-tile[^"]*" href="\/cinema\//g)].length, 5, 'Schede delle sale visibili senza JavaScript');
assert.doesNotMatch(home.text, /class="local-guide/);
assert.match(home.text, /<article class="movie-catalog-card/);
assert.match(home.text, /id="movies-grid"/);
assert.match(home.text, /src="\/app\.js\?v=[\w-]+"/);
assert.match(home.text, /rel="canonical"/);
assert.match(home.text, /property="og:title"/);
assert.match(home.text, /property="og:image" content="[^"]+\/og\/default\.png\?v=[a-f0-9]+"/);
assert.match(home.text, /property="og:image:width" content="1200"/);
// La home deve linkare le schede film: altrimenti i crawler le trovano solo
// tramite la sitemap e non ricevono autorita' dai link interni.
assert.match(home.text, /<h3 class="movie-title"[^>]*><a href="\/film\/[^"]+">/);
assert.match(home.text, /application\/ld\+json/);
assert.match(home.text, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(home.text, /rel="icon" href="\/favicon\.ico" sizes="16x16 32x32 48x48"/);
const favicon = await fetch(new URL('/favicon.ico', base));
assert.equal(favicon.status, 200);
assert.ok((await favicon.arrayBuffer()).byteLength > 1000, 'favicon.ico vuota');
assert.doesNotMatch(home.text, /href="\/legacy\//);

// La stessa copia alimenta SSR e app.js: non devono esserci schede doppie
// nate da apostrofi tipografici o titoli con sottotitolo tra parentesi.
const schedule = JSON.parse((await get('/data/schedule.json')).text);
assert.ok(Array.isArray(schedule.movies) && schedule.movies.length);
const seenTitles = [];
for (const movie of schedule.movies) {
  const token = titleToken(movie.title);
  const duplicate = seenTitles.find((item) => item.token === token
    && (!item.year || !movie.year || String(item.year) === String(movie.year)));
  assert.equal(duplicate, undefined, `Film duplicato in programmazione: ${movie.title}`);
  seenTitles.push({ token, year: movie.year });
}

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.response.status, 200);
assert.match(sitemap.text, /<urlset/);
assert.match(sitemap.text, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
assert.match(sitemap.text, /<image:image><image:loc>https?:\/\/[^<]+<\/image:loc>/);
for (const path of ['/programmazione/oggi', '/programmazione/stasera', '/programmazione/weekend', '/prossimamente', '/maratona']) {
  assert.match(sitemap.text, new RegExp(`<loc>[^<]*${path}</loc>`), path);
}
const filmSlug = sitemap.text.match(/<loc>[^<]*?(\/film\/[^<]+)<\/loc>/)?.[1];
const cinemaSlug = sitemap.text.match(/<loc>[^<]*?(\/cinema\/[^<]+)<\/loc>/)?.[1];
assert.ok(filmSlug);
assert.ok(cinemaSlug);

for (const path of [filmSlug, cinemaSlug, '/programmazione/oggi', '/programmazione/stasera', '/programmazione/weekend', '/prossimamente', '/maratona']) {
  const page = await get(path);
  assert.equal(page.response.status, 200, `${path} should render`);
  assert.match(page.text, /rel="canonical"/);
  assert.match(page.text, /application\/ld\+json/);
  assert.match(page.text, /<h1/);
  assert.doesNotMatch(page.text, /class="period-nav/);
  for (const match of page.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const schema = JSON.parse(match[1]);
    assert.equal(schema['@context'], 'https://schema.org');
  }
}

// Oggi deve includere tutti gli spettacoli con un orario, anche quelli già iniziati.
const today = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric'
}).format(new Date());
const todayPage = await get('/programmazione/oggi');
assert.match(todayPage.text, /<title>Cinema oggi a Cosenza e Rende: film e orari \| Fuori programma<\/title>/);
const todayEvents = JSON.parse(todayPage.text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).itemListElement;
const todayShows = schedule.movies.flatMap(movie => movie.shows)
  .filter(group => group.date === today && schedule.venues.some(venue => venue.id === group.venue))
  .flatMap(group => group.shows);
assert.equal(todayEvents.length, todayShows.length, 'Tutti gli spettacoli di oggi');
assert.doesNotMatch(todayPage.text, /<a [^>]*>[^<]*Già iniziato/);

// Stasera resta raggiungibile e contiene solo la fascia serale.
const stasera = await get('/programmazione/stasera');
for (const match of stasera.text.matchAll(/"startDate":"[^T]+T(\d{2}:\d{2}):/g)) {
  assert.ok(match[1] >= '20:00', `spettacolo serale ${match[1]}`);
}

// Percorso di navigazione: visibile e strutturato su film e cinema.
const filmPage = await get(filmSlug);
assert.match(filmPage.text, /<nav class="breadcrumb[^"]*"/);
assert.match(filmPage.text, /"@type":"BreadcrumbList"/);
const cinemaPage = await get(cinemaSlug);
assert.match(cinemaPage.text, /<nav class="breadcrumb[^"]*"/);
assert.match(cinemaPage.text, /"@type":"BreadcrumbList"/);
const tieri = await get('/cinema/cinema-teatro-italia');
assert.match(tieri.text, /<title>Cinema Italia Tieri a Cosenza: programmazione e orari \| Fuori programma<\/title>/);
const todayISO = today.split('/').reverse().join('-');
for (const date of tieri.text.matchAll(/<time datetime="(\d{4}-\d\d-\d\d)"/g)) {
  assert.ok(date[1] >= todayISO, 'La scheda cinema mostra solo date da oggi in poi');
}
if (tieri.text.includes('class="movie-catalog-card"')) {
  assert.match(tieri.text, /class="poster-link[^>]*href="\/film\//);
  assert.match(tieri.text, />Griglia<\/button>/);
  assert.match(tieri.text, />Lista<\/button>/);
}
const prossimamente = await get('/prossimamente');
assert.match(prossimamente.text, /<h1\b[^>]*id="page-title"[^>]*>Prossimamente<\/h1>/);
assert.match(prossimamente.text, /"@type":"ItemList"/);
const poster = `${home.text}${prossimamente.text}`.match(/src="(\/posters\/[a-f0-9]+\.webp)"/)?.[1];
if (['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) {
  const variants = JSON.parse(await readFile(new URL('../src/lib/server/posters.generated.json', import.meta.url), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return '{}';
  }));
  if (Object.keys(variants).length) assert.ok(poster, 'La build deve usare le locandine WebP generate');
  const announced = (schedule.comingSoon || []).map(item => variants[item.poster]).filter(Boolean);
  for (const src of new Set(announced)) {
    assert.ok(prossimamente.text.includes(`src="${src}"`), `Locandina ottimizzata mancante in Prossimamente: ${src}`);
  }
}
if (poster) {
  const image = await fetch(new URL(poster, base));
  assert.equal(image.status, 200, 'Locandina ottimizzata disponibile');
  assert.match(image.headers.get('content-type'), /^image\/webp/);
}

const sitemapFilm = sitemap.text.match(new RegExp(filmSlug.replaceAll('/', '\\/')));
assert.ok(sitemapFilm);
const robots = await get('/robots.txt');
assert.equal(robots.response.status, 200);
assert.match(robots.text, /Sitemap:/);

const worker = await get('/sw.js');
assert.equal(worker.response.status, 200);
assert.match(worker.text, /SHELL_ASSETS/);
const manifest = await get('/manifest.webmanifest');
assert.equal(manifest.response.status, 200);
assert.equal(JSON.parse(manifest.text).start_url, './');

const filmPageOg = filmPage.text;
assert.match(filmPageOg, /property="og:image" content="[^"]+\/og\/[a-z0-9-]+\.(jpg|png)\?v=[a-f0-9]+"/);
assert.match(filmPageOg, /name="twitter:image"/);
assert.match(filmPageOg, /property="og:image:height" content="630"/);
const icsPath = filmPageOg.match(/href="(\/evento\.ics\?[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
assert.ok(icsPath);
const event = await get(icsPath);
assert.equal(event.response.status, 200);
assert.match(event.response.headers.get('content-type'), /text\/calendar/);
assert.match(event.text, /BEGIN:VCALENDAR/);
assert.match(event.text, /TZID:Europe\/Rome/);
assert.match(event.text, /BEGIN:VALARM/);
assert.match(event.text, /END:VCALENDAR/);
const eventUid = event.text.match(/^UID:(.+)$/m)?.[1];
assert.ok(eventUid);
const eventAgain = await get(icsPath);
assert.equal(eventAgain.text.match(/^UID:(.+)$/m)?.[1], eventUid);

const legacy = await get('/legacy/index.html');
assert.equal(legacy.response.status, 200);
assert.match(legacy.text, /id="legacy-today">Oggi in sala/);
assert.doesNotMatch(legacy.text, /data-chip=|class="quick-chips/);
assert.match(legacy.text, /Per Film/);
const legacyRoot = await fetch(new URL('/legacy/?view=movies', base), { redirect: 'manual' });
assert.ok([200, 307, 308].includes(legacyRoot.status));
const legacyFinal = await get('/legacy/?view=movies');
assert.equal(legacyFinal.response.status, 200);
assert.match(legacyFinal.text, /Per Film/);
const invalid = await get('/evento.ics?title=x&venue=y&date=2026-99-99&time=88%3A00');
assert.equal(invalid.response.status, 400);

const winter = await get('/evento.ics?title=Test&venue=Test&date=2027-01-05&time=09%3A00');
assert.equal(winter.response.status, 200);
assert.match(winter.text, /DTSTART;TZID=Europe\/Rome:20270105T090000/);
for (const date of ['2027-02-29', '2026-00-12', '2026-13-01']) {
  const invalidDate = await get(`/evento.ics?title=Test&venue=Test&date=${date}&time=12%3A00`);
  assert.equal(invalidDate.response.status, 400, date);
}
const leap = await get('/evento.ics?title=Test&venue=Test&date=2028-02-29&time=12%3A00');
assert.equal(leap.response.status, 200);
assert.match(leap.text, /DTSTART;TZID=Europe\/Rome:20280229T120000/);
const safe = await get('/evento.ics?title=Test%0DEND%3AVEVENT&venue=Test&date=2027-01-05&time=09%3A00');
assert.equal((safe.text.match(/^END:VEVENT\r?$/gm) || []).length, 1);

const marathon = await get('/maratona');
assert.match(marathon.text, /Seleziona almeno due film/);
const marathonDay = marathon.text.match(/name="giorno" value="(\d{4}-\d{2}-\d{2})"[^>]*checked/)?.[1];
const marathonFilms = [...marathon.text.matchAll(/name="film" value="([^"]+)"/g)].map((match) => match[1]);
if (marathonDay && marathonFilms.length >= 2) {
  const query = new URLSearchParams([['giorno', marathonDay], ['film', marathonFilms[0]], ['film', marathonFilms[1]], ['viaggio', '15']]);
  const planned = await get(`/maratona?${query}`);
  assert.equal(planned.response.status, 200);
  assert.match(planned.text, /Puoi vederli tutti|non ci stanno|non si incastrano/);
  assert.match(planned.text, /<link rel="canonical" href="[^"?]*\/maratona"/);
}

const calendar = await get('/calendario');
assert.equal(calendar.response.status, 200);
assert.match(calendar.text, /webcal:/);
assert.match(calendar.text, /Google Calendar/);
assert.match(calendar.text, /https:\/\/danieleavolio.github.io\/fuori-programma-cosenza\/calendars\/all.ics/);
const subset = await get('/calendario?cinema=garden&cinema=citrigno');
assert.equal(subset.response.status, 200);
assert.match(subset.text, /calendars\/citrigno_garden.ics/);
assert.doesNotMatch(subset.text, /calendars\/all.ics/);
const unknown = await get('/calendario?cinema=unknown');
assert.match(unknown.text, /Nessun cinema riconosciuto/);
assert.doesNotMatch(unknown.text, /href="webcal:/);

for (const path of ['/film/inesistente', '/cinema/inesistente', '/programmazione/inesistente']) {
  assert.equal((await get(path)).response.status, 404, path);
}

console.log(JSON.stringify({ status: 'passed', homeMovies: (home.text.match(/class="movie-catalog-card/g) || []).length, sampleFilm: filmSlug, calendar: 'all/subset/invalid', eventDates: 'winter/leap/invalid' }));
