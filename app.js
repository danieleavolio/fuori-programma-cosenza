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

// State
let scheduleData = { venues: [], movies: [], updatedAt: '' };
let currentView = 'movies'; // 'movies' | 'schedule'
let activeChip = 'all'; // 'all' | 'today' | 'favorites'
let selectedDate = '';
let movieLayout = 'grid';
let dayLayout = 'grid';
const expandedMovies = new Set();
let favorites = loadFavorites();

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
    <button class="btn-share-icon" type="button" aria-label="Condividi ${escapeHtml(movie.title)} con locandina e orari" data-share-film="${escapeHtml(movie.id)}">
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
  try {
    const file = await getPosterFile(movie);
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      showToast('La condivisione di immagini non è supportata da questo browser');
      return;
    }
    const text = formatFilmShareMessage(movie);
    await navigator.share({ title: movie.title, text, files: [file] });
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Impossibile condividere la locandina');
  }
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

function buildCalendarEvent(event) {
  const minutes = durationMinutes(event.eventDuration);
  const start = calendarDateTime(event.eventDate, event.eventTime);
  const end = calendarDateTime(event.eventDate, event.eventTime, minutes);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${event.eventDate.replace(/\D/g, '')}-${event.eventTime.replace(/\D/g, '')}-${Date.now().toString(36)}@fuori-programma-cosenza`;
  const venueLine = `${event.eventVenue}${event.eventRoom ? ` (${event.eventRoom})` : ''}`;
  const location = [venueLine, event.eventLocation].filter(Boolean).join(', ');
  const description = [
    `Film: ${event.eventTitle}`,
    `Cinema: ${event.eventVenue}${event.eventLocation ? ` — ${event.eventLocation}` : ''}`,
    event.eventRoom ? `Sala: ${event.eventRoom}` : '',
    `Inizio: ${event.eventDate} alle ${event.eventTime}`,
    `Durata: ${minutes} minuti`,
    event.eventUrl ? `Biglietti: ${event.eventUrl}` : '',
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fuori Programma Cosenza//Programmazione cinema//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
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
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Rome:${start}`,
    `DTEND;TZID=Europe/Rome:${end}`,
    `SUMMARY:${icsText(`${event.eventTitle} — ${event.eventVenue}`)}`,
    `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(event.eventUrl ? [`URL:${event.eventUrl}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT45M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(`${event.eventTitle} tra 45 minuti`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.map(icsFold).join('\r\n')}\r\n`;
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
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ files: [file], title: `${event.eventTitle} — ${event.eventVenue}` });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
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
    `Durata: ${minutes} minuti`,
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

function showtimeChipHtml(movie, cinema, dateStr, entry, className) {
  return `
    <button class="${className}" type="button" data-showtime aria-haspopup="menu" aria-controls="showtime-menu" aria-expanded="false"
      data-event-title="${escapeHtml(movie.title)}"
      data-event-date="${escapeHtml(dateStr)}"
      data-event-time="${escapeHtml(entry.time)}"
      data-event-duration="${escapeHtml(cleanDuration(movie.duration))}"
      data-event-venue="${escapeHtml(cinema.name)}"
      data-event-location="${escapeHtml(cinema.location || '')}"
      data-event-room="${escapeHtml(entry.room ? roomLabel(entry.room) : '')}"
      data-event-url="${escapeHtml(entry.url || movie.url)}"
      title="Azioni per ${escapeHtml(movie.title)} alle ${escapeHtml(entry.time)}">
      <strong>${escapeHtml(entry.time)}</strong>
      <small>${entry.room ? escapeHtml(roomLabel(entry.room)) : 'Biglietti'}</small>
      <svg class="time-cue" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
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
function renderVenuesInfo(venues) {
  if (venueFilter) {
    venueFilter.innerHTML = '<option value="all">Tutte le sale</option>' + venues.map((venue) => `<option value="${escapeHtml(venue.id)}">${escapeHtml(venue.name)}</option>`).join('');
  }
  
  const cinemaList = $('#cinema-list');
  if (cinemaList) {
    const statusLabels = { available: 'Fonte attiva', stale: 'Dati non aggiornati', unavailable: 'Fonte non disponibile' };
    cinemaList.innerHTML = venues.map((venue) => `
      <article class="cinema-item">
        <div>
          <span class="cinema-name">${escapeHtml(venue.name)}</span>
          <span class="cinema-location">${escapeHtml(venue.location)}</span>
        </div>
        <div>
          <span class="cinema-status ${escapeHtml(venue.status || 'unavailable')}">${escapeHtml(statusLabels[venue.status] || statusLabels.unavailable)}</span>
          ${venue.source ? `<a class="cinema-source" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">${escapeHtml(venue.sourceName || 'Biglietteria')} &rarr;</a>` : ''}
        </div>
      </article>
    `).join('');
  }
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

function renderMovieMetadata(movie) {
  const details = [];
  if (movie.director) details.push(`Regia: ${escapeHtml(movie.director)}`);
  if (movie.year) details.push(escapeHtml(movie.year));
  // Sempre presente: nella griglia occupa un'altezza fissa, così le card
  // restano allineate anche quando la regia non è nota.
  return `<p class="movie-credits">${details.join(' · ')}</p>`;
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

function renderPosterLink(movie, venueIds, venuesMap, selectedVenue = 'all') {
  const availableVenues = [...new Set(venueIds)].filter((venueId) => movie.venueUrls?.[venueId]);
  const targetVenue = selectedVenue !== 'all' && availableVenues.includes(selectedVenue)
    ? selectedVenue
    : availableVenues.length === 1 ? availableVenues[0] : '';
  const image = movie.poster
    ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="" loading="lazy" />`
    : `<span class="poster poster-missing" aria-hidden="true">${escapeHtml(movie.title.slice(0, 1))}</span>`;

  if (targetVenue) {
    const venueName = venuesMap[targetVenue]?.name || 'il cinema';
    return `<a class="poster-link" href="${escapeHtml(movieUrlForVenue(movie, targetVenue))}" target="_blank" rel="noreferrer" aria-label="Apri la scheda di ${escapeHtml(movie.title)} presso ${escapeHtml(venueName)} in una nuova scheda">${image}</a>`;
  }

  if (!availableVenues.length) {
    return `<a class="poster-link" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer" aria-label="Apri la scheda ufficiale di ${escapeHtml(movie.title)} in una nuova scheda">${image}</a>`;
  }

  return `
    <details class="poster-venue-menu">
      <summary class="poster-link" aria-label="Scegli il cinema per aprire la scheda di ${escapeHtml(movie.title)}">${image}</summary>
      <div class="poster-venue-options">
        ${availableVenues.map((venueId) => `
          <a href="${escapeHtml(movieUrlForVenue(movie, venueId))}" target="_blank" rel="noreferrer">
            ${escapeHtml(venuesMap[venueId]?.name || venueId)}
          </a>
        `).join('')}
      </div>
    </details>
  `;
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

  if (currentView === 'movies') {
    controlsPerFilm.hidden = false;
    controlsPerDay.hidden = true;
    moviesGrid.hidden = false;
    filmList.hidden = true;

    // Filter movies for "Per Film"
    const filteredMovies = scheduleData.movies.filter((movie) => {
      // 1. Text Search
      const matchesTitle = movie.title.toLocaleLowerCase('it').includes(query);
      const matchesSynopsis = (movie.synopsis || '').toLocaleLowerCase('it').includes(query);
      const matchesMetadata = [movie.director, movie.year, ...(movie.genres || [])]
        .some((value) => (value || '').toLocaleLowerCase('it').includes(query));
      const matchesAnyVenue = movieProgramming(movie).some((item) => (venuesMap[item.venue]?.name || '').toLocaleLowerCase('it').includes(query));
      if (!matchesTitle && !matchesSynopsis && !matchesMetadata && !matchesAnyVenue) return false;

      // 2. Venue Filter
      if (selectedVenue !== 'all' && !movieProgramming(movie).some((item) => item.venue === selectedVenue)) {
        return false;
      }

      if (selectedGenre !== 'all' && !(movie.genres || []).includes(selectedGenre)) {
        return false;
      }

      // 3. Quick Chips
      if (activeChip === 'today') {
        if (!movieProgramming(movie).some((item) => item.date === todayString)) return false;
      } else if (activeChip === 'favorites') {
        if (!favorites.has(movie.id)) return false;
      }

      return true;
    });

    renderMoviesCatalogView(filteredMovies, venuesMap, selectedVenue);
  } else if (currentView === 'schedule') {
    controlsPerFilm.hidden = true;
    controlsPerDay.hidden = false;
    moviesGrid.hidden = true;
    filmList.hidden = false;

    renderDaysStrip();
    renderScheduleDayView(scheduleData.movies, venuesMap, selectedDate);
  }
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

  const visible = playing.slice(0, 3);
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
  const totalShows = movies.reduce((sum, movie) => sum + movie.shows
    .filter((show) => (selectedVenue === 'all' || show.venue === selectedVenue)
      && (activeChip !== 'today' || show.date === todayString))
    .reduce((total, show) => total + show.shows.length, 0), 0);
  resultSummary.innerHTML = `<strong>${movies.length}</strong> ${movies.length === 1 ? 'film in cartellone' : 'film in cartellone'} <span>&middot;</span> <strong>${totalShows}</strong> spettacoli totali`;

  if (movies.length === 0) {
    emptyState.hidden = false;
    moviesGrid.hidden = true;
    return;
  }
  emptyState.hidden = true;
  moviesGrid.hidden = false;
  moviesGrid.classList.toggle('poster-movie-grid', movieLayout === 'grid');

  // Griglia e lista usano lo stesso markup: cambia solo il layout CSS.
  moviesGrid.innerHTML = movies.map((movie) => catalogCardHtml(movie, { venuesMap, selectedVenue, todayString })).join('');
}

function catalogCardHtml(movie, { venuesMap, selectedVenue, todayString }) {
  const isFav = favorites.has(movie.id);
  const isExpanded = expandedMovies.has(movie.id);

  const venueShows = movie.shows.filter((s) => selectedVenue === 'all' || s.venue === selectedVenue);
  const venueProgramming = movieProgramming(movie).filter((item) => selectedVenue === 'all' || item.venue === selectedVenue);
  const relevantShows = activeChip === 'today' ? venueShows.filter((s) => s.date === todayString) : venueShows;
  const relevantProgramming = activeChip === 'today' ? venueProgramming.filter((item) => item.date === todayString) : venueProgramming;

  const venueIds = [...new Set(relevantProgramming.map((item) => item.venue))];
  const venuesPlaying = venueIds.map((id) => venuesMap[id] || { id, name: id, location: '' });
  const datesAvailable = [...new Set(relevantProgramming.map((item) => item.date))].sort((a, b) => parseDate(a) - parseDate(b));
  const durationText = cleanDuration(movie.duration);
  const nextShow = nextShowtime(relevantShows, movie.duration);
  const nextShowVenue = nextShow ? (venuesMap[nextShow.venue] || { name: nextShow.venue }) : null;

  const allMovieDates = [...new Set(venueProgramming.map((item) => item.date))];
  const isOnlyToday = allMovieDates.length === 1 && allMovieDates[0] === todayString;
  const showCount = relevantShows.reduce((sum, show) => sum + show.shows.length, 0);

  return `
    <article class="movie-catalog-card ${isExpanded ? 'is-expanded' : ''}" id="film-${escapeHtml(movie.id)}" data-movie-id="${escapeHtml(movie.id)}" style="view-transition-name: film-${escapeHtml(movie.id)}">
      <div class="movie-card-body">
        ${renderPosterLink(movie, venueIds, venuesMap, selectedVenue)}

        <div class="movie-card-details">
          <div class="movie-card-meta">
            <div class="movie-badges">
              ${isOnlyToday ? `<span class="badge-last-chance">Solo oggi</span>` : ''}
              ${durationText ? `<span class="film-duration" title="Durata del film">${escapeHtml(durationText)}</span>` : ''}
              ${(movie.tags || []).map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('')}
              ${(movie.genres || []).map((genre) => `<span class="badge-tag">${escapeHtml(genre)}</span>`).join('')}
            </div>
            <div class="movie-actions">
              ${renderShareMenu(movie)}
              <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
                <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
              </button>
            </div>
          </div>
          <div class="movie-title-row">
            <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
          </div>
          <p class="movie-synopsis">${movie.synopsis ? escapeHtml(movie.synopsis) : 'Sinossi non disponibile.'}</p>
          ${renderMovieMetadata(movie)}

          <div class="movie-facts">
            <div class="venues-summary-block">
              <span class="meta-label">IN SALA</span>
              <div class="venue-pill-list">
                ${venuesPlaying.length ? venuesPlaying.map((v) => `
                  <span class="cinema-pill">${escapeHtml(v.name)} <small>${escapeHtml(v.location)}</small></span>
                `).join('') : '<span class="cinema-pill none">Nessun cinema con i filtri attuali</span>'}
              </div>
            </div>

            <div class="days-summary-block">
              <span class="meta-label">DATE IN PROGRAMMAZIONE</span>
              <div class="days-chip-list">
                ${datesAvailable.map((d) => `<span class="date-chip">${escapeHtml(formatDayLabel(d))}</span>`).join('')}
              </div>
            </div>
          </div>

          ${nextShow ? `
            <div class="next-show-block">
              <span class="meta-label">PROSSIMO SPETTACOLO</span>
              <span class="next-show-line">
                <span class="next-show-times">
                  <strong>${escapeHtml(formatDayLabel(nextShow.date))} · ${escapeHtml(nextShow.time)}</strong>
                  ${nextShow.endsAt ? `<span class="next-show-arrow" aria-hidden="true">&rarr;</span><span class="next-show-end">${escapeHtml(timeLabel(nextShow.endsAt))}</span>` : ''}
                  ${nextShow.duration ? `<span class="next-show-duration">${escapeHtml(formatDuration(nextShow.duration))}</span>` : `<span class="next-show-duration is-missing">durata n.d.</span>`}
                </span>
                <span class="next-show-meta">
                  <span class="next-show-venue">${escapeHtml(nextShowVenue.name)}</span>
                  ${nextShow.upcomingCount > 1 ? `<span class="next-show-more">+${nextShow.upcomingCount - 1}</span>` : ''}
                </span>
              </span>
            </div>
          ` : ''}

          <button class="schedule-toggle" type="button" aria-expanded="${isExpanded}" aria-controls="schedule-${escapeHtml(movie.id)}" data-schedule-id="${escapeHtml(movie.id)}">
            <span>${isExpanded ? 'Nascondi gli orari' : `Date, orari e biglietti · ${showCount}`}</span>
            <svg class="cue-chevron ${isExpanded ? 'is-rotated' : ''}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      </div>

      <div class="movie-full-schedule-panel" id="schedule-${escapeHtml(movie.id)}" ${isExpanded ? '' : 'hidden'}>
        <div class="schedule-panel-inner">
          <div class="panel-header-line">
            <span class="schedule-panel-title">PROGRAMMAZIONE E ORARI DISPONIBILI</span>
          </div>
          ${datesAvailable.length ? `
            <div class="dates-horizontal-grid">
              ${datesAvailable.map((dateStr) => {
                const dShows = relevantShows.filter((s) => s.date === dateStr);
                const dProgramming = relevantProgramming.filter((item) => item.date === dateStr);
                const venuesWithShows = new Set(dShows.map((show) => show.venue));
                const announcedOnly = dProgramming.filter((item) => !venuesWithShows.has(item.venue));
                const isToday = dateStr === todayString;
                return `
                  <div class="date-schedule-group">
                    <div class="date-group-header">
                      <span class="date-badge">${isToday ? 'Oggi' : italianDate(parseDate(dateStr))}</span>
                      <span class="date-full-text">${dateStr}</span>
                    </div>
                    <div class="date-venues-grid">
                      ${announcedOnly.map((item) => {
                        const cinema = venuesMap[item.venue] || { name: item.venue, location: '' };
                        return `<div class="venue-time-block"><div class="venue-time-header"><span class="venue-name">${escapeHtml(cinema.name)}</span><span class="venue-loc">${escapeHtml(cinema.location)}</span></div><p class="no-times-note">Data annunciata. Orari e biglietti non ancora disponibili.</p></div>`;
                      }).join('')}
                      ${dShows.map((s) => {
                        const cinema = venuesMap[s.venue] || { name: s.venue, location: '' };
                        return `
                          <div class="venue-time-block">
                            <div class="venue-time-header"><span class="venue-name">${escapeHtml(cinema.name)}</span><span class="venue-loc">${escapeHtml(cinema.location)}</span></div>
                            <div class="times-buttons">
                              ${s.shows.map((entry) => `
                                <div class="time-item-wrapper">
                                  ${showtimeChipHtml(movie, cinema, dateStr, entry, 'showtime-btn')}
                                </div>
                              `).join('')}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<p class="no-times-note">Nessuno spettacolo corrisponde ai filtri selezionati.</p>'}
        </div>
      </div>
    </article>
  `;
}

// ==========================================
// VISTA 2: Programmazione per Giorno
// ==========================================
function renderScheduleDayView(movies, venuesMap, dayDate) {
  const selectedVenue = venueFilter?.value || 'all';
  const visible = movies.map((movie) => {
    const matchingShows = movie.shows.filter((show) => show.date === dayDate && (selectedVenue === 'all' || show.venue === selectedVenue));
    const matchingProgramming = movieProgramming(movie).filter((item) => item.date === dayDate && (selectedVenue === 'all' || item.venue === selectedVenue));
    return { ...movie, shows: matchingShows, dayProgramming: matchingProgramming };
  }).filter((movie) => movie.dayProgramming.length > 0);

  const showCount = visible.reduce((sum, movie) => sum + movie.shows.reduce((total, show) => total + show.shows.length, 0), 0);
  const dayDisplay = formatDayLabel(dayDate);
  resultSummary.innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} in sala per <strong>${dayDisplay}</strong> <span>&middot;</span> <strong>${showCount}</strong> spettacoli`;

  if (visible.length === 0) {
    emptyState.hidden = false;
    filmList.hidden = true;
    return;
  }
  emptyState.hidden = true;
  filmList.hidden = false;
  filmList.classList.toggle('day-movie-grid', dayLayout === 'grid');

  // Griglia e lista usano lo stesso markup: cambia solo il layout CSS.
  filmList.innerHTML = visible.map((movie) => dayCardHtml(movie, { venuesMap, dayDate })).join('');
}

function dayCardHtml(movie, { venuesMap, dayDate }) {
  const isFav = favorites.has(movie.id);
  const durationText = cleanDuration(movie.duration);
  const detailsUrl = movieUrlForVenue(movie, movie.dayProgramming[0]?.venue);
  const dayDisplay = formatDayLabel(dayDate);

  return `
    <article class="film-card" data-movie-id="${escapeHtml(movie.id)}">
      <div class="movie-main">
        ${renderPosterLink(movie, movie.dayProgramming.map((item) => item.venue), venuesMap)}
        <div class="movie-info">
          <div class="movie-card-meta">
            <div class="movie-badges">
              ${(movie.tags || []).map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('')}
              ${(movie.genres || []).map((genre) => `<span class="badge-tag">${escapeHtml(genre)}</span>`).join('')}
              ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
            </div>
            <div class="movie-actions">
              ${renderShareMenu(movie)}
              <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
                <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
              </button>
            </div>
          </div>
          <div class="movie-title-row">
            <h3>${escapeHtml(movie.title)}</h3>
          </div>
          <p class="movie-synopsis">${movie.synopsis ? escapeHtml(movie.synopsis) : 'Sinossi non disponibile.'}</p>
          ${renderMovieMetadata(movie)}
          <p class="movie-prompt">Programmazione per ${dayDisplay}:</p>
        </div>
      </div>

      <div class="showtime-groups">
        ${movie.dayProgramming.filter((item) => !movie.shows.some((show) => show.venue === item.venue)).map((item) => {
          const cinema = venuesMap[item.venue] || { name: item.venue, location: '' };
          return `<div class="showtime-group"><div class="venue-line"><strong>${escapeHtml(cinema.name)}</strong><span class="venue-location-inline">${escapeHtml(cinema.location)}</span></div><p class="no-times-note">Data annunciata. Orari e biglietti non ancora disponibili.</p></div>`;
        }).join('')}
        ${movie.shows.map((show) => {
          const cinema = venuesMap[show.venue] || { name: show.venue, location: '' };
          return `
            <div class="showtime-group">
              <div class="venue-line">
                <strong>${escapeHtml(cinema.name)}</strong>
                <span class="venue-location-inline">${escapeHtml(cinema.location)}</span>
              </div>
              <div class="times">
                ${show.shows.map((entry) => `
                  <div class="time-item-wrapper">
                    ${showtimeChipHtml(movie, cinema, dayDate, entry, 'showtime')}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <a class="card-more" href="${escapeHtml(detailsUrl)}" target="_blank" rel="noreferrer">
        Dettagli e scheda ufficiale &rarr;
      </a>
    </article>
  `;
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
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Impossibile leggere la programmazione (${response.status})`);
    scheduleData = await response.json();
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
    render();
  });
});

// Quick Chips in "Per Film"
$$('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activeChip = chip.dataset.chip;
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

$$('.layout-button').forEach((button) => {
  button.addEventListener('click', () => {
    dayLayout = button.dataset.layout;
    $$('.layout-button').forEach((item) => {
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
if (favToggleBtn) {
  favToggleBtn.addEventListener('click', () => {
    currentView = 'movies';
    $$('.view-pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === 'movies');
      b.setAttribute('aria-selected', b.dataset.view === 'movies');
    });
    $$('.chip').forEach((c) => c.classList.remove('active'));
    const favChip = $('.chip-fav');
    if (favChip) favChip.classList.add('active');
    activeChip = 'favorites';
    render();
  });
}

// Input filtri
if (searchInput) searchInput.addEventListener('input', render);
if (venueFilter) venueFilter.addEventListener('change', render);
if (genreFilter) genreFilter.addEventListener('change', render);

$('#refresh').addEventListener('click', () => loadSchedule({ fresh: true }));

$('#clear-filters').addEventListener('click', () => {
  if (searchInput) searchInput.value = '';
  if (venueFilter) venueFilter.value = 'all';
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
  if (e.key !== 'Escape' || !showtimeMenu || showtimeMenu.hidden) return;
  const button = activeShowtimeButton;
  if (button) button.focus({ preventScroll: true });
  closeShowtimeMenu();
});

// Il menu è ancorato alla pagina: se si scorre o ridimensiona va richiuso.
window.addEventListener('scroll', () => closeShowtimeMenu(), { passive: true, capture: true });
window.addEventListener('resize', () => closeShowtimeMenu());

// In-place accordion card toggle (con scroll fluido centrato)
document.addEventListener('click', (e) => {
  // Dal banner "Ora in sala" salta alla scheda del film
  const airingLink = e.target.closest('[data-airing-film]');
  if (airingLink) {
    e.preventDefault();
    revealFilm(airingLink.dataset.airingFilm);
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
      showToast('Film rimosso dai salvati');
    } else {
      favorites.add(movieId);
      favBtn.classList.add('is-favorite');
      showToast('Film salvato nei preferiti');
    }
    saveFavorites();
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

  // 4. Se clicca all'interno del pannello orari, non chiudere la card
  if (e.target.closest('.movie-full-schedule-panel')) {
    return;
  }

  // 5. Espansione esplicita degli orari del film
  const card = e.target.closest('.movie-catalog-card');
  const scheduleToggle = e.target.closest('.schedule-toggle');
  if (card && scheduleToggle) {
    const movieId = card.dataset.movieId;
    const willExpand = scheduleToggle.getAttribute('aria-expanded') !== 'true';
    const panel = card.querySelector(`#schedule-${CSS.escape(movieId)}`);

    const apply = () => {
      scheduleToggle.setAttribute('aria-expanded', String(willExpand));
      scheduleToggle.querySelector('span').textContent = willExpand
        ? 'Nascondi gli orari'
        : `Date, orari e biglietti · ${card.querySelectorAll('.showtime-btn').length}`;
      scheduleToggle.querySelector('.cue-chevron').classList.toggle('is-rotated', willExpand);
      panel.hidden = !willExpand;
      card.classList.toggle('is-expanded', willExpand);
      if (willExpand) expandedMovies.add(movieId);
      else expandedMovies.delete(movieId);
    };

    // Aprendo, la scheda passa in primo piano e lo scroll la porta in vista.
    const reveal = () => {
      if (willExpand) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const transition = withViewTransition(apply);
    if (transition) transition.finished.then(reveal).catch(() => {});
    else requestAnimationFrame(reveal);
  }
});

// Boot
updateFavoritesBadge();
loadSchedule();

// Il banner "Ora in sala" e l'orologio devono restare veri anche con la
// pagina aperta a lungo, senza ricaricare la programmazione.
window.setInterval(renderAiringNow, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderAiringNow();
});
