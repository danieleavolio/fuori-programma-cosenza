import assert from 'node:assert/strict';
import { normalizeSchedule, titleToken } from './normalize_schedule.mjs';

const scheduled = {
  id: '2',
  title: "HUNGER GAMES L'ALBA SULLA MIETITURA",
  poster: 'https://cdn.example/hunger.jpg',
  duration: '3h 08m',
  year: '2026',
  shows: [{ date: '20/11/2026', venue: 'andromeda-river', shows: [{ time: '16:50' }, { time: '19:30' }] }],
  announcedDates: [],
  venueUrls: { 'andromeda-river': 'https://example/andromeda' },
};

const announced = {
  id: '14',
  title: 'Hunger Games: L’Alba sulla Mietitura',
  poster: '',
  year: '',
  shows: [],
  announcedDates: [
    { date: '20/11/2026', venue: 'cinema-teatro-italia' },
    { date: '21/11/2026', venue: 'cinema-teatro-italia' },
  ],
  venueUrls: {},
};

const original = {
  id: '13',
  title: "L'ESSERE AMATO (EL SER QUERIDO)",
  poster: 'https://cdn.example/amato.jpg',
  year: '2026',
  shows: [{ date: '20/11/2026', venue: 'unical', shows: [{ time: '18:00' }] }],
  announcedDates: [],
  venueUrls: {},
};

const duplicate = {
  id: '15',
  title: 'L’Essere Amato',
  poster: '',
  year: '',
  shows: [],
  announcedDates: [{ date: '21/11/2026', venue: 'unical' }],
  venueUrls: {},
};

const normalized = normalizeSchedule({ movies: [scheduled, announced, original, duplicate] });
assert.equal(normalized.movies.length, 2, 'I duplicati devono essere uniti');
const merged = normalized.movies.find((movie) => movie.id === '2');
assert.equal(merged.title, scheduled.title, 'Resta il titolo della scheda con orari');
assert.equal(merged.poster, scheduled.poster);
assert.equal(merged.shows[0].shows.length, 2, 'Gli spettacoli reali non si perdono');
assert.deepEqual(
  merged.announcedDates.map((item) => `${item.date}|${item.venue}`),
  ['20/11/2026|cinema-teatro-italia', '21/11/2026|cinema-teatro-italia'],
  'Le date annunciate passano alla scheda principale',
);
const amato = normalized.movies.find((movie) => movie.id === '13');
assert.equal(amato.title, original.title);
assert.equal(amato.announcedDates.length, 1);

const remake = normalizeSchedule({
  movies: [
    { title: 'DUNE', year: '1984', shows: [{ date: '20/11/2026', venue: 'garden', shows: [{ time: '18:00' }] }], announcedDates: [] },
    { title: 'DUNE', year: '2021', shows: [{ date: '20/11/2026', venue: 'garden', shows: [{ time: '21:00' }] }], announcedDates: [] },
  ],
});
assert.equal(remake.movies.length, 2, 'Film omonimi di anni diversi restano distinti');
assert.notEqual(titleToken('DUNE'), '');
console.log(JSON.stringify({ status: 'passed', merged: normalized.movies.length, remakes: remake.movies.length }));
