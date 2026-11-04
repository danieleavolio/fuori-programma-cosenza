const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// DOM Elements
const moviesGrid = $('#movies-grid');
const filmList = $('#film-list');
const venuesView = $('#venues-view');
const dayFilter = $('#day-filter');
const venueFilter = $('#venue-filter');
const timeFilter = $('#time-filter');
const searchInput = $('#search');
const filterGroupDay = $('#filter-group-day');
const sectionEyebrow = $('#section-eyebrow');
const sectionTitle = $('#section-title');
const favToggleBtn = $('#fav-toggle-btn');
const toastEl = $('#toast');

// State
let scheduleData = { venues: [], movies: [], updatedAt: '' };
let currentView = 'movies'; // 'movies' | 'schedule' | 'venues'
let activeChip = 'all'; // 'all' | 'today' | 'weekend' | 'favorites'
const expandedMovies = new Set();
let favorites = loadFavorites();

// Dynamic cinematic palettes for a playful, vibrant look
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

// Returns strictly "Oggi" if date is today, otherwise clean day name
const formatDayLabel = (dateStr) => {
  if (dateStr === getTodayString()) {
    return 'Oggi';
  }
  return italianDate(parseDate(dateStr));
};

const isWeekend = (dateObj) => {
  const day = dateObj.getDay();
  return day === 5 || day === 6 || day === 0; // Venerdì, Sabato, Domenica
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

const matchesTimeSlot = (timeStr, slot) => {
  if (!slot || slot === 'all') return true;
  const [h, m] = timeStr.split(':').map(Number);
  const minutes = h * 60 + (m || 0);
  if (slot === 'afternoon') return minutes < 19 * 60;
  if (slot === 'evening') return minutes >= 19 * 60 && minutes <= 21 * 60 + 30;
  if (slot === 'night') return minutes > 21 * 60 + 30;
  return true;
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
  $('#fav-count').textContent = count;
  $('#chip-fav-count').textContent = count;
  favToggleBtn.classList.toggle('has-favorites', count > 0);
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

// --- Initialization & Filter Data Populating ---
function renderVenuesInfo(venues) {
  $('#venue-count').textContent = venues.length;
  venueFilter.innerHTML = '<option value="all">Tutti i cinema</option>' + venues.map((venue) => `<option value="${escapeHtml(venue.id)}">${escapeHtml(venue.name)}</option>`).join('');
  
  $('#cinema-list').innerHTML = venues.map((venue) => `
    <article class="cinema-item">
      <div>
        <span class="cinema-name">${escapeHtml(venue.name)}</span>
        <span class="cinema-location">${escapeHtml(venue.location)}</span>
      </div>
      <div>
        <span class="cinema-status ${venue.status === 'available' ? 'available' : ''}">
          ${venue.status === 'available' ? 'Programmazione disponibile' : 'In aggiornamento'}
        </span>
        ${venue.source ? `<a class="cinema-source" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">${escapeHtml(venue.sourceName || 'Biglietteria')} &rarr;</a>` : ''}
      </div>
    </article>
  `).join('');
}

function renderDaysFilter(movies) {
  const dates = [...new Set(movies.flatMap((movie) => movie.shows.map((show) => show.date)))].sort((a, b) => parseDate(a) - parseDate(b));
  const todayString = getTodayString();
  const selected = dates.includes(todayString) ? todayString : dates[0];
  
  dayFilter.innerHTML = dates.map((date) => `
    <option value="${date}" ${date === selected ? 'selected' : ''}>
      ${date === todayString ? 'Oggi' : italianDate(parseDate(date))}
    </option>
  `).join('');
  
  if (!dates.length) dayFilter.innerHTML = '<option value="">Nessuna data</option>';
}

function setTodayBanner() {
  const now = new Date();
  $('#today-date').dateTime = now.toISOString().slice(0, 10);
  $('#today-date').textContent = italianFullDate(now);
}

// --- Main Render Dispatcher ---
function render() {
  const query = searchInput.value.trim().toLocaleLowerCase('it');
  const selectedVenue = venueFilter.value;
  const selectedTime = timeFilter.value;
  const venuesMap = Object.fromEntries(scheduleData.venues.map((v) => [v.id, v]));
  const todayString = getTodayString();

  if (currentView === 'movies') {
    sectionEyebrow.textContent = 'CATALOGO';
    sectionTitle.textContent = 'Film in programmazione';
    filterGroupDay.style.display = 'none';
  } else if (currentView === 'schedule') {
    sectionEyebrow.textContent = 'ORARI GIORNALIERI';
    sectionTitle.textContent = 'Programmazione per data';
    filterGroupDay.style.display = 'flex';
  } else if (currentView === 'venues') {
    sectionEyebrow.textContent = 'SALE';
    sectionTitle.textContent = 'Programmazione per cinema';
    filterGroupDay.style.display = 'none';
  }

  // Filter movies
  const filteredMovies = scheduleData.movies.filter((movie) => {
    // 1. Text Search
    const matchesTitle = movie.title.toLocaleLowerCase('it').includes(query);
    const matchesAnyVenue = movie.shows.some((s) => (venuesMap[s.venue]?.name || '').toLocaleLowerCase('it').includes(query));
    if (!matchesTitle && !matchesAnyVenue) return false;

    // 2. Venue Filter
    if (selectedVenue !== 'all' && !movie.shows.some((s) => s.venue === selectedVenue)) {
      return false;
    }

    // 3. Time Filter
    if (selectedTime !== 'all') {
      const hasMatchingTime = movie.shows.some((s) => s.shows.some((entry) => matchesTimeSlot(entry.time, selectedTime)));
      if (!hasMatchingTime) return false;
    }

    // 4. Quick Chips Filter
    if (activeChip === 'today') {
      if (!movie.shows.some((s) => s.date === todayString)) return false;
    } else if (activeChip === 'weekend') {
      if (!movie.shows.some((s) => isWeekend(parseDate(s.date)))) return false;
    } else if (activeChip === 'favorites') {
      if (!favorites.has(movie.id)) return false;
    }

    return true;
  });

  if (currentView === 'movies') {
    renderMoviesCatalogView(filteredMovies, venuesMap, selectedVenue, selectedTime);
  } else if (currentView === 'schedule') {
    renderScheduleDayView(filteredMovies, venuesMap, dayFilter.value, selectedVenue, selectedTime);
  } else if (currentView === 'venues') {
    renderVenuesCatalogView(filteredMovies, venuesMap, selectedVenue, selectedTime);
  }
}

// ==========================================
// VIEW 1: Catalogo Film (Card per Film)
// ==========================================
function renderMoviesCatalogView(movies, venuesMap, selectedVenue, selectedTime) {
  moviesGrid.hidden = false;
  filmList.hidden = true;
  venuesView.hidden = true;

  const totalShows = movies.reduce((sum, m) => sum + m.shows.reduce((t, s) => t + s.shows.length, 0), 0);
  $('#result-summary').innerHTML = `<strong>${movies.length}</strong> ${movies.length === 1 ? 'film in cartellone' : 'film in cartellone'} <span>&middot;</span> <strong>${totalShows}</strong> spettacoli`;

  if (movies.length === 0) {
    $('#empty-state').hidden = false;
    moviesGrid.hidden = true;
    return;
  }
  $('#empty-state').hidden = true;

  const todayString = getTodayString();

  moviesGrid.innerHTML = movies.map((movie, index) => {
    const isFav = favorites.has(movie.id);
    const isExpanded = expandedMovies.has(movie.id);
    const palette = getFilmPalette(movie.title);

    const relevantShows = movie.shows.filter((s) => {
      if (selectedVenue !== 'all' && s.venue !== selectedVenue) return false;
      if (selectedTime !== 'all') {
        return s.shows.some((entry) => matchesTimeSlot(entry.time, selectedTime));
      }
      return true;
    });

    const venueIds = [...new Set(relevantShows.map((s) => s.venue))];
    const venuesPlaying = venueIds.map((id) => venuesMap[id] || { id, name: id, location: '' });
    const datesAvailable = [...new Set(relevantShows.map((s) => s.date))].sort((a, b) => parseDate(a) - parseDate(b));
    const durationText = cleanDuration(movie.duration);

    // Film che sono proiettati SOLO OGGI e poi non ci sono più
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

              <!-- Sale dove viene proiettato con dot cromatici -->
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
                          const matchingTimes = selectedTime === 'all' ? s.shows : s.shows.filter((entry) => matchesTimeSlot(entry.time, selectedTime));
                          return `
                            <div class="venue-time-block">
                              <div class="venue-time-header">
                                <span class="venue-name">${escapeHtml(cinema.name)}</span>
                                <span class="venue-loc">${escapeHtml(cinema.location)}</span>
                              </div>
                              <div class="times-buttons">
                                ${matchingTimes.map((entry) => `
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
// VIEW 2: Programmazione per Giorno
// ==========================================
function renderScheduleDayView(movies, venuesMap, selectedDate, selectedVenue, selectedTime) {
  moviesGrid.hidden = true;
  filmList.hidden = false;
  venuesView.hidden = true;

  const visible = movies.map((movie) => {
    const matchingShows = movie.shows.filter((show) => {
      if (show.date !== selectedDate) return false;
      if (selectedVenue !== 'all' && show.venue !== selectedVenue) return false;
      return true;
    }).map((show) => ({
      ...show,
      shows: selectedTime === 'all' ? show.shows : show.shows.filter((entry) => matchesTimeSlot(entry.time, selectedTime))
    })).filter((show) => show.shows.length > 0);

    return { ...movie, shows: matchingShows };
  }).filter((movie) => movie.shows.length > 0);

  const showCount = visible.reduce((sum, movie) => sum + movie.shows.reduce((total, show) => total + show.shows.length, 0), 0);
  const dayDisplay = formatDayLabel(selectedDate);
  $('#result-summary').innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} <span>&middot;</span> <strong>${showCount}</strong> orari <span>&middot;</span> ${dayDisplay}`;

  if (visible.length === 0) {
    $('#empty-state').hidden = false;
    filmList.hidden = true;
    return;
  }
  $('#empty-state').hidden = true;

  filmList.innerHTML = visible.map((movie, index) => {
    const isFav = favorites.has(movie.id);
    const durationText = cleanDuration(movie.duration);
    return `
      <article class="film-card" data-movie-id="${escapeHtml(movie.id)}">
        <div class="movie-topline">
          <div class="topline-left">
            <span class="movie-number">${String(index + 1).padStart(2, '0')}</span>
            <span class="movie-category">${movie.tag ? escapeHtml(movie.tag) : 'IN PROGRAMMAZIONE'}</span>
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
            ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
            <p class="movie-prompt">Orari e cinema:</p>
          </div>
        </div>
        <div class="showtime-groups">
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
          Dettagli e biglietti ufficiali &rarr;
        </a>
      </article>
    `;
  }).join('');
}

// ==========================================
// VIEW 3: Programmazione per Cinema (Le Sale)
// ==========================================
function renderVenuesCatalogView(movies, venuesMap, selectedVenue, selectedTime) {
  moviesGrid.hidden = true;
  filmList.hidden = true;
  venuesView.hidden = false;

  const targetVenues = selectedVenue === 'all' ? scheduleData.venues : scheduleData.venues.filter((v) => v.id === selectedVenue);
  $('#result-summary').innerHTML = `<strong>${targetVenues.length}</strong> sale cinematografiche attive <span>&middot;</span> Consulta la programmazione per cinema`;

  venuesView.innerHTML = targetVenues.map((venue) => {
    const venueMovies = movies.filter((m) => m.shows.some((s) => s.venue === venue.id)).map((m) => {
      const vShows = m.shows.filter((s) => s.venue === venue.id).map((s) => ({
        ...s,
        shows: selectedTime === 'all' ? s.shows : s.shows.filter((entry) => matchesTimeSlot(entry.time, selectedTime))
      })).filter((s) => s.shows.length > 0);
      return { ...m, venueShows: vShows };
    }).filter((m) => m.venueShows.length > 0);

    return `
      <section class="venue-catalog-block" id="venue-block-${escapeHtml(venue.id)}">
        <div class="venue-block-header">
          <div>
            <span class="venue-pill-badge">${escapeHtml(venue.location)}</span>
            <h3 class="venue-block-name">${escapeHtml(venue.name)}</h3>
            <p class="venue-block-meta">${venue.status === 'available' ? 'Programmazione online' : 'In aggiornamento'}</p>
          </div>
          ${venue.source ? `
            <a class="venue-official-btn" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">
              Biglietteria ${escapeHtml(venue.sourceName || '')} &rarr;
            </a>
          ` : ''}
        </div>

        <div class="venue-movies-list">
          ${venueMovies.length ? venueMovies.map((movie) => {
            const durationText = cleanDuration(movie.duration);
            return `
              <article class="venue-movie-row">
                <a class="row-poster-thumb" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer">
                  ${movie.poster ? `<img src="${escapeHtml(movie.poster)}" alt="${escapeHtml(movie.title)}" loading="lazy" />` : `<span>${escapeHtml(movie.title.slice(0, 1))}</span>`}
                </a>
                <div class="row-info">
                  <div class="row-headline">
                    <h4>${escapeHtml(movie.title)}</h4>
                    ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
                  </div>
                  <div class="row-dates">
                    ${movie.venueShows.map((vShow) => `
                      <div class="row-day-times">
                        <span class="row-day-badge">${formatDayLabel(vShow.date)}</span>
                        <div class="times">
                          ${vShow.shows.map((entry) => `
                            <div class="time-item-wrapper">
                              <a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer">
                                <strong>${escapeHtml(entry.time)}</strong>
                                <small>${entry.room ? 'Sala ' + escapeHtml(entry.room) : 'Biglietti'}</small>
                              </a>
                              <button class="btn-share-icon" type="button" title="Condividi spettacolo con amici" data-share-title="${escapeHtml(movie.title)}" data-share-venue="${escapeHtml(venue.name)}" data-share-date="${escapeHtml(vShow.date)}" data-share-time="${escapeHtml(entry.time)}" data-share-url="${escapeHtml(entry.url || movie.url)}">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                              </button>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </article>
            `;
          }).join('') : '<p class="empty-venue-note">Nessun film in programmazione per questa sala con i filtri attuali.</p>'}
        </div>
      </section>
    `;
  }).join('');
}

// ==========================================
// Data Fetching
// ==========================================
async function loadSchedule({ fresh = false } = {}) {
  const button = $('#refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`data/schedule.json${fresh ? `?t=${Date.now()}` : ''}`, {
      cache: fresh ? 'no-store' : 'default',
    });
    if (!response.ok) throw new Error('Non è stato possibile caricare la programmazione.');
    scheduleData = await response.json();
    renderVenuesInfo(scheduleData.venues);
    renderDaysFilter(scheduleData.movies);
    $('#updated-at').textContent = `Aggiornato il ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduleData.updatedAt))}`;
    render();
  } catch (error) {
    $('#result-summary').textContent = error.message;
    moviesGrid.hidden = true;
    filmList.hidden = true;
    venuesView.hidden = true;
    $('#empty-state').hidden = false;
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

// View Mode Switcher
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

// Quick Chips
$$('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activeChip = chip.dataset.chip;
    render();
  });
});

// Top bar Favorites button
favToggleBtn.addEventListener('click', () => {
  $$('.chip').forEach((c) => c.classList.remove('active'));
  const favChip = $('.chip-fav');
  if (favChip) favChip.classList.add('active');
  activeChip = 'favorites';
  render();
});

// Filter Inputs
searchInput.addEventListener('input', render);
dayFilter.addEventListener('change', render);
venueFilter.addEventListener('change', render);
timeFilter.addEventListener('change', render);

$('#refresh').addEventListener('click', () => loadSchedule({ fresh: true }));

$('#clear-filters').addEventListener('click', () => {
  searchInput.value = '';
  venueFilter.value = 'all';
  timeFilter.value = 'all';
  $$('.chip').forEach((c) => c.classList.remove('active'));
  $('[data-chip="all"]').classList.add('active');
  activeChip = 'all';
  renderDaysFilter(scheduleData.movies);
  render();
});

// IN-PLACE CARD TOGGLE: Click anywhere on card (or button) to expand/collapse smoothly
document.addEventListener('click', (e) => {
  // If clicking on an anchor, share button, or favorite button, let that action happen normally
  if (e.target.closest('a') || e.target.closest('.btn-share-icon') || e.target.closest('.fav-star-btn')) {
    // Check if favorite star clicked
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
    }
    return;
  }

  // Do NOT toggle if clicking inside the schedule panel (so clicking showtimes or selecting text doesn't collapse the card)
  if (e.target.closest('.movie-full-schedule-panel')) {
    return;
  }

  // Check if clicking on a movie card (triggers smooth in-place toggle)
  const card = e.target.closest('.movie-catalog-card');
  if (card) {
    const movieId = card.dataset.movieId;
    const willExpand = !card.classList.contains('is-expanded');
    
    // Toggle state class on the card
    card.classList.toggle('is-expanded', willExpand);
    
    // Update cue indicator
    const cueText = card.querySelector('.cue-text');
    const cueChevron = card.querySelector('.cue-chevron');
    const hintText = card.querySelector('.hint-text');
    if (cueText) cueText.textContent = willExpand ? 'Chiudi' : 'Orari';
    if (cueChevron) cueChevron.classList.toggle('is-rotated', willExpand);
    if (hintText) hintText.textContent = willExpand ? 'Tocca la card per chiudere' : 'Tocca la card per orari e sale';

    if (willExpand) {
      expandedMovies.add(movieId);
      // Smoothly scroll the card into view so the user stays perfectly focused on it
      requestAnimationFrame(() => {
        const headerOffset = 95;
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

  // Share Button
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
});

// Boot
setTodayBanner();
updateFavoritesBadge();
loadSchedule();
