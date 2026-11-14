import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const get = async (path) => {
  const response = await fetch(new URL(path, base));
  return { response, text: await response.text() };
};

const home = await get('/');
assert.equal(home.response.status, 200);
assert.match(home.text, /<h1 id="page-title">Programmazione cinema<\/h1>/);
assert.match(home.text, /<article class="movie-catalog-card/);
assert.match(home.text, /id="movies-grid"/);
assert.match(home.text, /src="\/app\.js"/);
assert.match(home.text, /rel="canonical"/);
assert.match(home.text, /property="og:title"/);
assert.match(home.text, /application\/ld\+json/);
assert.doesNotMatch(home.text, /href="\/legacy\//);

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.response.status, 200);
assert.match(sitemap.text, /<urlset/);
const filmSlug = sitemap.text.match(/<loc>[^<]*?(\/film\/[^<]+)<\/loc>/)?.[1];
const cinemaSlug = sitemap.text.match(/<loc>[^<]*?(\/cinema\/[^<]+)<\/loc>/)?.[1];
assert.ok(filmSlug);
assert.ok(cinemaSlug);

for (const path of [filmSlug, cinemaSlug, '/programmazione/oggi', '/programmazione/weekend']) {
  const page = await get(path);
  assert.equal(page.response.status, 200, `${path} should render`);
  assert.match(page.text, /rel="canonical"/);
  assert.match(page.text, /application\/ld\+json/);
  assert.match(page.text, /<h1/);
  for (const match of page.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const schema = JSON.parse(match[1]);
    assert.equal(schema['@context'], 'https://schema.org');
  }
}

const sitemapFilm = sitemap.text.match(new RegExp(filmSlug.replaceAll('/', '\\/')));
assert.ok(sitemapFilm);
const robots = await get('/robots.txt');
assert.equal(robots.response.status, 200);
assert.match(robots.text, /Sitemap:/);

const filmPage = await get(filmSlug);
const icsPath = filmPage.text.match(/href="(\/evento\.ics\?[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
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
