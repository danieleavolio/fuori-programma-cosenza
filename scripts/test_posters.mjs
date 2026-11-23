import assert from 'node:assert/strict';
import { curatedSourcesForMovie, posterFromSpaceHTML, selectPoster, spaceFilmPaths } from './poster_quality.mjs';

const choice = (width, height, external) => ({ image: { width, height }, external });
const thumbnail = { width: 450, height: 630 };
const sharpExternal = choice(1100, 1630, true);
const sharpCinema = choice(800, 1200, false);
assert.equal(selectPoster(thumbnail, [sharpExternal, sharpCinema]), sharpExternal);
assert.equal(selectPoster(sharpCinema.image, [sharpExternal]), sharpExternal, 'Confronta anche quando l’originale è già nitido');
assert.equal(selectPoster(thumbnail, [choice(2000, 1000, true), sharpCinema]), sharpCinema, 'Una foto orizzontale non è una locandina');
assert.equal(selectPoster(sharpCinema.image, [choice(600, 900, true)]), null, 'Non degradare la qualità per cambiare fonte');
assert.equal(selectPoster(thumbnail, [choice(420, 622, true)]), null, 'Una miniatura esterna non è un miglioramento');

const image = 'https://www.thespacecinema.it/-/media/the-space-cinema/schede-film/2026/scrooge.jpg?rev=abcdef';
const film = { filmName: { value: 'Scrooge: E gli spiriti del Natale' }, releaseDate: { dateValue: Date.parse('2026-11-12') },
  director: { value: 'Ti West' }, posterImage: { src: image } };
const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { layoutData: { sitecore: { context: { film } } } } }
})}</script>`;
const expected = { title: 'Scrooge e gli spiriti del Natale', year: '2026' };
assert.equal(posterFromSpaceHTML(html, expected, '2026-11-23'), image);
assert.equal(posterFromSpaceHTML(html, { ...expected, year: '1988' }, '2026-11-23'), null);
assert.equal(posterFromSpaceHTML(html, { ...expected, director: 'Regista diverso' }, '2026-11-23'), null);
assert.equal(posterFromSpaceHTML(html, { title: expected.title }, '2030-11-23'), null);
assert.deepEqual([...spaceFilmPaths('<loc>https://www.thespacecinema.it/film/scrooge</loc><loc>https://www.thespacecinema.it/altro</loc>')], ['/film/scrooge']);
const verified = [{ ...expected, announcementPosters: ['https://example.test/confirmed.jpg'] }];
assert.equal(curatedSourcesForMovie(verified, { title: expected.title }).length, 0);
assert.equal(curatedSourcesForMovie(verified, { title: expected.title }, verified[0].announcementPosters).length, 1);
assert.equal(curatedSourcesForMovie(verified, { ...expected, year: '1988' }, verified[0].announcementPosters).length, 0);
console.log('Locandine: confronto, qualità minima e identità del film verificati.');
