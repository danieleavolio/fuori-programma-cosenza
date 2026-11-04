const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// DOM Elements
const moviesGrid = $('#movies-grid');
const filmList = $('#film-list');
const controlsPerFilm = $('#controls-per-film');
const controlsPerDay = $('#controls-per-day');
const searchInput = $('#search');
const venueFilter = $('#venue-filter');
const daysNavStrip = $('#days-nav-strip');
const resultSummary = $('#result-summary');
const updatedAtEl = $('#updated-at');
const favToggleBtn = $('#fav-toggle-btn');
const favCountEl = $('#fav-count');
const chipFavCountEl = $('#chip-fav-count');
const toastEl = $('#toast');
const emptyState = $('#empty-state');

// State
let scheduleData = { venues: [], movies: [], updatedAt: '' };
let currentView = 'movies'; // 'movies' | 'schedule'
let activeChip = 'all'; // 'all' | 'today' | 'favorites'
let selectedDate = '';
const expandedMovies = new Set();
let favorites = loadFavorites();

// Dynamic cinematic palettes for lively, distinct cards
const FILM_PALETTES = [
  { color: '#e63946', tint: 'rgba(230, 57, 70, 0.08)', border: '#fca5a5' }, // Crimson
  { color: '#0284c7', tint: 'rgba(2, 132, 199, 0.08)', border: '#93c5fd' }, // Sky Blue
  { color: '#d97706', tint: 'rgba(217, 119, 6, 0.08)', border: '#fcd34d' }, // Amber
  { color: '#7c3aed', tint: 'rgba(124, 58, 237, 0.08)', border: '#c4b5fd' }, // Purple
  { color: '#059669', tint: 'rgba(5, 150, 105, 0.08)', border: '#6ee7b7' }, // Emerald
  { color: '#e11d48', tint: 'rgba(225, 29, 72, 0.08)', border: '#fda4af' }, // Rose
  { color: '#4f46e5', tint: 'rgba(79, 70, 229, 0.08)', border: '#a5b4fc' }, // Indigo
  { color: '#ea580c', tint: 'rgba(234, 88, 12, 0.08)', border: '#fdba74' }, // Orange
];

const getFilmPalette = (title) => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return FILM_PALETTES[hash % FILM_PALETTES.length];
};

const VENUE_COLORS = {
  'andromeda-river': '#2563eb', // Blue
  'citrigno': '#059669',        // Emerald
  'garden': '#d97706',          // Amber
  'unical': '#7c3aed',          // Purple
};

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
  return String(raw).replace(/H/i, 'h ').replace(/['’]/g, 'm').trim();
};

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

// --- Toast & Social Share ---
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

function shareShowtime({ title, venueName, dateStr, timeStr, url }) {
  const dayText = formatDayLabel(dateStr);
  const text = `Cinema: andiamo a vedere "${title}"?\nSala: ${venueName}\nData: ${dayText} (${dateStr}), ore ${timeStr}\nBiglietti: ${url}`;

  if (navigator.share && window.isSecureContext) {
    navigator.share({ title: `Cinema: ${title}`, text: text, url: url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Dettagli dello spettacolo copiati negli appunti');
    }).catch(() => {
      prompt('Copia il testo dell’invito:', text);
    });
  } else {
    prompt('Copia il testo dell’invito:', text);
  }
}

// --- Setup Venues & Days ---
function renderVenuesInfo(venues) {
  if (venueFilter) {
    venueFilter.innerHTML = '<option value="all">Tutte le sale</option>' + venues.map((venue) => `<option value="${escapeHtml(venue.id)}">${escapeHtml(venue.name)}</option>`).join('');
  }
  
  const cinemaList = $('#cinema-list');
  if (cinemaList) {
    cinemaList.innerHTML = venues.map((venue) => `
      <article class="cinema-item">
        <div>
          <span class="cinema-name">${escapeHtml(venue.name)}</span>
          <span class="cinema-location">${escapeHtml(venue.location)}</span>
        </div>
        <div>
          <span class="cinema-status ${venue.status === 'available' ? 'available' : ''}">
            ${venue.status === 'available' ? 'Programmazione attiva' : 'In aggiornamento'}
          </span>
          ${venue.source ? `<a class="cinema-source" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">${escapeHtml(venue.sourceName || 'Biglietteria')} &rarr;</a>` : ''}
        </div>
      </article>
    `).join('');
  }
}

function getSortedDates() {
  return [...new Set(scheduleData.movies.flatMap((m) => m.shows.map((s) => s.date)))].sort((a, b) => parseDate(a) - parseDate(b));
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
      <button type="button" class="day-strip-pill ${isSelected ? 'active' : ''} ${isToday ? 'is-today' : ''}" data-date="${d}" role="tab" aria-selected="${isSelected ? 'true' : 'false'}">
        <span class="pill-day-name">${escapeHtml(dayName)}</span>
        <span class="pill-day-num">${escapeHtml(dayNumber)}</span>
      </button>
    `;
  }).join('');
}

// --- Main Render Dispatcher ---
function render() {
  const query = (searchInput?.value || '').trim().toLocaleLowerCase('it');
  const selectedVenue = venueFilter?.value || 'all';
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
      const matchesAnyVenue = movie.shows.some((s) => (venuesMap[s.venue]?.name || '').toLocaleLowerCase('it').includes(query));
      if (!matchesTitle && !matchesAnyVenue) return false;

      // 2. Venue Filter
      if (selectedVenue !== 'all' && !movie.shows.some((s) => s.venue === selectedVenue)) {
        return false;
      }

      // 3. Quick Chips
      if (activeChip === 'today') {
        if (!movie.shows.some((s) => s.date === todayString)) return false;
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
// VISTA 1: Catalogo per Film (Card Espandibili)
// ==========================================
function renderMoviesCatalogView(movies, venuesMap, selectedVenue) {
  const totalShows = movies.reduce((sum, m) => sum + m.shows.reduce((t, s) => t + s.shows.length, 0), 0);
  resultSummary.innerHTML = `<strong>${movies.length}</strong> ${movies.length === 1 ? 'film in cartellone' : 'film in cartellone'} <span>&middot;</span> <strong>${totalShows}</strong> spettacoli totali`;

  if (movies.length === 0) {
    emptyState.hidden = false;
    moviesGrid.hidden = true;
    return;
  }
  emptyState.hidden = true;

  const todayString = getTodayString();

  moviesGrid.innerHTML = movies.map((movie) => {
    const isFav = favorites.has(movie.id);
    const isExpanded = expandedMovies.has(movie.id);
    const palette = getFilmPalette(movie.title);

    const relevantShows = movie.shows.filter((s) => {
      if (selectedVenue !== 'all' && s.venue !== selectedVenue) return false;
      return true;
    });

    const venueIds = [...new Set(relevantShows.map((s) => s.venue))];
    const venuesPlaying = venueIds.map((id) => venuesMap[id] || { id, name: id, location: '' });
    const datesAvailable = [...new Set(relevantShows.map((s) => s.date))].sort((a, b) => parseDate(a) - parseDate(b));
    const durationText = cleanDuration(movie.duration);

    // Film proiettati SOLO OGGI e poi mai più
    const allMovieDates = [...new Set(movie.shows.map((s) => s.date))];
    const isOnlyToday = allMovieDates.length === 1 && allMovieDates[0] === todayString;

    return `
      <article class="movie-catalog-card ${isExpanded ? 'is-expanded' : ''} ${isOnlyToday ? 'is-only-today-card' : ''}" data-movie-id="${escapeHtml(movie.id)}" style="--film-color: ${palette.color}; --film-tint: ${palette.tint}; --film-border: ${palette.border};">
        <div class="movie-card-topline">
          <div class="topline-left">
            ${isOnlyToday ? `
              <span class="badge-last-chance" title="Attenzione: ultima occasione! In programmazione solo oggi.">
                <svg class="badge-fire-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
                </svg>
                Solo oggi
              </span>
            ` : ''}
            ${movie.tags && movie.tags.length ? movie.tags.map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('') : ''}
            ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
          </div>

          <div class="topline-right">
            <div class="expand-cue" aria-hidden="true">
              <span class="cue-text">${isExpanded ? 'Chiudi' : 'Orari'}</span>
              <svg class="cue-chevron ${isExpanded ? 'is-rotated' : ''}" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
              <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
            </button>
          </div>
        </div>

        <div class="movie-card-body">
          <a class="poster-link" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer" aria-label="Locandina di ${escapeHtml(movie.title)}">
            ${movie.poster ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="Locandina di ${escapeHtml(movie.title)}" loading="lazy" />` : `<span class="poster poster-missing">${escapeHtml(movie.title.slice(0, 1))}</span>`}
          </a>

          <div class="movie-card-details">
            <div class="details-top">
              <h3 class="movie-title">${escapeHtml(movie.title)}</h3>

              <!-- Sale dove viene proiettato -->
              <div class="venues-summary-block">
                <span class="meta-label">CINEMA</span>
                <div class="venue-pill-list">
                  ${venuesPlaying.length ? venuesPlaying.map((v) => {
                    const dotColor = VENUE_COLORS[v.id] || '#64748b';
                    return `<span class="cinema-pill"><span class="cinema-dot" style="background:${dotColor}"></span>${escapeHtml(v.name)} <small>(${escapeHtml(v.location)})</small></span>`;
                  }).join('') : '<span class="cinema-pill none">Nessun cinema con i filtri attuali</span>'}
                </div>
              </div>

              <!-- Date disponibili -->
              <div class="days-summary-block">
                <span class="meta-label">DATE</span>
                <div class="days-chip-list">
                  ${datesAvailable.map((d) => {
                    const isToday = d === todayString;
                    const dateClass = isToday ? (isOnlyToday ? 'is-today is-last-chance-date' : 'is-today') : '';
                    return `<span class="date-chip ${dateClass}">${formatDayLabel(d)}</span>`;
                  }).join('')}
                </div>
              </div>
            </div>

            <div class="card-footer-hint">
              <span class="hint-text">${isExpanded ? 'Tocca la card per chiudere' : 'Tocca la card per orari e sale'}</span>
            </div>
          </div>
        </div>

        <!-- Sezione orari dettagliata con animazione fluida in CSS Grid -->
        <div class="movie-full-schedule-panel">
          <div class="schedule-panel-inner">
            <div class="panel-header-line">
              <span class="schedule-panel-title">TUTTI GLI ORARI DISPONIBILI</span>
            </div>
            ${datesAvailable.length ? `
              <div class="dates-horizontal-grid">
                ${datesAvailable.map((dateStr) => {
                  const dShows = relevantShows.filter((s) => s.date === dateStr);
                  const isToday = dateStr === todayString;
                  return `
                    <div class="date-schedule-group ${isToday ? 'is-today-group' : ''}">
                      <div class="date-group-header">
                        <span class="date-badge ${isToday ? 'today-badge' : ''}">${isToday ? 'Oggi' : italianDate(parseDate(dateStr))}</span>
                        ${!isToday ? `<span class="date-full-text">${dateStr}</span>` : ''}
                      </div>
                      <div class="date-venues-grid">
                        ${dShows.map((s) => {
                          const cinema = venuesMap[s.venue] || { name: s.venue, location: '' };
                          return `
                            <div class="venue-time-block">
                              <div class="venue-time-header">
                                <span class="venue-name">${escapeHtml(cinema.name)}</span>
                                <span class="venue-loc">${escapeHtml(cinema.location)}</span>
                              </div>
                              <div class="times-buttons">
                                ${s.shows.map((entry) => `
                                  <div class="time-item-wrapper">
                                    <a class="showtime-btn" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer" title="Acquista biglietto per ${escapeHtml(movie.title)} alle ${escapeHtml(entry.time)} al ${escapeHtml(cinema.name)}">
                                      <strong>${escapeHtml(entry.time)}</strong>
                                      <small>${entry.room ? 'Sala ' + escapeHtml(entry.room) : 'Biglietti'}</small>
                                    </a>
                                    <button class="btn-share-icon" type="button" title="Condividi spettacolo con amici" data-share-title="${escapeHtml(movie.title)}" data-share-venue="${escapeHtml(cinema.name)}" data-share-date="${escapeHtml(dateStr)}" data-share-time="${escapeHtml(entry.time)}" data-share-url="${escapeHtml(entry.url || movie.url)}">
                                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                    </button>
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
  }).join('');
}

// ==========================================
// VISTA 2: Programmazione per Giorno
// ==========================================
function renderScheduleDayView(movies, venuesMap, dayDate) {
  const visible = movies.map((movie) => {
    const matchingShows = movie.shows.filter((show) => show.date === dayDate);
    return { ...movie, shows: matchingShows };
  }).filter((movie) => movie.shows.length > 0);

  const showCount = visible.reduce((sum, movie) => sum + movie.shows.reduce((total, show) => total + show.shows.length, 0), 0);
  const dayDisplay = formatDayLabel(dayDate);
  resultSummary.innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} in sala per <strong>${dayDisplay}</strong> <span>&middot;</span> <strong>${showCount}</strong> spettacoli`;

  if (visible.length === 0) {
    emptyState.hidden = false;
    filmList.hidden = true;
    return;
  }
  emptyState.hidden = true;

  filmList.innerHTML = visible.map((movie) => {
    const isFav = favorites.has(movie.id);
    const durationText = cleanDuration(movie.duration);
    const palette = getFilmPalette(movie.title);

    return `
      <article class="film-card" data-movie-id="${escapeHtml(movie.id)}" style="--film-color: ${palette.color}; --film-tint: ${palette.tint};">
        <div class="movie-topline">
          <div class="topline-left">
            ${movie.tags && movie.tags.length ? movie.tags.map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('') : ''}
            ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
          </div>
          <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="Salva preferito">
            <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </div>

        <div class="movie-main">
          <a class="poster-link" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer" aria-label="Locandina di ${escapeHtml(movie.title)}">
            ${movie.poster ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="Locandina di ${escapeHtml(movie.title)}" loading="lazy" />` : `<span class="poster poster-missing">${escapeHtml(movie.title.slice(0, 1))}</span>`}
          </a>
          <div class="movie-info">
            <h3>${escapeHtml(movie.title)}</h3>
            <p class="movie-prompt">Orari per ${dayDisplay}:</p>
          </div>
        </div>

        <div class="showtime-groups">
          ${movie.shows.map((show) => {
            const cinema = venuesMap[show.venue] || { name: show.venue, location: '' };
            const dotColor = VENUE_COLORS[show.venue] || '#64748b';
            return `
              <div class="showtime-group">
                <div class="venue-line">
                  <span class="cinema-dot" style="background:${dotColor}"></span>
                  <strong>${escapeHtml(cinema.name)}</strong>
                  <span class="venue-location-inline">${escapeHtml(cinema.location)}</span>
                </div>
                <div class="times">
                  ${show.shows.map((entry) => `
                    <div class="time-item-wrapper">
                      <a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer">
                        <strong>${escapeHtml(entry.time)}</strong>
                        <small>${entry.room ? 'Sala ' + escapeHtml(entry.room) : 'Biglietti'}</small>
                      </a>
                      <button class="btn-share-icon" type="button" title="Condividi spettacolo con amici" data-share-title="${escapeHtml(movie.title)}" data-share-venue="${escapeHtml(cinema.name)}" data-share-date="${escapeHtml(show.date)}" data-share-time="${escapeHtml(entry.time)}" data-share-url="${escapeHtml(entry.url || movie.url)}">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                      </button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <a class="card-more" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer">
          Dettagli e scheda ufficiale &rarr;
        </a>
      </article>
    `;
  }).join('');
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
    renderVenuesInfo(scheduleData.venues);
    if (updatedAtEl) {
      updatedAtEl.textContent = `Aggiornato il ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduleData.updatedAt))}`;
    }
    render();
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

$('#refresh').addEventListener('click', () => loadSchedule({ fresh: true }));

$('#clear-filters').addEventListener('click', () => {
  if (searchInput) searchInput.value = '';
  if (venueFilter) venueFilter.value = 'all';
  $$('.chip').forEach((c) => c.classList.remove('active'));
  $('[data-chip="all"]').classList.add('active');
  activeChip = 'all';
  render();
});

// In-place accordion card toggle (con scroll fluido centrato)
document.addEventListener('click', (e) => {
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

  // 2. Gestione pulsante condivisione
  const shareBtn = e.target.closest('[data-share-title]');
  if (shareBtn) {
    e.stopPropagation();
    shareShowtime({
      title: shareBtn.dataset.shareTitle,
      venueName: shareBtn.dataset.shareVenue,
      dateStr: shareBtn.dataset.shareDate,
      timeStr: shareBtn.dataset.shareTime,
      url: shareBtn.dataset.shareUrl,
    });
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

  // 5. Click su una card film nel catalogo: espansione / chiusura con centratura fluida
  const card = e.target.closest('.movie-catalog-card');
  if (card) {
    const movieId = card.dataset.movieId;
    const willExpand = !card.classList.contains('is-expanded');
    
    // Toggle classe
    card.classList.toggle('is-expanded', willExpand);
    
    // Aggiorna indicatore cue
    const cueText = card.querySelector('.cue-text');
    const cueChevron = card.querySelector('.cue-chevron');
    const hintText = card.querySelector('.hint-text');
    if (cueText) cueText.textContent = willExpand ? 'Chiudi' : 'Orari';
    if (cueChevron) cueChevron.classList.toggle('is-rotated', willExpand);
    if (hintText) hintText.textContent = willExpand ? 'Tocca la card per chiudere' : 'Tocca la card per orari e sale';

    if (willExpand) {
      expandedMovies.add(movieId);
      // Centra fluidamente la card nella vista dell'utente
      requestAnimationFrame(() => {
        const headerOffset = 85;
        const rect = card.getBoundingClientRect();
        const targetScrollY = window.pageYOffset + rect.top - headerOffset;
        window.scrollTo({
          top: Math.max(0, targetScrollY),
          behavior: 'smooth'
        });
      });
    } else {
      expandedMovies.delete(movieId);
    }
    return;
  }
});

// Boot
updateFavoritesBadge();
loadSchedule();
