const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// DOM Elements
const moviesGrid = $('#movies-grid');
const filmList = $('#film-list');
const controlsPerFilm = $('#controls-per-film');
const controlsPerDay = $('#controls-per-day');
const searchInput = $('#search');
const venueFilter = $('#venue-filter');
const genreFilter = $('#genre-filter');
const daysNavStrip = $('#days-nav-strip');
const resultSummary = $('#result-summary');
const updatedAtEl = $('#updated-at');
const favToggleBtn = $('#fav-toggle-btn');
const favCountEl = $('#fav-count');
const chipFavCountEl = $('#chip-fav-count');
const toastEl = $('#toast');
const emptyState = $('#empty-state');
const airingNowSection = $('#airing-now');
const airingNowBody = $('#airing-now-body');
const airingNowStatus = $('#airing-now-status');
const requiredVenues = ['andromeda-river', 'citrigno', 'cinema-teatro-italia', 'unical', 'garden'];
let venueInfo = {};

// State
let scheduleData = { venues: [], movies: [], updatedAt: '' };
let currentView = 'movies'; // 'movies' | 'schedule'
let activeChip = 'all';
let showPastShowsToday = false; // 'all' | 'today' | 'favorites'
let selectedDate = '';
let movieLayout = 'grid';
let dayLayout = 'grid';
const expandedMovies = new Set();
const cardOpeners = new WeakMap();
let favorites = loadFavorites();
const sortModes = new Set(['release', 'added', 'next', 'rating', 'title']);
let moviesSort = readStore('fp_movies_sort', 'release');
let scheduleSort = readStore('fp_schedule_sort', 'next');
if (!sortModes.has(moviesSort)) moviesSort = 'release';
if (!sortModes.has(scheduleSort)) scheduleSort = 'next';
const storedVenues = readStore('fp_preferred_venues', []);
const preferredVenues = new Set(Array.isArray(storedVenues) ? storedVenues.filter((id) => requiredVenues.includes(id)) : []);

// Le transizioni di vista animano lo spostamento delle card invece di farle
// saltare: è quello che rende fluida l'apertura di una scheda.
function withViewTransition(update) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduced) {
    update();
    return null;
  }
  return document.startViewTransition(update);
}

// --- Date & String Utilities ---
const italianDate = (date) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace('.', '');
const italianFullDate = (date) => new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

const parseDate = (value) => {
  if (!value) return new Date();
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
};

const getTodayString = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const dateString = (date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

const isPastDate = (dateStr) => {
  const [day, month, year] = dateStr.split('/').map(Number);
  if (!year || !month || !day) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(year, month - 1, day) < today;
};

const formatDayLabel = (dateStr) => {
  if (dateStr === getTodayString()) {
    return 'Oggi';
  }
  return italianDate(parseDate(dateStr));
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char]);

const cleanDuration = (raw) => {
  if (!raw) return '';
  return String(raw).replace(/H/i, 'h ').replace(/['’]/g, 'm').replace(/\s+/g, ' ').trim();
};

// "1h 46m" -> 106, "" -> 0. La distinzione con durationMinutes() serve dove
// la durata manca davvero e non va inventata (fine proiezione, banner).
const parseDurationMinutes = (raw) => {
  const text = String(raw || '').toLocaleLowerCase('it');
  const hours = Number((text.match(/(\d+)\s*h/) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+)\s*m/) || [])[1] || 0);
  return hours * 60 + minutes;
};

const formatDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ') || '0m';
};

const wallClockDate = (dateStr, timeStr) => {
  const [day, month, year] = String(dateStr || '').split('/').map(Number);
  const [hours, minutes] = String(timeStr || '').split(':').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

const roomLabel = (room) => room && /^sala\b/i.test(room) ? room : `Sala ${room}`;

// --- Storage & Favorites ---
function loadFavorites() {
  try {
    const raw = localStorage.getItem('fp_favorites');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem('fp_favorites', JSON.stringify([...favorites]));
  } catch (e) {}
  updateFavoritesBadge();
}

function updateFavoritesBadge() {
  const count = favorites.size;
  if (favCountEl) favCountEl.textContent = count;
  if (chipFavCountEl) chipFavCountEl.textContent = count;
  if (favToggleBtn) favToggleBtn.classList.toggle('has-favorites', count > 0);
}

// --- Novità nei film salvati ---
// Ogni volta che il sito viene aggiornato si confrontano gli orari noti con
// quelli pubblicati: gli spettacoli aggiunti diventano un avviso in home.
const FAV_SNAPSHOT_KEY = 'fp_fav_snapshot_v1';
const FAV_UPDATES_KEY = 'fp_fav_updates_v1';

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function showtimeFingerprint(movie) {
  const entries = [];
  for (const group of movie?.shows || []) {
    for (const entry of group.shows || []) {
      entries.push(`${group.date}|${group.venue}|${entry.time}`);
    }
  }
  return [...new Set(entries)].sort();
}

function captureFavoriteSnapshot(movieId) {
  const movie = scheduleData.movies.find((item) => item.id === movieId);
  if (!movie) return;
  const snapshot = readStore(FAV_SNAPSHOT_KEY, {});
  snapshot[movieId] = showtimeFingerprint(movie);
  writeStore(FAV_SNAPSHOT_KEY, snapshot);
}

function forgetFavoriteSnapshot(movieId) {
  const snapshot = readStore(FAV_SNAPSHOT_KEY, {});
  if (movieId in snapshot) {
    delete snapshot[movieId];
    writeStore(FAV_SNAPSHOT_KEY, snapshot);
  }
  const pending = readStore(FAV_UPDATES_KEY, { films: [], total: 0 });
  const remaining = pending.films.filter((film) => film.id !== movieId);
  if (remaining.length !== pending.films.length) {
    pending.films = remaining;
    pending.total = remaining.reduce((sum, film) => sum + film.added, 0);
    writeStore(FAV_UPDATES_KEY, pending);
    renderSavedUpdates();
  }
}

function clearSavedUpdates() {
  writeStore(FAV_UPDATES_KEY, { films: [], total: 0 });
  renderSavedUpdates();
}

function detectFavoriteUpdates() {
  const snapshot = readStore(FAV_SNAPSHOT_KEY, {});
  const pending = readStore(FAV_UPDATES_KEY, { films: [], total: 0 });
  const savedIds = new Set();

  for (const movie of scheduleData.movies || []) {
    if (!favorites.has(movie.id)) continue;
    savedIds.add(movie.id);

    const known = snapshot[movie.id];
    const current = showtimeFingerprint(movie);
    if (Array.isArray(known)) {
      const knownSet = new Set(known);
      const added = current.filter((key) => !knownSet.has(key)).length;
      if (added > 0) {
        const existing = pending.films.find((film) => film.id === movie.id);
        if (existing) existing.added += added;
        else pending.films.push({ id: movie.id, title: movie.title, added });
      }
    }
    snapshot[movie.id] = current;
  }

  // Un film rimosso dai salvati non deve lasciare avvisi orfani.
  for (const movieId of Object.keys(snapshot)) {
    if (!savedIds.has(movieId)) delete snapshot[movieId];
  }
  pending.films = pending.films.filter((film) => savedIds.has(film.id));
  pending.total = pending.films.reduce((sum, film) => sum + film.added, 0);

  writeStore(FAV_SNAPSHOT_KEY, snapshot);
  writeStore(FAV_UPDATES_KEY, pending);
  renderSavedUpdates();
}

function renderSavedUpdates() {
  const section = $('#saved-updates');
  if (!section) return;
  const pending = readStore(FAV_UPDATES_KEY, { films: [], total: 0 });
  const films = pending.films.filter((film) => favorites.has(film.id));

  if (!films.length || !pending.total) {
    section.hidden = true;
    return;
  }

  const title = films.length === 1
    ? `${films[0].title} ha nuovi orari`
    : `${films.length} film salvati hanno nuovi orari`;
  const names = films.map((film) => film.title).join(', ');
  const detail = films.length === 1
    ? `${pending.total} ${pending.total === 1 ? 'spettacolo aggiunto' : 'spettacoli aggiunti'} in programmazione.`
    : `${pending.total} spettacoli aggiunti per ${names}.`;

  $('#saved-updates-title').textContent = title;
  $('#saved-updates-text').textContent = detail;
  section.hidden = false;
}

// --- Toast & Share ---
function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add('visible');
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    toastEl.classList.remove('visible');
    setTimeout(() => { toastEl.hidden = true; }, 250);
  }, 2200);
}

function renderShareMenu(movie) {
  return `
    <button class="btn-share-icon" type="button" title="Condividi film" aria-label="Condividi ${escapeHtml(movie.title)} con locandina e orari" data-share-film="${escapeHtml(movie.id)}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    </button>
  `;
}

function formatFilmShareMessage(movie) {
  const lines = [`*Film: ${movie.title}*`, '', '*Dove e quando?*'];
  const venuesMap = Object.fromEntries(scheduleData.venues.map((venue) => [venue.id, venue]));
  const showsByDate = new Map();

  for (const venueDay of movie.shows) {
    if (!showsByDate.has(venueDay.date)) showsByDate.set(venueDay.date, new Map());
    const showsByVenue = showsByDate.get(venueDay.date);
    const venueName = venuesMap[venueDay.venue]?.name || venueDay.venue;
    if (!showsByVenue.has(venueName)) showsByVenue.set(venueName, new Set());
    for (const show of venueDay.shows) {
      showsByVenue.get(venueName).add(show.time);
    }
  }

  const sortedDates = [...showsByDate.keys()].sort((a, b) => parseDate(a) - parseDate(b));
  for (const date of sortedDates) {
    lines.push('', `> ${italianFullDate(parseDate(date))}`);
    for (const [venueName, times] of showsByDate.get(date)) {
      const formattedTimes = [...times].map((time) => `\`\`\`${time}\`\`\``).join(' | ');
      lines.push(`* ${venueName}: ${formattedTimes}`);
    }
  }

  lines.push('', movie.url);
  return lines.join('\n');
}

async function getPosterFile(movie) {
  if (!movie.poster) throw new Error('Locandina non disponibile');
  const response = await fetch(movie.poster);
  if (!response.ok) throw new Error(`Download locandina non riuscito (${response.status})`);
  const blob = await response.blob();
  const extension = blob.type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `${movie.title.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '')}.${extension}`, { type: blob.type || 'image/jpeg' });
}

async function shareFilmPoster(movie) {
  const text = formatFilmShareMessage(movie);
  try {
    if (navigator.share && navigator.canShare) {
      const file = await getPosterFile(movie);
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: movie.title, text, files: [file] });
        return;
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: movie.title, text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  showToast(await copyToClipboard(text) ? 'Film e orari copiati negli appunti' : 'Condivisione non disponibile in questo browser');
}

// ==========================================
// MENU ORARIO: evento, condivisione, calendario
// ==========================================
const showtimeMenu = $('#showtime-menu');
const showtimeMenuTime = $('#showtime-menu-time');
const showtimeMenuMeta = $('#showtime-menu-meta');
const utf8Encoder = new TextEncoder();
let activeShowtime = null;
let activeShowtimeButton = null;

const pad2 = (value) => String(value).padStart(2, '0');

// "1h 54m" -> 114. Senza durata si assume un film medio.
function durationMinutes(raw) {
  const total = parseDurationMinutes(raw);
  return total > 0 ? total : 110;
}

const timeLabel = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

// Data e ora "da parete" nel fuso italiano: il calendario le interpreta con
// il parametro ctz, senza conversioni di fuso lato browser.
function calendarDateTime(dateStr, timeStr, offsetMinutes = 0) {
  const [day, month, year] = String(dateStr || '').split('/').map(Number);
  const [hours, minutes] = String(timeStr || '').split(':').map(Number);
  const value = new Date(year || 1970, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
  value.setMinutes(value.getMinutes() + offsetMinutes);
  return `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}T${pad2(value.getHours())}${pad2(value.getMinutes())}00`;
}

function icsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Le righe iCalendar non possono superare 75 ottetti.
function icsFold(line) {
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = utf8Encoder.encode(char).length;
    if (bytes + size > 73) {
      parts.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join('\r\n');
}

const ICS_TIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Rome',
  'X-LIC-LOCATION:Europe/Rome',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function icsStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsUid(event) {
  const seed = `${event.date}-${event.time}-${event.venue}-${event.room || ''}-${event.title}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${seed}@fuori-programma-cosenza`;
}

function icsEventLines(event, { alarm = true } = {}) {
  const knownDuration = parseDurationMinutes(event.duration);
  const minutes = durationMinutes(event.duration);
  const start = calendarDateTime(event.date, event.time);
  const venueLine = `${event.venue}${event.room ? ` (${event.room})` : ''}`;
  const location = [venueLine, event.location].filter(Boolean).join(', ');
  const description = event.description || [
    `Film: ${event.title}`,
    `Cinema: ${event.venue}${event.location ? ` — ${event.location}` : ''}`,
    event.room ? `Sala: ${event.room}` : '',
    `Inizio: ${event.date} alle ${event.time}`,
    knownDuration ? `Durata: ${minutes} minuti; fine indicativa, escluse pubblicità e intervallo.` : 'Durata non disponibile; fine dell’evento indicativa (110 minuti).',
    event.url ? `Biglietti: ${event.url}` : '',
    'Programmazione: Fuori programma Cosenza',
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VEVENT',
    `UID:${icsUid(event)}`,
    `DTSTAMP:${icsStamp()}`,
    `DTSTART;TZID=Europe/Rome:${start}`,
    `DURATION:PT${minutes}M`,
    `SUMMARY:${icsText(`${event.title} — ${event.venue}`)}`,
    `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(event.url ? [`URL:${event.url}`] : []),
    'CATEGORIES:Cinema',
    'STATUS:CONFIRMED',
  ];

  if (alarm) {
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT45M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`${event.title} tra 45 minuti`)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

function buildCalendarDocument(events, { name = 'Fuori programma Cosenza', alarm = true } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fuori Programma Cosenza//Programmazione cinema//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    'X-WR-TIMEZONE:Europe/Rome',
    ...ICS_TIMEZONE,
    ...events.flatMap((event) => icsEventLines(event, { alarm })),
    'END:VCALENDAR',
  ];
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

function buildCalendarEvent(event) {
  return buildCalendarDocument([{
    title: event.eventTitle,
    venue: event.eventVenue,
    location: event.eventLocation,
    room: event.eventRoom,
    date: event.eventDate,
    time: event.eventTime,
    duration: event.eventDuration,
    url: event.eventUrl,
  }], { name: `${event.eventTitle} — ${event.eventVenue}`, alarm: true });
}

function calendarFileName(event) {
  const slug = String(event.eventTitle)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLocaleLowerCase('it') || 'film';
  return `${slug}-${event.eventDate.replace(/\//g, '-')}-${event.eventTime.replace(':', '')}.ics`;
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

// iPhone/iPad: il file ICS viene consegnato al sistema, che avvia l'app
// Calendario con l'evento già compilato.
function openCalendarFile(file) {
  const url = URL.createObjectURL(file);
  window.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Android: Google Calendar dichiara un App Link su /calendar/render, quindi
// un vero clic sul link apre l'editor nativo dell'app (con la scelta del
// calendario), non il sito. Gli intent INSERT non sono raggiungibili dal
// browser perché Chrome aggiunge a forza la categoria BROWSABLE.
function openAndroidCalendar(event) {
  const link = document.createElement('a');
  link.href = calendarUrl(event);
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function shareCalendarEvent(event) {
  if (isAndroid()) {
    openAndroidCalendar(event);
    return;
  }

  const file = new File([buildCalendarEvent(event)], calendarFileName(event), { type: 'text/calendar' });
  if (isAppleMobile()) {
    // Il foglio di condivisione iOS non elenca Calendario: il file ICS
    // viene passato a Safari, che mostra "Aggiungi al calendario".
    openCalendarFile(file);
    return;
  }

  window.open(calendarUrl(event), '_blank', 'noopener,noreferrer');
}

function calendarUrl(event) {
  const minutes = durationMinutes(event.eventDuration);
  const start = calendarDateTime(event.eventDate, event.eventTime);
  const end = calendarDateTime(event.eventDate, event.eventTime, minutes);
  const venueLine = `${event.eventVenue}${event.eventRoom ? ` (${event.eventRoom})` : ''}`;
  const location = [venueLine, event.eventLocation].filter(Boolean).join(', ');
  const details = [
    `Film: ${event.eventTitle}`,
    `Cinema: ${event.eventVenue}${event.eventLocation ? ` — ${event.eventLocation}` : ''}`,
    event.eventRoom ? `Sala: ${event.eventRoom}` : '',
    parseDurationMinutes(event.eventDuration) ? `Durata: ${minutes} minuti; fine indicativa, escluse pubblicità e intervallo.` : 'Durata non disponibile; fine impostata indicativamente a 110 minuti.',
    event.eventUrl ? `Biglietti: ${event.eventUrl}` : '',
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${event.eventTitle} — ${event.eventVenue}`,
    dates: `${start}/${end}`,
    details,
    location,
    ctz: 'Europe/Rome',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ==========================================
// CALENDARIO DELL'APP: abbonamento multi-cinema ed esportazione personale
// ==========================================
const calendarDialog = $('#calendar-dialog');

function calendarSlug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLocaleLowerCase('it');
}

function calendarMode() {
  return $('#calendar-export-mode')?.value || 'venues';
}

function selectedCalendarVenues() {
  return [...$$('#calendar-venues input:checked')].map((input) => input.value).sort();
}

function calendarFeedUrl(ids = selectedCalendarVenues()) {
  const known = scheduleData.venues.map((venue) => venue.id);
  const selected = [...new Set(ids)].filter((id) => known.includes(id)).sort();
  if (!selected.length) return '';
  const file = selected.length === known.length ? 'all' : selected.join('_');
  return new URL(`calendars/${file}.ics`, document.baseURI).href;
}

function collectCalendarShows(mode, value, venueIds = selectedCalendarVenues()) {
  const now = new Date();
  const shows = [];
  const venuesById = Object.fromEntries((scheduleData.venues || []).map((venue) => [venue.id, venue]));

  for (const movie of scheduleData.movies || []) {
    if (mode === 'favorites' && !favorites.has(movie.id)) continue;

    for (const group of movie.shows || []) {
      if (!venueIds.includes(group.venue)) continue;
      if (mode === 'venue' && group.venue !== value) continue;
      if (mode === 'day' && group.date !== value) continue;

      const cinema = venuesById[group.venue] || { id: group.venue, name: group.venue, location: '' };
      const info = venueInfo[group.venue] || {};
      const location = [info.address, info.city || cinema.location].filter(Boolean).join(', ');

      for (const entry of group.shows || []) {
        const startsAt = wallClockDate(group.date, entry.time);
        if (startsAt < now) continue;
        shows.push({
          title: movie.title,
          venue: cinema.name,
          venueId: group.venue,
          location,
          room: entry.room ? roomLabel(entry.room) : '',
          date: group.date,
          time: entry.time,
          startsAt,
          duration: movie.duration,
          url: entry.url || movieUrlForVenue(movie, group.venue) || movie.url,
        });
      }
    }
  }

  return shows.sort((a, b) => a.startsAt - b.startsAt);
}

function calendarSelection() {
  const mode = calendarMode();
  if (mode === 'day') return { mode, value: $('#calendar-day')?.value || '' };
  return { mode, value: '' };
}

function calendarExportName(selection) {
  if (selection.mode === 'favorites') return 'Fuori programma — Film salvati';
  if (selection.mode === 'venues') return 'Fuori programma — I miei cinema';
  return `Fuori programma — ${formatDayLabel(selection.value)}`;
}

function updateCalendarSummary() {
  const summary = $('#calendar-summary');
  const download = $('#calendar-download');
  if (!summary || !download) return;

  const selection = calendarSelection();
  const events = collectCalendarShows(selection.mode, selection.value);
  const dayRow = $('#calendar-day-row');
  if (dayRow) dayRow.hidden = selection.mode !== 'day';
  const ids = selectedCalendarVenues();
  const allEvents = collectCalendarShows('venues', '');
  const feed = calendarFeedUrl(ids);
  const name = ids.length === scheduleData.venues.length
    ? 'Tutti i cinema' : scheduleData.venues.filter((v) => ids.includes(v.id)).map((v) => v.name).join(', ');
  // L'app Google Calendar non aggiunge feed da URL: da telefono conviene aprire
  // la pagina "Da URL" del calendario web, eventualmente in versione desktop.
  const googleLink = !feed ? ''
    : matchMedia('(pointer: coarse)').matches
      ? 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl'
      : `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
  summary.textContent = !ids.length ? 'Seleziona almeno un cinema per creare il tuo abbonamento.'
    : `${ids.length} ${ids.length === 1 ? 'cinema selezionato' : 'cinema selezionati'} · ${allEvents.length} spettacoli futuri${allEvents.length ? ` · ${new Set(allEvents.map((event) => event.title)).size} film` : '. Gli orari futuri compariranno quando pubblicati.'}`;
  const links = {
    '#calendar-google': googleLink,
    '#calendar-apple': feed.replace(/^https?:/, 'webcal:'),
    '#calendar-outlook': feed ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(`Fuori programma — ${name}`)}` : '',
  };
  for (const [selector, url] of Object.entries(links)) {
    const link = $(selector);
    if (url) link.href = url;
    else link.removeAttribute('href');
    link.setAttribute('aria-disabled', String(!url));
  }
  $('#calendar-copy').disabled = !feed;
  $('#calendar-select-all').textContent = ids.length === scheduleData.venues.length ? 'Deseleziona tutti' : 'Seleziona tutti';
  download.disabled = events.length === 0;
  $('#calendar-export-summary').textContent = events.length
    ? `${events.length} spettacoli nel file, senza aggiornamenti automatici.`
    : selection.mode === 'favorites' ? 'Nessuno spettacolo futuro per i film salvati nei cinema selezionati.' : 'Nessuno spettacolo futuro per questa selezione.';
}

function populateCalendarDialog() {
  const saved = readStore('fp_calendar_venues', null);
  const chosen = Array.isArray(saved) ? saved : preferredVenues.size ? [...preferredVenues] : scheduleData.venues.map((v) => v.id);
  $('#calendar-venues').innerHTML = '<legend class="sr-only">Cinema da seguire</legend>' + scheduleData.venues.map((venue) =>
    `<label class="venue-choice"><input type="checkbox" value="${escapeHtml(venue.id)}" ${chosen.includes(venue.id) ? 'checked' : ''}><span><strong>${escapeHtml(venue.name)}</strong><small>${escapeHtml(venue.location)}</small></span></label>`
  ).join('');

  const daySelect = $('#calendar-day');
  if (daySelect) {
    const dates = getSortedDates();
    daySelect.innerHTML = dates.map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(formatDayLabel(date))} · ${escapeHtml(date)}</option>`).join('');
    if (dates.includes(selectedDate)) daySelect.value = selectedDate;
    else if (dates.length) daySelect.value = dates[0];
  }

  updateCalendarSummary();
}

function openCalendarDialog() {
  if (!calendarDialog) return;
  populateCalendarDialog();
  if (typeof calendarDialog.showModal === 'function') calendarDialog.showModal();
  else calendarDialog.setAttribute('open', '');
  calendarDialog.scrollTop = 0;
}

function closeCalendarDialog() {
  if (!calendarDialog) return;
  if (typeof calendarDialog.close === 'function') calendarDialog.close();
  else calendarDialog.removeAttribute('open');
}

function downloadCalendar() {
  const selection = calendarSelection();
  const events = collectCalendarShows(selection.mode, selection.value);
  if (!events.length) return;

  const name = calendarExportName(selection);
  const documentText = buildCalendarDocument(events, {
    name,
    alarm: $('#calendar-alarm')?.checked !== false,
  });
  const blob = new Blob([documentText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fuori-programma-${calendarSlug(name.replace('Fuori programma — ', '')) || 'spettacoli'}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);

  closeCalendarDialog();
  showToast(`${events.length} ${events.length === 1 ? 'spettacolo esportato' : 'spettacoli esportati'} nel calendario`);
}

function showtimeChipHtml(movie, cinema, dateStr, entry, className, isPast = false) {
  const minutes = parseDurationMinutes(movie.duration);
  const end = minutes ? addMinutes(wallClockDate(dateStr, entry.time), minutes) : null;
  const endsAt = end ? `${timeLabel(end)}${dateString(end) !== dateStr ? ' (+1g)' : ''}` : '';
  const flags = showtimeFormats(entry);
  return `
    <button class="${className}${isPast ? ' is-past' : ''}" type="button" data-showtime aria-haspopup="menu" aria-controls="showtime-menu" aria-expanded="false"
      data-event-title="${escapeHtml(movie.title)}"
      data-event-date="${escapeHtml(dateStr)}"
      data-event-time="${escapeHtml(entry.time)}"
      data-event-duration="${escapeHtml(cleanDuration(movie.duration))}"
      data-event-venue="${escapeHtml(cinema.name)}"
      data-event-location="${escapeHtml(cinema.location || '')}"
      data-event-room="${escapeHtml(entry.room ? roomLabel(entry.room) : '')}"
      data-event-url="${escapeHtml(entry.url || movieUrlForVenue(movie, cinema.id) || '')}"
      data-ticket-direct="${entry.url ? 'true' : 'false'}"
      data-is-past="${isPast ? 'true' : 'false'}"
      aria-label="${escapeHtml(`${movie.title}, ${cinema.name}, ${dateStr} alle ${entry.time}${entry.room ? `, ${roomLabel(entry.room)}` : ''}${isPast ? ', già iniziato' : ''}: biglietti e altre azioni`)}">
      <strong>${escapeHtml(entry.time)}</strong>
      ${endsAt ? `<span class="showtime-end">Fine ≈ ${endsAt}</span>` : ''}
      <span class="showtime-room">${isPast ? 'Iniziato' : entry.room ? escapeHtml(roomLabel(entry.room)) : 'Scegli orario'}</span>
      ${flags.length ? `<span class="showtime-format">${escapeHtml(flags.join(' · '))}</span>` : ''}
    </button>
  `;
}

// Primo spettacolo ancora da iniziare: sulla card evita di dover aprire
// il pannello solo per sapere a che ora è il prossimo.
function nextShowtime(shows, durationRaw = '') {
  const duration = parseDurationMinutes(durationRaw);
  const entries = [];
  for (const group of shows) {
    for (const entry of group.shows) {
      const startsAt = wallClockDate(group.date, entry.time);
      entries.push({
        date: group.date,
        time: entry.time,
        venue: group.venue,
        startsAt,
        duration,
        endsAt: duration ? addMinutes(startsAt, duration) : null,
      });
    }
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a.startsAt - b.startsAt);
  const now = new Date();
  const upcoming = entries.filter((entry) => entry.startsAt >= now);
  if (!upcoming.length) return null;
  return { ...upcoming[0], upcomingCount: upcoming.length };
}

function positionShowtimeMenu(button) {
  const margin = 8;
  const rect = button.getBoundingClientRect();
  const menuRect = showtimeMenu.getBoundingClientRect();
  const left = Math.max(margin, Math.min(
    rect.left + rect.width / 2 - menuRect.width / 2,
    window.innerWidth - menuRect.width - margin,
  ));
  let top = rect.bottom + margin;
  if (top + menuRect.height > window.innerHeight - margin) {
    const above = rect.top - menuRect.height - margin;
    top = above >= margin ? above : Math.max(margin, window.innerHeight - menuRect.height - margin);
  }
  showtimeMenu.style.left = `${Math.round(left)}px`;
  showtimeMenu.style.top = `${Math.round(top)}px`;
}

function openShowtimeMenu(button) {
  if (!showtimeMenu) return;
  closeShowtimeMenu();
  activeShowtime = { ...button.dataset };
  activeShowtimeButton = button;
  showtimeMenuTime.textContent = activeShowtime.eventTime;
  showtimeMenuMeta.textContent = `${formatDayLabel(activeShowtime.eventDate)} · ${activeShowtime.eventVenue}`;
  $('#showtime-ticket-label').textContent = activeShowtime.ticketDirect === 'true'
    ? `Biglietti · ${activeShowtime.eventVenue}`
    : `Scheda film · ${activeShowtime.eventVenue}`;
  showtimeMenu.hidden = false;
  positionShowtimeMenu(button);
  button.setAttribute('aria-expanded', 'true');
  showtimeMenu.querySelector('.showtime-menu-item')?.focus({ preventScroll: true });
}

function closeShowtimeMenu() {
  if (!showtimeMenu || showtimeMenu.hidden) return;
  showtimeMenu.hidden = true;
  if (activeShowtimeButton) {
    activeShowtimeButton.setAttribute('aria-expanded', 'false');
    activeShowtimeButton = null;
  }
  activeShowtime = null;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {}

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch (error) {
    return false;
  }
}

async function shareShowtime(event) {
  const lines = [
    `${event.eventTitle} — ${event.eventVenue}`,
    `${italianFullDate(parseDate(event.eventDate))} alle ${event.eventTime}`,
    event.eventLocation ? `Dove: ${event.eventLocation}${event.eventRoom ? `, ${event.eventRoom}` : ''}` : '',
    event.eventUrl || '',
  ].filter(Boolean).join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title: `${event.eventTitle} — ${event.eventVenue}`, text: lines, url: event.eventUrl || undefined });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  if (await copyToClipboard(lines)) showToast('Orario copiato negli appunti');
  else showToast('Impossibile condividere questo orario');
}

// --- Setup Venues & Days ---
// Illustrazioni vettoriali: stessa grammatica visiva del sito (tratto sottile,
// inchiostro + un accento), niente foto stock.
const VENUE_ART = {
  'andromeda-river': `
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
      <rect width="400" height="150" fill="var(--surface-alt)" />
      <circle cx="332" cy="36" r="15" stroke="var(--line)" stroke-width="1.5" />
      <path d="M0 128c40-10 80 10 120 0s80-10 120 0 80 10 160 0" stroke="var(--line)" stroke-width="1.5" />
      <path d="M0 138c40-10 80 10 120 0s80-10 120 0 80 10 160 0" stroke="var(--line)" stroke-width="1.5" />
      <path d="M62 118V76c0-20 18-34 40-34h116c22 0 40 14 40 34v42" stroke="var(--ink)" stroke-width="2" />
      <path d="M86 118V82h152v36" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M100 118V94h22v24M138 118V94h22v24M176 118V94h22v24M214 118V94h22v24" stroke="var(--line)" stroke-width="1.5" />
      <rect x="146" y="52" width="76" height="15" fill="var(--red)" />
      <text x="184" y="63" text-anchor="middle" font-family="ui-monospace, monospace" font-size="7" letter-spacing="1.4" fill="var(--on-blue)">ANDROMEDA</text>
      <path d="M108 118v-9a16 16 0 0 1 32 0v9M152 118v-9a16 16 0 0 1 32 0v9" stroke="var(--ink)" stroke-width="1.5" fill="var(--paper)" />
      <rect x="300" y="88" width="46" height="26" stroke="var(--live)" stroke-width="1.5" />
      <path d="M308 101h30M308 108h18" stroke="var(--live)" stroke-width="1.5" />
    </svg>
  `,
  citrigno: `
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
      <rect width="400" height="150" fill="var(--surface-alt)" />
      <path d="M0 118h64M328 118h72" stroke="var(--line)" stroke-width="1.5" />
      <rect x="74" y="44" width="122" height="76" fill="var(--paper)" stroke="var(--ink)" stroke-width="2" />
      <path d="M66 44h138" stroke="var(--ink)" stroke-width="3" />
      <rect x="196" y="30" width="21" height="70" fill="var(--red)" />
      <text transform="rotate(-90 206 65)" x="206" y="65" text-anchor="middle" font-family="ui-monospace, monospace" font-size="8" letter-spacing="1.6" fill="var(--on-blue)">CITRIGNO</text>
      <path d="M84 76h102l-9 13H93z" fill="var(--live)" opacity=".85" />
      <path d="M93 89v8M113 89v8M133 89v8M153 89v8M173 89v8" stroke="var(--paper)" stroke-width="1.5" />
      <path d="M96 120V95h30v25M146 120V95h30v25" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M88 120h106M82 128h118" stroke="var(--line)" stroke-width="1.5" />
      <path d="M316 128V82m-10 0h10" stroke="var(--ink)" stroke-width="1.5" />
      <circle cx="316" cy="77" r="5" stroke="var(--line)" stroke-width="1.5" />
      <path d="M286 128v-18h18v18" stroke="var(--line)" stroke-width="1.5" />
    </svg>
  `,
  'cinema-teatro-italia': `
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
      <rect width="400" height="150" fill="var(--surface-alt)" />
      <path d="M46 132h308M62 124h276" stroke="var(--line)" stroke-width="1.5" />
      <path d="M70 74h260L200 28 70 74z" fill="var(--paper)" stroke="var(--ink)" stroke-width="2" />
      <path d="M98 74h204L200 42z" stroke="var(--line)" stroke-width="1.5" />
      <rect x="80" y="74" width="240" height="50" fill="var(--paper)" stroke="var(--ink)" stroke-width="2" />
      <path d="M102 86v38M134 86v38M166 86v38M234 86v38M266 86v38M298 86v38" stroke="var(--ink)" stroke-width="2" />
      <path d="M96 86h18M128 86h18M160 86h18M228 86h18M260 86h18M292 86h18" stroke="var(--ink)" stroke-width="1.5" />
      <text x="200" y="68" text-anchor="middle" font-family="ui-monospace, monospace" font-size="8" letter-spacing="3" fill="var(--red)">TEATRO ITALIA</text>
      <path d="M186 86h28v38h-28z" fill="var(--red)" opacity=".16" />
      <path d="M200 86v38" stroke="var(--red)" stroke-width="1.5" />
      <circle cx="56" cy="112" r="3" fill="var(--live)" />
      <circle cx="344" cy="112" r="3" fill="var(--live)" />
    </svg>
  `,
  garden: `
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
      <rect width="400" height="150" fill="var(--surface-alt)" />
      <path d="M0 128h400" stroke="var(--line)" stroke-width="1.5" />
      <path d="M56 128V92" stroke="var(--ink)" stroke-width="2" />
      <path d="M56 96c-14-8-24-4-28 2M56 96c14-10 24-6 28 0M56 96c-10-14-4-24 2-28M56 96c10-12 6-22 0-28" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M344 128V92" stroke="var(--ink)" stroke-width="2" />
      <path d="M344 96c-14-8-24-4-28 2M344 96c14-10 24-6 28 0M344 96c-10-14-4-24 2-28M344 96c10-12 6-22 0-28" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M112 128V78a88 88 0 0 1 176 0v50" fill="var(--paper)" stroke="var(--ink)" stroke-width="2" />
      <rect x="130" y="78" width="140" height="22" fill="var(--red)" />
      <text x="200" y="93" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" letter-spacing="4" fill="var(--on-blue)">GARDEN</text>
      <path d="M168 128v-22h64v22M200 106v22" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M112 62c30-14 60-14 88 0s58 14 88 0" stroke="var(--line)" stroke-width="1.5" />
      <circle cx="142" cy="55" r="2.2" fill="var(--live)" />
      <circle cx="200" cy="62" r="2.2" fill="var(--live)" />
      <circle cx="258" cy="55" r="2.2" fill="var(--live)" />
    </svg>
  `,
  unical: `
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
      <rect width="400" height="150" fill="var(--surface-alt)" />
      <path d="M0 124c46-24 84-10 124 0s88-16 138-8 92 12 138 4v30H0z" fill="var(--line)" opacity=".28" />
      <path d="M200 40l58 30-58 30-58-30z" fill="var(--red)" opacity=".14" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M142 70v44l58 30v-44" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M258 70v44l-58 30" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M200 108v22M218 98v22M236 88v22" stroke="var(--line)" stroke-width="1.5" />
      <path d="M70 124V58h34v66" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M78 70h18M78 82h18M78 94h18M78 106h18" stroke="var(--line)" stroke-width="1.5" />
      <path d="M292 124V96h52v28" stroke="var(--ink)" stroke-width="1.5" />
      <path d="M302 104h12M322 104h12" stroke="var(--line)" stroke-width="1.5" />
      <path d="M0 124h400" stroke="var(--line)" stroke-width="1.5" />
      <text x="200" y="22" text-anchor="middle" font-family="ui-monospace, monospace" font-size="8" letter-spacing="3" fill="var(--muted)">UNICAL</text>
    </svg>
  `,
};

function venueArt(venueId) {
  return VENUE_ART[venueId] || VENUE_ART['cinema-teatro-italia'];
}

function venueTodaySummary(venueId, now = new Date()) {
  const today = getTodayString();
  const films = new Set();
  let next = null;
  let remaining = 0;

  for (const movie of scheduleData.movies || []) {
    for (const group of movie.shows || []) {
      if (group.venue !== venueId || group.date !== today) continue;
      for (const entry of group.shows || []) {
        const start = wallClockDate(group.date, entry.time);
        if (start < now) continue;
        films.add(movie.id);
        remaining += 1;
        if (!next || start < next.start) next = { start, time: entry.time, title: movie.title };
      }
    }
  }

  return { films: films.size, remaining, next };
}

function venueNextDate(venueId) {
  const now = new Date();
  const dates = [];
  for (const movie of scheduleData.movies || []) {
    for (const group of movie.shows || []) {
      if (group.venue !== venueId) continue;
      if (group.shows.some((entry) => wallClockDate(group.date, entry.time) >= now)) {
        dates.push(group.date);
      }
    }
  }
  dates.sort((a, b) => parseDate(a) - parseDate(b));
  return dates[0] || null;
}

function venueTodayText(venueId) {
  const { films, remaining, next } = venueTodaySummary(venueId);
  if (remaining > 0) {
    return `${films} ${films === 1 ? 'film' : 'film'} in sala · ${remaining} ${remaining === 1 ? 'spettacolo' : 'spettacoli'} da adesso · prossimo alle ${next.time}`;
  }
  const nextDate = venueNextDate(venueId);
  if (nextDate) return `Nessuno spettacolo oggi · riprende ${formatDayLabel(nextDate)}`;
  return 'Nessuno spettacolo in programma';
}

function renderVenuesInfo(venues) {
  if (venueFilter) {
    const selected = readStore('fp_venue_filter', venueFilter.value || 'all');
    venueFilter.innerHTML = '<option value="all">Tutte le sale</option><option value="preferred">I miei cinema</option>' + venues.map((venue) => `<option value="${escapeHtml(venue.id)}">${escapeHtml(venue.name)}</option>`).join('');
    venueFilter.value = ['all', 'preferred', ...venues.map((v) => v.id)].includes(selected) ? selected : 'all';
  }
  renderPreferredVenues(venues);

  const cinemaList = $('#cinema-list');
  if (!cinemaList) return;

  const statusLabels = { available: 'Fonte attiva', stale: 'Dati non aggiornati', unavailable: 'Fonte non disponibile' };
  cinemaList.innerHTML = venues.map((venue) => {
    const info = venueInfo[venue.id] || {};
    const address = [info.address, info.city || venue.location].filter(Boolean).join(' · ');
    const features = (info.features || []).map((feature) => `<span>${escapeHtml(feature)}</span>`).join('');
    const warning = venue.status && venue.status !== 'available'
      ? `<span class="cinema-warning">${escapeHtml(statusLabels[venue.status] || statusLabels.unavailable)}</span>`
      : '';

    return `
      <article class="cinema-card" data-cinema="${escapeHtml(venue.id)}">
        <div class="cinema-art">${venueArt(venue.id)}</div>
        <div class="cinema-card-body">
          <div class="cinema-card-head">
            <h3>${escapeHtml(venue.name)}</h3>
            ${warning}
          </div>
          <p class="cinema-address">${escapeHtml(address || venue.location)}</p>
          <p class="cinema-today" data-venue-today="${escapeHtml(venue.id)}">${escapeHtml(venueTodayText(venue.id))}</p>
          ${features ? `<div class="cinema-features">${features}</div>` : ''}
          <div class="cinema-actions">
            <button class="cinema-cta" type="button" data-venue-schedule="${escapeHtml(venue.id)}">Vedi gli orari</button>
            ${info.mapsUrl ? `<a class="cinema-link" href="${escapeHtml(info.mapsUrl)}" target="_blank" rel="noreferrer">Indicazioni</a>` : ''}
            ${info.phone ? `<a class="cinema-link" href="tel:${escapeHtml(info.phoneHref || info.phone)}">${escapeHtml(info.phone)}</a>` : ''}
          </div>
          ${venue.source ? `<a class="cinema-source-link" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">${escapeHtml(venue.sourceName || 'Biglietteria')} &rarr;</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderPreferredVenues(venues = scheduleData.venues) {
  $('#preferred-venues').innerHTML = venues.map((venue) =>
    `<label class="venue-choice"><input type="checkbox" value="${escapeHtml(venue.id)}" ${preferredVenues.has(venue.id) ? 'checked' : ''}><span><strong>${escapeHtml(venue.name)}</strong><small>${escapeHtml(venue.location)}</small></span></label>`
  ).join('');
  updatePreferredVenues();
}

function updatePreferredVenues() {
  $('#preferred-venue-count').textContent = preferredVenues.size ? `· ${preferredVenues.size} selezionati` : '· scegli le sale';
  $('#preferred-venues-apply').disabled = preferredVenues.size === 0;
}

function matchesVenue(id, selected = venueFilter?.value || 'all') {
  return selected === 'all' || (selected === 'preferred' ? preferredVenues.has(id) : id === selected);
}

function updateVenueTodayTexts() {
  $$('[data-venue-today]').forEach((el) => {
    el.textContent = venueTodayText(el.dataset.venueToday);
  });
}

function showVenueSchedule(venueId) {
  if (venueFilter) venueFilter.value = venueId;
  writeStore('fp_venue_filter', venueId);
  if (searchInput) searchInput.value = '';
  if (genreFilter) genreFilter.value = 'all';
  $$('.chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.chip === 'all'));
  activeChip = 'all';
  showPastShowsToday = false;

  selectedDate = venueNextDate(venueId) || getTodayString();
  currentView = 'schedule';
  $$('.view-pill').forEach((button) => {
    const active = button.dataset.view === 'schedule';
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  renderDaysStrip();
  render();

  const target = $('.schedule-controls') || $('#programmazione');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderGenreOptions(movies) {
  if (!genreFilter) return;
  const selectedGenre = genreFilter.value || 'all';
  const genres = [...new Set(movies.flatMap((movie) => movie.genres || []))]
    .sort((a, b) => a.localeCompare(b, 'it'));
  genreFilter.innerHTML = '<option value="all">Tutti i generi</option>'
    + genres.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`).join('');
  genreFilter.value = genres.includes(selectedGenre) ? selectedGenre : 'all';
}

function readableISODate(value) {
  const date = new Date(value?.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '';
}

function renderMovieRating(movie) {
  const info = ratingInfo(movie);
  if (!info.rating) return '<p class="movie-rating rating-unavailable">Voto non disponibile</p>';
  const value = info.rating.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `<a class="movie-rating" href="${escapeHtml(info.url)}" target="_blank" rel="noreferrer"
    aria-label="Voto complessivo MYmovies: ${value} su 5. Apri la fonte">
    <span class="rating-value"><span aria-hidden="true">★</span> ${value}<small>/5</small></span><span class="rating-source">MYmovies</span></a>`;
}

function renderRatingDetails(movie) {
  const info = ratingInfo(movie);
  if (!info.url) return '';
  const score = (value) => Number(value) > 0 && Number(value) <= 5
    ? `${Number(value).toLocaleString('it-IT', { maximumFractionDigits: 2 })}/5` : 'Non disponibile';
  return `<section class="rating-details" aria-label="Valutazioni MYmovies">
    <div class="rating-breakdown"><p><span>Complessivo</span><strong>${score(info.rating)}</strong></p>
    <p><span>Critica</span><strong>${score(info.criticsRating)}</strong></p>
    <p><span>Pubblico</span><strong>${score(info.audienceRating)}</strong></p></div>
    <p>${info.ratingCount ? `${info.ratingCount.toLocaleString('it-IT')} valutazioni complessive. ${info.ratingCount < 10 ? 'Campione ancora piccolo. ' : ''}` : 'Numero di valutazioni non disponibile. '}
    Il voto complessivo MYmovies include fonti diverse: non è il solo voto del pubblico.</p>
    <a href="${escapeHtml(info.url)}" target="_blank" rel="noreferrer">Fonte: MYmovies ↗</a>
    ${info.checkedAt ? `<small>Verificato il ${escapeHtml(readableISODate(info.checkedAt))}</small>` : ''}
  </section>`;
}

function renderMovieMetadata(movie) {
  const details = [];
  if (movie.director) details.push(`Regia: ${escapeHtml(movie.director)}`);
  if (movie.year) details.push(escapeHtml(movie.year));
  if (movie.language) details.push(escapeHtml(movie.language));
  // Sempre presente: nella griglia occupa un'altezza fissa, così le card
  // restano allineate anche quando la regia non è nota.
  const credits = `<p class="movie-credits" title="${details.join(' · ')}">${details.join(' · ')}</p>`;
  return credits;
}

// Il trailer è sempre il primo dei tre comandi della card: quando manca
// resta al suo posto in stato disabilitato, così la fila non si sfalsa.
function renderTrailerLink(movie) {
  let url = '';
  if (movie.trailer) {
    try {
      const parsed = new URL(movie.trailer);
      if (/^https?:$/.test(parsed.protocol)) url = parsed.href;
    } catch (error) {
      // Un link malformato equivale a un trailer assente.
    }
  }

  if (!url) {
    return `<button class="trailer-link is-unavailable" type="button" disabled aria-label="Trailer non disponibile per ${escapeHtml(movie.title)}" title="Trailer non disponibile per ${escapeHtml(movie.title)}">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"></line></svg>
      <span class="sr-only">Trailer non disponibile</span>
    </button>`;
  }

  return `<a class="trailer-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" title="Guarda il trailer di ${escapeHtml(movie.title)}" aria-label="Guarda il trailer di ${escapeHtml(movie.title)}">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>
    <span class="sr-only">Guarda trailer</span>
  </a>`;
}

function movieUrlForVenue(movie, venueId) {
  return movie.venueUrls?.[venueId] || movie.url;
}

function movieProgramming(movie) {
  const dates = new Map();
  for (const item of movie.announcedDates || []) {
    const key = `${item.date}|${item.venue}`;
    dates.set(key, item);
  }
  for (const show of movie.shows || []) {
    const key = `${show.date}|${show.venue}`;
    if (!dates.has(key)) dates.set(key, { date: show.date, venue: show.venue });
  }
  return [...dates.values()];
}

function renderPosterLink(movie, { panelId, isExpanded }) {
  const image = movie.poster
    ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="" loading="lazy" />`
    : `<span class="poster poster-missing" aria-hidden="true">${escapeHtml(movie.title.slice(0, 1))}</span>`;

  return `<button class="poster-link" type="button" data-card-open
    aria-expanded="${isExpanded}" aria-controls="${escapeHtml(panelId)}"
    aria-label="Apri la scheda, le sale e gli orari di ${escapeHtml(movie.title)}"
    ${isExpanded ? 'disabled' : ''}>${image}</button>`;
}

function getSortedDates() {
  const dates = [...new Set(scheduleData.movies.flatMap((movie) => movieProgramming(movie).map((item) => item.date)))].sort((a, b) => parseDate(a) - parseDate(b));
  const upcoming = dates.filter((date) => !isPastDate(date));
  // Se i dati sono fermi a un giorno passato meglio mostrarli che non mostrare nulla.
  return upcoming.length ? upcoming : dates;
}

function renderDaysStrip() {
  if (!daysNavStrip) return;
  const dates = getSortedDates();
  const today = getTodayString();
  if (!selectedDate || !dates.includes(selectedDate)) {
    selectedDate = dates.includes(today) ? today : (dates[0] || '');
  }

  daysNavStrip.innerHTML = dates.map((d) => {
    const isSelected = d === selectedDate;
    const isToday = d === today;
    const dObj = parseDate(d);
    const dayName = isToday ? 'Oggi' : new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(dObj).replace('.', '');
    const dayNumber = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(dObj).replace('.', '');

    return `
      <button type="button" class="day-strip-pill ${isSelected ? 'active' : ''}" data-date="${d}" role="tab" aria-selected="${isSelected ? 'true' : 'false'}">
        <span class="pill-day-name">${escapeHtml(dayName)}</span>
        <span class="pill-day-num">${escapeHtml(dayNumber)}</span>
      </button>
    `;
  }).join('');
}

function render() {
  const query = (searchInput?.value || '').trim().toLocaleLowerCase('it');
  const selectedVenue = venueFilter?.value || 'all';
  const selectedGenre = genreFilter?.value || 'all';
  const venuesMap = Object.fromEntries(scheduleData.venues.map((v) => [v.id, v]));
  const todayString = getTodayString();
  const isMovies = currentView === 'movies';
  $('#movie-sort').value = isMovies ? moviesSort : scheduleSort;
  $$('.chip').forEach((chip) => {
    const selected = chip.dataset.chip === activeChip;
    chip.classList.toggle('active', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  const filteredMovies = scheduleData.movies.filter((movie) => {
    const fields = [movie.title, movie.synopsis, movie.director, movie.year, movie.cast, ...(movie.genres || []),
      ...movieProgramming(movie).map((item) => venuesMap[item.venue]?.name)];
    if (!fields.some((field) => String(field || '').toLocaleLowerCase('it').includes(query))) return false;
    if (selectedGenre !== 'all' && !(movie.genres || []).includes(selectedGenre)) return false;
    if (activeChip === 'favorites' && !favorites.has(movie.id)) return false;
    return true;
  });
  if (isMovies) {
    controlsPerFilm.hidden = false;
    controlsPerDay.hidden = true;
    moviesGrid.hidden = false;
    filmList.hidden = true;
    const movies = filteredMovies.filter((movie) => catalogSelection(movie, selectedVenue, todayString).programming.length);
    renderMoviesCatalogView(sortMovies(movies, moviesSort, (movie) => catalogSelection(movie, selectedVenue, todayString).shows), venuesMap, selectedVenue);
    const hints = {
      release: 'Uscita italiana più recente; le prossime uscite seguono i film già usciti.',
      added: 'Prima comparsa nella programmazione del sito, non data di uscita.',
      next: 'Prima i film con lo spettacolo più vicino nei cinema selezionati.',
      rating: 'Voti MYmovies ponderati per il numero di valutazioni; pochi voti pesano meno.',
      title: 'Titoli in ordine alfabetico.',
    };
    $('.view-hint').textContent = hints[moviesSort];
  } else if (currentView === 'schedule') {
    controlsPerFilm.hidden = true;
    controlsPerDay.hidden = false;
    moviesGrid.hidden = true;
    filmList.hidden = false;
    renderDaysStrip();
    renderScheduleDayView(filteredMovies, venuesMap, selectedDate);
  }
  $('#empty-msg').textContent = selectedVenue === 'preferred' && !preferredVenues.size
    ? 'Scegli prima le sale in “I miei cinema”, oppure mostra tutte le sale.'
    : 'Nessuna proiezione corrisponde ai filtri selezionati.';
}

function showtimeFormats(entry) {
  const declared = [entry.format, entry.language, entry.version, entry.room, ...(entry.tags || [])].filter(Boolean).join(' ');
  const flags = [];
  if (/(?:\b(?:OV|VO)\b|V\.O\.|versione originale|original version)/i.test(declared)) flags.push('V.O.');
  if (entry.subtitles || /\b(?:sottotitol[io]|sub(?:\s*ita)?)\b/i.test(declared)) flags.push('Sottotitoli');
  if (/\b3D\b/i.test(declared)) flags.push('3D');
  return flags;
}

function periodDateMatches(dateStr, period = activeChip, now = new Date()) {
  if (period === 'today' || period === 'tonight') return dateStr === dateString(now);
  if (period !== 'weekend') return !isPastDate(dateStr);
  const friday = new Date(now);
  const weekday = now.getDay();
  friday.setDate(now.getDate() + (weekday === 0 ? -2 : weekday === 6 ? -1 : (5 - weekday + 7) % 7));
  friday.setHours(0, 0, 0, 0);
  const monday = new Date(friday);
  monday.setDate(friday.getDate() + 3);
  return parseDate(dateStr) >= friday && parseDate(dateStr) < monday;
}

function ratingInfo(movie) {
  const source = movie.external || {};
  const rating = Number(source.rating);
  let url = '';
  try {
    const parsed = new URL(source.url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'www.mymovies.it') url = parsed.href;
  } catch {}
  return { ...source, rating: url && rating > 0 && rating <= 5 ? rating : 0,
    ratingCount: Math.max(0, Number(source.ratingCount) || 0), url };
}

function sortMovies(movies, mode, showsForMovie = (movie) => movie.shows || []) {
  const today = dateString(new Date()).split('/').reverse().join('-');
  const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
  const nextTime = (movie) => nextShowtime(showsForMovie(movie))?.startsAt.getTime() ?? Infinity;
  return [...movies].sort((a, b) => {
    let difference = 0;
    if (mode === 'release') {
      const available = (m) => m.releaseDateIT && m.releaseDateIT <= today ? timestamp(m.releaseDateIT) : -Infinity;
      const left = available(a), right = available(b);
      difference = left === right ? 0 : right > left ? 1 : -1;
    } else if (mode === 'added') {
      const left = timestamp(a.firstSeenAt), right = timestamp(b.firstSeenAt);
      difference = left === right ? 0 : right > left ? 1 : -1;
    } else if (mode === 'next') {
      const left = nextTime(a), right = nextTime(b);
      difference = left === right ? 0 : left < right ? -1 : 1;
    } else if (mode === 'rating') {
      const score = (movie) => {
        const info = ratingInfo(movie);
        if (!info.rating) return -1;
        return (info.rating * info.ratingCount + 3 * 20) / (info.ratingCount + 20);
      };
      difference = score(b) - score(a);
    }
    return difference || a.title.localeCompare(b.title, 'it', { sensitivity: 'base' });
  });
}

// ==========================================
// ORA IN SALA: film in proiezione adesso
// ==========================================
function airingNowFilms(movies, venuesMap, now = new Date()) {
  const today = dateString(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateString(yesterdayDate);
  const playing = [];

  for (const movie of movies) {
    const parsedDuration = parseDurationMinutes(movie.duration);
    const durationKnown = parsedDuration > 0;
    // Senza durata dichiarata si assume un film medio: serve solo a capire
    // se la proiezione è ancora in corso, non a mostrare un orario di fine.
    const length = durationKnown ? parsedDuration : 110;
    let current = null;

    for (const group of movie.shows || []) {
      // Anche la programmazione di ieri può essere ancora in corso dopo mezzanotte.
      if (group.date !== today && group.date !== yesterday) continue;
      for (const entry of group.shows || []) {
        const start = wallClockDate(group.date, entry.time);
        const end = addMinutes(start, length);
        if (now < start || now >= end) continue;

        // Un film può essere in più sale: nella card conta una volta sola,
        // con la proiezione iniziata da più tempo.
        if (!current || start < current.start) {
          current = {
            movie,
            venue: venuesMap[group.venue] || { id: group.venue, name: group.venue, location: '' },
            room: entry.room || '',
            start,
            end,
            durationMinutes: length,
            durationKnown,
            progress: (now - start) / (end - start),
            minutesLeft: Math.max(0, Math.ceil((end - now) / 60000)),
          };
        }
      }
    }

    if (current) playing.push(current);
  }

  playing.sort((a, b) => a.start - b.start);
  return playing;
}

// Primo spettacolo futuro, utile per dare un orario all'empty state.
function nextScreening(movies, venuesMap, now = new Date()) {
  let next = null;
  for (const movie of movies) {
    for (const group of movie.shows || []) {
      for (const entry of group.shows || []) {
        const start = wallClockDate(group.date, entry.time);
        if (start <= now) continue;
        if (!next || start < next.start) {
          next = {
            start,
            date: group.date,
            time: entry.time,
            movie,
            venue: venuesMap[group.venue] || { id: group.venue, name: group.venue, location: '' },
          };
        }
      }
    }
  }
  return next;
}

function airingCardHtml(item) {
  const elapsed = Math.round(Math.min(1, Math.max(0, item.progress)) * 100);
  const venueLine = `${item.venue.name}${item.room ? ` · ${roomLabel(item.room)}` : ''}`;
  return `
    <a class="airing-item" href="#film-${escapeHtml(item.movie.id)}" data-airing-film="${escapeHtml(item.movie.id)}">
      <span class="airing-item-times">
        <strong>${escapeHtml(timeLabel(item.start))}</strong>
        <span class="airing-arrow" aria-hidden="true">&rarr;</span>
        <span class="airing-end">${item.durationKnown ? escapeHtml(timeLabel(item.end)) : 'in corso'}</span>
      </span>
      <span class="airing-item-title">${escapeHtml(item.movie.title)}</span>
      <span class="airing-item-venue">${escapeHtml(venueLine)}</span>
      ${item.durationKnown ? `
        <span class="airing-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${elapsed}" aria-label="Avanzamento della proiezione">
          <span style="width:${elapsed}%"></span>
        </span>
      ` : ''}
      <span class="airing-item-foot">
        <span>${item.durationKnown ? `Durata ${formatDuration(item.durationMinutes)}` : 'Durata n.d.'}</span>
        ${item.durationKnown ? `<span>${item.minutesLeft} min alla fine</span>` : ''}
      </span>
    </a>
  `;
}

function renderAiringNow() {
  if (!airingNowSection || !airingNowBody) return;
  const movies = scheduleData.movies || [];
  if (!movies.length) {
    airingNowSection.hidden = true;
    return;
  }

  const venuesMap = Object.fromEntries((scheduleData.venues || []).map((venue) => [venue.id, venue]));
  const now = new Date();
  const playing = airingNowFilms(movies, venuesMap, now);
  airingNowSection.hidden = false;

  if (airingNowStatus) {
    airingNowStatus.textContent = `${timeLabel(now)} · ${playing.length ? `${playing.length} film in corso` : 'nessun film in corso'}`;
  }

  if (!playing.length) {
    const next = nextScreening(movies, venuesMap, now);
    const nextDay = next ? formatDayLabel(next.date) : '';
    airingNowBody.innerHTML = `
      <div class="airing-empty">
        <span class="airing-empty-mark" aria-hidden="true">&ndash;</span>
        <div class="airing-empty-copy">
          <p class="airing-empty-title">Nessuno spettacolo in corso</p>
          <p class="airing-empty-next">${next
            ? `Il prossimo inizia ${nextDay === 'Oggi' ? 'oggi' : nextDay} alle <strong>${escapeHtml(next.time)}</strong> · ${escapeHtml(next.venue.name)}`
            : 'La programmazione riprende con le prossime date annunciate.'}</p>
        </div>
      </div>
    `;
    return;
  }

  const visible = playing.slice(0, window.matchMedia('(max-width: 699px)').matches ? 1 : 3);
  const hidden = playing.length - visible.length;
  airingNowBody.innerHTML = `
    <div class="airing-grid">${visible.map(airingCardHtml).join('')}</div>
    ${hidden ? `<p class="airing-more">+${hidden} ${hidden === 1 ? 'altro film in corso' : 'altri film in corso'}</p>` : ''}
  `;
}

// Dal banner alla scheda del film, anche se una vista o un filtro la nascondono.
function revealFilm(movieId) {
  const needsViewSwitch = currentView !== 'movies';
  currentView = 'movies';
  $$('.view-pill').forEach((button) => {
    const active = button.dataset.view === 'movies';
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (needsViewSwitch) render();

  if (!document.getElementById(`film-${movieId}`)) {
    if (searchInput) searchInput.value = '';
    if (venueFilter) venueFilter.value = 'all';
    if (genreFilter) genreFilter.value = 'all';
    $$('.chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.chip === 'all'));
    activeChip = 'all';
    render();
  }

  const card = document.getElementById(`film-${movieId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.remove('is-highlighted');
  void card.offsetWidth;
  card.classList.add('is-highlighted');
  window.setTimeout(() => card.classList.remove('is-highlighted'), 1800);
}

// ==========================================
// VISTA 1: Catalogo per Film (Card Espandibili)
// ==========================================
function renderMoviesCatalogView(movies, venuesMap, selectedVenue) {
  const todayString = getTodayString();
  const totalShows = movies.reduce((sum, movie) => sum
    + catalogSelection(movie, selectedVenue, todayString).shows.reduce((total, group) => total + group.shows.length, 0), 0);
  resultSummary.innerHTML = `<strong>${movies.length}</strong> ${movies.length === 1 ? 'film in cartellone' : 'film in cartellone'} <span>&middot;</span> <strong>${totalShows}</strong> spettacoli totali`;

  if (movies.length === 0) {
    emptyState.hidden = false;
    moviesGrid.hidden = true;
    return;
  }
  emptyState.hidden = true;
  moviesGrid.hidden = false;
  moviesGrid.classList.toggle('poster-movie-grid', movieLayout === 'grid');
  moviesGrid.classList.toggle('movie-grid', movieLayout === 'grid');

  // Griglia e lista usano lo stesso markup: cambia solo il layout CSS.
  moviesGrid.innerHTML = movies.map((movie) => catalogCardHtml(movie, { venuesMap, selectedVenue, todayString })).join('');
}

function catalogSelection(movie, selectedVenue, todayString) {
  const venueShows = (movie.shows || []).filter((s) => matchesVenue(s.venue, selectedVenue));
  const venueProgramming = movieProgramming(movie).filter((item) => matchesVenue(item.venue, selectedVenue));
  const now = new Date();
  const relevantShows = venueShows.filter((group) => periodDateMatches(group.date)).map((group) => ({
      ...group,
      shows: group.shows.filter((entry) => (showPastShowsToday || wallClockDate(group.date, entry.time) >= now)
        && (activeChip !== 'tonight' || entry.time >= '18:00')),
    })).filter((group) => group.shows.length);
  const relevantProgramming = venueProgramming.filter((item) => periodDateMatches(item.date)).filter((item) =>
    relevantShows.some((group) => group.date === item.date && group.venue === item.venue)
    || (activeChip !== 'tonight' && !venueShows.some((group) => group.date === item.date && group.venue === item.venue && group.shows.length))
  );
  return { shows: relevantShows, programming: relevantProgramming };
}

function catalogCardHtml(movie, { venuesMap, selectedVenue, todayString }) {
  return movieCardHtml(movie, { venuesMap, ...catalogSelection(movie, selectedVenue, todayString) });
}

function movieCardHtml(movie, { venuesMap, shows, programming, dayDate = '' }) {
  const isFav = favorites.has(movie.id);
  const cardKey = `${dayDate ? 'day' : 'movies'}-${movie.id}`;
  const panelId = `schedule-${cardKey}`;
  const isExpanded = expandedMovies.has(cardKey);
  const venueIds = [...new Set(programming.map((item) => item.venue))];
  const dates = [...new Set(programming.map((item) => item.date))].sort((a, b) => parseDate(a) - parseDate(b));
  const durationText = cleanDuration(movie.duration);
  const showCount = shows.reduce((sum, group) => sum + group.shows.length, 0);
  const next = nextShowtime(shows, movie.duration);
  const first = shows.flatMap((group) => group.shows.map((entry) => ({
    ...entry, date: group.date, venue: group.venue,
  }))).sort((a, b) => wallClockDate(a.date, a.time) - wallClockDate(b.date, b.time))[0];
  const preview = next || first;
  const previewTitle = next ? 'Prossimo spettacolo' : preview ? 'Spettacolo iniziato' : 'Data annunciata';
  const previewDate = preview ? formatDayLabel(preview.date) : dates.length ? formatDayLabel(dates[0]) : 'Orari in arrivo';
  const previewVenue = preview ? (venuesMap[preview.venue]?.name || preview.venue) : 'Orari non ancora pubblicati';
  const fullProgramming = movieProgramming(movie).filter((item) => matchesVenue(item.venue));
  const publishedDates = [...new Set(fullProgramming.map((item) => item.date))].sort((a, b) => parseDate(a) - parseDate(b));
  const age = Date.now() - Date.parse(movie.firstSeenAt);
  const state = movie.releaseDateIT > dateString(new Date()).split('/').reverse().join('-') ? 'Prossimamente'
    : age >= 0 && age < 7 * 86400000 ? 'Nuovo sul sito' : '';

  return `
    <article class="movie-catalog-card ${dayDate ? 'day-card' : ''} ${isExpanded ? 'is-expanded' : ''}"
      id="${dayDate ? 'day-' : ''}film-${escapeHtml(movie.id)}" data-movie-id="${escapeHtml(movie.id)}"
      data-card-key="${escapeHtml(cardKey)}" style="view-transition-name: film-${escapeHtml(cardKey)}">
      <div class="movie-card-body">
        ${renderPosterLink(movie, { panelId, isExpanded })}

        <div class="movie-card-details">
          <div class="movie-title-row">
            <span class="movie-state">${escapeHtml(state)}</span>
            <h3 class="movie-title" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</h3>
          </div>
          <div class="badge-wrap card-facts">
            <span class="film-duration">${escapeHtml(durationText || 'Durata n.d.')}</span>
            <span class="card-genres">${escapeHtml((movie.genres || []).slice(0, 2).join(' · '))}</span>
          </div>
          ${renderMovieRating(movie)}
          <details class="movie-extra">
            <summary>Trama, cast e dettagli</summary>
            <div class="movie-extra-copy">
              ${renderMovieMetadata(movie)}
              ${movie.releaseDateIT ? `<p><strong>Uscita / riedizione in Italia</strong> ${escapeHtml(readableISODate(movie.releaseDateIT))}</p>` : ''}
              ${movie.firstSeenAt ? `<p><strong>Sul sito dal</strong> ${escapeHtml(readableISODate(movie.firstSeenAt))}</p>` : ''}
              ${(movie.genres || []).length ? `<p><strong>Generi</strong> ${escapeHtml(movie.genres.join(', '))}</p>` : ''}
              ${(movie.tags || []).length ? `<p><strong>Info dalla sala</strong> ${escapeHtml(movie.tags.join(', '))}</p>` : ''}
              <p>${escapeHtml(movie.synopsis || 'Sinossi non disponibile.')}</p>
              ${movie.cast ? `<p class="movie-cast"><strong>Con</strong> ${escapeHtml(movie.cast)}</p>` : ''}
              ${renderRatingDetails(movie)}
            </div>
          </details>
          <div class="actions-wrap">
            <div class="movie-actions" role="group" aria-label="Trailer, condivisione e salvataggio di ${escapeHtml(movie.title)}">
              ${renderTrailerLink(movie)}
              ${renderShareMenu(movie)}
              <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}"
                aria-pressed="${isFav}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
              </button>
            </div>
          </div>
          <div class="card-preview">
            <span class="preview-label">${previewTitle}</span>
            <strong class="preview-time"><span class="preview-day">${escapeHtml(previewDate)}</span>${preview ? `<span class="preview-hour">${escapeHtml(preview.time)}</span>` : ''}</strong>
            <span class="preview-venue" title="${escapeHtml(previewVenue)}">${escapeHtml(previewVenue)}</span>
          </div>

          <button class="schedule-toggle" type="button" aria-expanded="${isExpanded}" aria-controls="${escapeHtml(panelId)}">
            <span>${isExpanded ? 'Chiudi scheda' : 'Vedi sale e orari'}</span>
            <svg class="cue-chevron ${isExpanded ? 'is-rotated' : ''}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      </div>

      <section class="movie-full-schedule-panel" id="${escapeHtml(panelId)}" aria-label="Sale e orari di ${escapeHtml(movie.title)}" ${isExpanded ? '' : 'hidden'}>
        <div class="panel-heading">
          <h4 tabindex="-1">${dayDate ? escapeHtml(formatDayLabel(dayDate)) : 'Scegli il cinema e l’orario'}</h4>
          <p>${showCount ? `${showCount} spettacoli · ${venueIds.length} cinema. Tocca un orario per biglietti, calendario e condivisione.` : 'Date annunciate: gli orari saranno pubblicati dal cinema.'}</p>
          ${publishedDates.length ? `<p class="published-until">In programma fino a ${escapeHtml(readableISODate(parseDate(publishedDates.at(-1)).toISOString()))}, secondo le date pubblicate. Possono essere aggiunti altri giorni.</p>` : ''}
          ${parseDurationMinutes(movie.duration) ? '<p class="end-time-note">Fine indicativa: durata del film, escluse pubblicità e intervallo.</p>' : ''}
        </div>
        ${venueIds.map((venueId) => {
          const cinema = { id: venueId, name: venueId, ...venuesMap[venueId] };
          const venueDates = dates.filter((date) => programming.some((item) => item.date === date && item.venue === venueId));
          return `<section class="venue-schedule-block" aria-label="${escapeHtml(cinema.name)}">
            <header class="venue-schedule-head">
              <div><h5>${escapeHtml(cinema.name)}</h5><p>${escapeHtml(cinema.location || '')}</p></div>
              <a href="${escapeHtml(movieUrlForVenue(movie, venueId) || '')}" target="_blank" rel="noreferrer">Scheda del cinema ↗</a>
            </header>
            ${venueDates.map((date) => {
              const entries = shows.filter((group) => group.date === date && group.venue === venueId).flatMap((group) => group.shows)
                .sort((a, b) => a.time.localeCompare(b.time));
              return `<div class="venue-date-row">
                <h6>${escapeHtml(formatDayLabel(date))}</h6>
                <div class="times-buttons">${entries.length ? entries.map((entry) => showtimeChipHtml(movie, cinema, date, entry, dayDate ? 'showtime' : 'showtime-btn',
                  date === getTodayString() && wallClockDate(date, entry.time) < new Date())).join('')
                  : '<p class="no-times-note">Orari e biglietti non ancora disponibili.</p>'}</div>
              </div>`;
            }).join('')}
          </section>`;
        }).join('')}
        <button class="panel-close" type="button" data-card-close>Chiudi scheda</button>
      </section>
    </article>
  `;
}

// ==========================================
// VISTA 2: Programmazione per Giorno
// ==========================================
function renderScheduleDayView(movies, venuesMap, dayDate) {
  const selectedVenue = venueFilter?.value || 'all';
  const isToday = dayDate === getTodayString();
  const now = new Date();

  // Conta gli spettacoli di oggi già iniziati
  let totalPastShows = 0;
  for (const movie of movies) {
    for (const show of movie.shows || []) {
      if (show.date === dayDate && matchesVenue(show.venue, selectedVenue)) {
        for (const entry of show.shows || []) {
          if (isToday && wallClockDate(dayDate, entry.time) < now) {
            totalPastShows += 1;
          }
        }
      }
    }
  }

  const visible = movies.map((movie) => {
    const matchingShows = (movie.shows || [])
      .filter((show) => show.date === dayDate && matchesVenue(show.venue, selectedVenue))
      .map((show) => {
        const enrichedShows = (show.shows || []).map((entry) => {
          const isPast = isToday && wallClockDate(dayDate, entry.time) < now;
          return { ...entry, isPast };
        });
        const activeShows = (!showPastShowsToday && isToday)
          ? enrichedShows.filter((e) => !e.isPast)
          : enrichedShows;
        return { ...show, shows: activeShows, allShows: enrichedShows };
      })
      .filter((show) => show.shows.length > 0);

    const matchingProgramming = movieProgramming(movie).filter((item) =>
      item.date === dayDate && matchesVenue(item.venue, selectedVenue)
      && (matchingShows.some((group) => group.venue === item.venue)
        || !movie.shows.some((group) => group.date === dayDate && group.venue === item.venue && group.shows.length))
    );
    return { ...movie, shows: matchingShows, dayProgramming: matchingProgramming };
  }).filter((movie) => {
    // Un film è visibile se ha spettacoli filtrati OPPURE date annunciate senza orari
    const hasActiveShows = movie.shows.some((s) => s.shows.length > 0);
    const hasAnnouncedWithoutShows = movie.dayProgramming.some(
      (item) => !(movie.shows || []).some((s) => s.venue === item.venue)
    );
    return hasActiveShows || hasAnnouncedWithoutShows;
  });

  const showCount = visible.reduce(
    (sum, movie) => sum + movie.shows.reduce((total, show) => total + show.shows.length, 0),
    0
  );
  const dayDisplay = formatDayLabel(dayDate);

  if (isToday) {
    if (!showPastShowsToday) {
      resultSummary.innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} con spettacoli da adesso &middot; <strong>${showCount}</strong> ${showCount === 1 ? 'proiezione rimanente' : 'proiezioni rimanenti'}`;
    } else {
      resultSummary.innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} per <strong>Oggi</strong> (tutti gli orari) &middot; <strong>${showCount}</strong> spettacoli totali`;
    }
  } else {
    resultSummary.innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} in sala per <strong>${dayDisplay}</strong> <span>&middot;</span> <strong>${showCount}</strong> spettacoli`;
  }

  if (visible.length === 0) {
    emptyState.hidden = false;
    filmList.hidden = true;
    return;
  }
  emptyState.hidden = true;
  filmList.hidden = false;
  filmList.classList.toggle('day-movie-grid', dayLayout === 'grid');
  filmList.classList.toggle('movie-grid', dayLayout === 'grid');

  const pastToggleHtml = (isToday && totalPastShows > 0) ? `
    <div class="past-shows-banner">
      <button type="button" class="past-shows-toggle ${showPastShowsToday ? 'is-active' : ''}" id="btn-toggle-past-shows">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>${showPastShowsToday
          ? `Nascondi ${totalPastShows} ${totalPastShows === 1 ? 'spettacolo già iniziato' : 'spettacoli già iniziati'}`
          : `Mostra anche ${totalPastShows} ${totalPastShows === 1 ? 'spettacolo già iniziato' : 'spettacoli già iniziati prima di ora'}`}</span>
      </button>
    </div>
  ` : '';

  filmList.innerHTML = pastToggleHtml + sortMovies(visible, scheduleSort).map((movie) => dayCardHtml(movie, { venuesMap, dayDate })).join('');
}

function dayCardHtml(movie, { venuesMap, dayDate }) {
  return movieCardHtml(movie, { venuesMap, shows: movie.shows, programming: movie.dayProgramming, dayDate });
}

// ==========================================
// Data Fetching & Boot
// ==========================================
async function loadSchedule({ fresh = false } = {}) {
  const button = $('#refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  resultSummary.textContent = 'Caricamento programmazione...';

  try {
    const url = fresh ? `data/schedule.json?ts=${Date.now()}` : 'data/schedule.json';
    const [response, infoResponse] = await Promise.all([
      fetch(url),
      fetch('data/venues-info.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    if (!response.ok) throw new Error(`Impossibile leggere la programmazione (${response.status})`);
    scheduleData = await response.json();
    venueInfo = infoResponse && typeof infoResponse === 'object' ? infoResponse : {};
    const venuesById = Object.fromEntries((scheduleData.venues || []).map((item) => [item.id, item]));
    const missingVenues = requiredVenues.filter((id) => !venuesById[id]);
    if (missingVenues.length || !(scheduleData.movies || []).length) {
      throw new Error('Programmazione incompleta: manca la programmazione di una o più sale. Riprova più tardi.');
    }
    renderVenuesInfo(scheduleData.venues);
    renderGenreOptions(scheduleData.movies);
    if (updatedAtEl) {
      updatedAtEl.textContent = `Aggiornato il ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduleData.updatedAt))}`;
    }
    render();
    renderAiringNow();
    detectFavoriteUpdates();
  } catch (error) {
    resultSummary.textContent = error.message;
    moviesGrid.hidden = true;
    filmList.hidden = true;
    emptyState.hidden = false;
    $('#empty-state h2').textContent = 'Programmazione non disponibile';
    $('#empty-msg').textContent = 'Si è verificato un errore durante il caricamento dei dati. Riprova tra poco.';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

// ==========================================
// Event Listeners
// ==========================================

// Switcher Viste (Per Film | Per Giorno)
$$('.view-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.view-pill').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    currentView = btn.dataset.view;
    if (currentView === 'schedule' && ['today', 'tonight', 'weekend'].includes(activeChip)) activeChip = 'all';
    render();
  });
});

// Quick Chips in "Per Film"
$$('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activeChip = chip.dataset.chip;
    if (['today', 'tonight', 'weekend', 'favorites'].includes(activeChip)) {
      currentView = 'movies';
      $$('.view-pill').forEach((button) => {
        const selected = button.dataset.view === currentView;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      });
    }
    render();
  });
});

// Click su Day strip in "Per Giorno"
if (daysNavStrip) {
  daysNavStrip.addEventListener('click', (e) => {
    const pill = e.target.closest('.day-strip-pill');
    if (pill) {
      selectedDate = pill.dataset.date;
      renderDaysStrip();
      render();
    }
  });
}

$$('[data-layout]').forEach((button) => {
  button.addEventListener('click', () => {
    dayLayout = button.dataset.layout;
    $$('[data-layout]').forEach((item) => {
      const active = item.dataset.layout === dayLayout;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  });
});

$$('[data-movie-layout]').forEach((button) => {
  button.addEventListener('click', () => {
    movieLayout = button.dataset.movieLayout;
    $$('[data-movie-layout]').forEach((item) => {
      const active = item.dataset.movieLayout === movieLayout;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  });
});

// Pulsante preferiti in Topbar
function showFavoritesView() {
  currentView = 'movies';
  $$('.view-pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === 'movies');
    b.setAttribute('aria-selected', String(b.dataset.view === 'movies'));
  });
  $$('.chip').forEach((c) => c.classList.remove('active'));
  const favChip = $('.chip[data-chip="favorites"]');
  if (favChip) favChip.classList.add('active');
  activeChip = 'favorites';
  render();
}

if (favToggleBtn) {
  favToggleBtn.addEventListener('click', showFavoritesView);
}

// Input filtri
if (searchInput) searchInput.addEventListener('input', render);
if (venueFilter) venueFilter.addEventListener('change', () => {
  writeStore('fp_venue_filter', venueFilter.value);
  if (venueFilter.value === 'preferred' && !preferredVenues.size) $('#venue-preferences').open = true;
  render();
});
if (genreFilter) genreFilter.addEventListener('change', render);
$('#movie-sort')?.addEventListener('change', (event) => {
  const mode = event.target.value;
  if (!sortModes.has(mode)) return;
  if (currentView === 'movies') { moviesSort = mode; writeStore('fp_movies_sort', mode); }
  else { scheduleSort = mode; writeStore('fp_schedule_sort', mode); }
  render();
});
$('#preferred-venues')?.addEventListener('change', (event) => {
  const input = event.target.closest('input');
  if (!input) return;
  if (input.checked) preferredVenues.add(input.value);
  else preferredVenues.delete(input.value);
  writeStore('fp_preferred_venues', [...preferredVenues]);
  updatePreferredVenues();
  render();
});
$('#preferred-venues-apply')?.addEventListener('click', () => {
  venueFilter.value = 'preferred';
  writeStore('fp_venue_filter', 'preferred');
  $('#venue-preferences').open = false;
  render();
});

$('#refresh').addEventListener('click', () => loadSchedule({ fresh: true }));

// Esportazione calendario
$('#calendar-open')?.addEventListener('click', openCalendarDialog);
$('#calendar-close')?.addEventListener('click', closeCalendarDialog);
$('#calendar-cancel')?.addEventListener('click', closeCalendarDialog);
$('#calendar-download')?.addEventListener('click', downloadCalendar);
calendarDialog?.addEventListener('click', (event) => {
  if (event.target !== calendarDialog) return;
  const rect = calendarDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCalendarDialog();
});
$('#calendar-export-mode')?.addEventListener('change', updateCalendarSummary);
$('#calendar-venues')?.addEventListener('change', () => {
  writeStore('fp_calendar_venues', selectedCalendarVenues());
  updateCalendarSummary();
});
$('#calendar-select-all')?.addEventListener('click', () => {
  const select = selectedCalendarVenues().length !== scheduleData.venues.length;
  $$('#calendar-venues input').forEach((input) => { input.checked = select; });
  writeStore('fp_calendar_venues', selectedCalendarVenues());
  updateCalendarSummary();
});
$('#calendar-copy')?.addEventListener('click', async () => {
  const url = calendarFeedUrl();
  if (url) showToast(await copyToClipboard(url) ? 'Link del calendario copiato' : 'Copia non riuscita. Riprova dal browser.');
});
$('#calendar-day')?.addEventListener('change', updateCalendarSummary);

// Avviso "nuovi orari" dei film salvati
$('#saved-updates-view')?.addEventListener('click', () => {
  clearSavedUpdates();
  showFavoritesView();
  $('.schedule-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#saved-updates-dismiss')?.addEventListener('click', clearSavedUpdates);

$('#clear-filters').addEventListener('click', () => {
  if (searchInput) searchInput.value = '';
  if (venueFilter) venueFilter.value = 'all';
  writeStore('fp_venue_filter', 'all');
  if (genreFilter) genreFilter.value = 'all';
  $$('.chip').forEach((c) => c.classList.remove('active'));
  $('[data-chip="all"]').classList.add('active');
  activeChip = 'all';
  render();
});

// Azioni del menu orario (aperto cliccando un orario)
if (showtimeMenu) showtimeMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-time-action]');
  if (!item) return;
  const action = item.dataset.timeAction;
  const event = activeShowtime;
  const button = activeShowtimeButton;
  if (button) button.focus({ preventScroll: true });
  closeShowtimeMenu();
  if (!event) return;

  if (action === 'open' && event.eventUrl) {
    window.open(event.eventUrl, '_blank', 'noopener,noreferrer');
  } else if (action === 'share') {
    shareShowtime(event);
  } else if (action === 'calendar') {
    shareCalendarEvent(event);
  }
});

document.addEventListener('keydown', (e) => {
  if (showtimeMenu && !showtimeMenu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const items = [...showtimeMenu.querySelectorAll('[role="menuitem"]')];
    const current = items.indexOf(document.activeElement);
    const index = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[index]?.focus({ preventScroll: true });
    return;
  }
  if (e.key !== 'Escape' || !showtimeMenu || showtimeMenu.hidden) return;
  const button = activeShowtimeButton;
  if (button) button.focus({ preventScroll: true });
  closeShowtimeMenu();
});

// Il menu è ancorato alla pagina: se si scorre o ridimensiona va richiuso.
window.addEventListener('scroll', () => closeShowtimeMenu(), { passive: true, capture: true });
window.addEventListener('resize', () => {
  closeShowtimeMenu();
  renderAiringNow();
});

function setMovieCardExpanded(card, expanded, trigger) {
  const panel = card.querySelector('.movie-full-schedule-panel');
  if (!panel) return;
  if (expanded) cardOpeners.set(card, trigger);
  const apply = () => {
    card.classList.toggle('is-expanded', expanded);
    panel.hidden = !expanded;
    const poster = card.querySelector('[data-card-open]');
    poster.disabled = expanded;
    poster.setAttribute('aria-expanded', String(expanded));
    const toggle = card.querySelector('.schedule-toggle');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.querySelector('span').textContent = expanded ? 'Chiudi scheda' : 'Vedi sale e orari';
    toggle.querySelector('.cue-chevron').classList.toggle('is-rotated', expanded);
    if (expanded) expandedMovies.add(card.dataset.cardKey);
    else expandedMovies.delete(card.dataset.cardKey);
  };
  const reveal = () => {
    if (expanded) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.querySelector('h4')?.focus({ preventScroll: true });
    } else {
      const opener = cardOpeners.get(card) || card.querySelector('.schedule-toggle');
      opener.focus({ preventScroll: true });
      const rect = card.getBoundingClientRect();
      if (rect.top < $('.masthead').getBoundingClientRect().bottom || rect.bottom > innerHeight) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };
  const transition = withViewTransition(apply);
  if (transition) transition.finished.then(reveal).catch(() => {});
  else requestAnimationFrame(reveal);
}

// In-place accordion card toggle (con scroll fluido centrato)
document.addEventListener('click', (e) => {
  // Dal banner "Ora in sala" salta alla scheda del film
  const airingLink = e.target.closest('[data-airing-film]');
  if (airingLink) {
    e.preventDefault();
    revealFilm(airingLink.dataset.airingFilm);
    return;
  }

  // Dalla card cinema agli orari di quella sala
  const venueBtn = e.target.closest('[data-venue-schedule]');
  if (venueBtn) {
    showVenueSchedule(venueBtn.dataset.venueSchedule);
    return;
  }

  // Toggle spettacoli passati di oggi in vista Per Giorno
  const pastToggle = e.target.closest('#btn-toggle-past-shows');
  if (pastToggle) {
    showPastShowsToday = !showPastShowsToday;
    render();
    return;
  }

  // 0. Apre il menu azioni di un singolo orario
  const showtimeBtn = showtimeMenu ? e.target.closest('[data-showtime]') : null;
  if (showtimeBtn) {
    if (activeShowtimeButton === showtimeBtn && !showtimeMenu.hidden) closeShowtimeMenu();
    else openShowtimeMenu(showtimeBtn);
    return;
  }
  if (e.target.closest('#showtime-menu')) return;
  closeShowtimeMenu();

  // 1. Gestione stella preferiti
  const favBtn = e.target.closest('.fav-star-btn');
  if (favBtn) {
    e.stopPropagation();
    const movieId = favBtn.dataset.favId;
    if (favorites.has(movieId)) {
      favorites.delete(movieId);
      favBtn.classList.remove('is-favorite');
      forgetFavoriteSnapshot(movieId);
      showToast('Film rimosso dai salvati');
    } else {
      favorites.add(movieId);
      favBtn.classList.add('is-favorite');
      captureFavoriteSnapshot(movieId);
      showToast('Film salvato nei preferiti');
    }
    saveFavorites();
    $$(`[data-fav-id="${CSS.escape(movieId)}"]`).forEach((button) => {
      const saved = favorites.has(movieId);
      button.classList.toggle('is-favorite', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', saved ? 'Rimuovi dai salvati' : 'Salva film');
      button.title = saved ? 'Rimuovi dai salvati' : 'Salva film';
    });
    if (activeChip === 'favorites') {
      render();
    }
    return;
  }

  // 2. Condivide la locandina insieme al riepilogo
  const shareFilmBtn = e.target.closest('[data-share-film]');
  if (shareFilmBtn) {
    e.stopPropagation();
    const movieId = shareFilmBtn.dataset.shareFilm;
    const movie = scheduleData.movies.find((item) => item.id === movieId);
    if (movie) shareFilmPoster(movie);
    return;
  }

  // 3. Se clicca su un link ordinario (es. biglietto o locandina), lascia navigare senza chiudere la card
  if (e.target.closest('a')) {
    return;
  }

  const card = e.target.closest('.movie-catalog-card');
  if (card && e.target.closest('[data-card-open], .schedule-toggle, [data-card-close]')) {
    const expanded = !e.target.closest('[data-card-close]') && !card.classList.contains('is-expanded');
    setMovieCardExpanded(card, expanded, e.target.closest('button'));
    return;
  }

  // I click nella scheda aperta non richiudono gli orari.
  if (e.target.closest('.movie-full-schedule-panel')) {
    return;
  }
});

// Scorciatoie del manifest (?view=schedule / ?view=favorites): lo stato
// iniziale va impostato prima del primo render, senza aspettare i dati.
function applyBootView() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'schedule') {
    currentView = 'schedule';
    selectedDate = getTodayString();
    $$('.view-pill').forEach((button) => {
      const active = button.dataset.view === 'schedule';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  } else if (view === 'favorites') {
    currentView = 'movies';
    $$('.view-pill').forEach((button) => {
      const active = button.dataset.view === 'movies';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $$('.chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.chip === 'favorites'));
    activeChip = 'favorites';
  }
}

// Boot
applyBootView();
updateFavoritesBadge();
loadSchedule();

// Il banner "Ora in sala" e l'orologio devono restare veri anche con la
// pagina aperta a lungo, senza ricaricare la programmazione.
window.setInterval(() => {
  renderAiringNow();
  updateVenueTodayTexts();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    renderAiringNow();
    updateVenueTodayTexts();
  }
});
