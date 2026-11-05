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
const requiredVenues = ['andromeda-river', 'citrigno', 'cinema-teatro-italia', 'unical', 'garden'];

// State
let scheduleData = { venues: [], movies: [], updatedAt: '' };
let currentView = 'movies'; // 'movies' | 'schedule'
let activeChip = 'all'; // 'all' | 'today' | 'favorites'
let selectedDate = '';
let movieLayout = 'grid';
let dayLayout = 'grid';
let expandedDayMovie = '';
let expandedMovieGrid = '';
const expandedMovies = new Set();
let favorites = loadFavorites();

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
          <span class="cinema-status ${venue.status === 'available' ? 'available' : 'unavailable'}">
            ${venue.status === 'available' ? 'Fonte attiva' : 'Fonte non disponibile'}
          </span>
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
  return details.length ? `<p class="movie-credits">${details.join(' · ')}</p>` : '';
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
  return [...new Set(scheduleData.movies.flatMap((movie) => movieProgramming(movie).map((item) => item.date)))].sort((a, b) => parseDate(a) - parseDate(b));
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

// --- Main Render Dispatcher ---
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

  if (movieLayout === 'grid') {
    moviesGrid.classList.add('poster-movie-grid');
    moviesGrid.innerHTML = movies.map((movie) => {
      const isExpanded = expandedMovieGrid === movie.id;
      const relevantProgramming = movieProgramming(movie)
        .filter((item) => (selectedVenue === 'all' || item.venue === selectedVenue)
          && (activeChip !== 'today' || item.date === todayString));
      const relevantShows = movie.shows.filter((show) => (selectedVenue === 'all' || show.venue === selectedVenue)
        && (activeChip !== 'today' || show.date === todayString));
      const dates = [...new Set(relevantProgramming.map((item) => item.date))]
        .sort((a, b) => parseDate(a) - parseDate(b));
      const venues = [...new Set(relevantProgramming.map((item) => item.venue))];
      const showCount = relevantShows.reduce((total, show) => total + show.shows.length, 0);
      const poster = movie.poster
        ? `<img class="poster-grid-image" src="${escapeHtml(movie.poster)}" alt="" loading="lazy" />`
        : `<span class="poster-grid-image poster-grid-missing" aria-hidden="true">${escapeHtml(movie.title.slice(0, 1))}</span>`;
      const favorite = favorites.has(movie.id);

      return `
        <article class="poster-movie-card ${isExpanded ? 'is-expanded' : ''}" data-movie-id="${escapeHtml(movie.id)}">
          <button class="poster-grid-trigger" type="button" data-movie-grid-expand="${escapeHtml(movie.id)}" aria-expanded="${isExpanded}" aria-controls="movie-grid-detail-${escapeHtml(movie.id)}">
            ${poster}
            <span class="poster-grid-copy">
              <strong class="poster-grid-title">${escapeHtml(movie.title)}</strong>
              ${movie.duration ? `<span class="poster-grid-duration">${escapeHtml(cleanDuration(movie.duration))}</span>` : ''}
              <span class="poster-grid-venues">${venues.length === 1 ? escapeHtml(venuesMap[venues[0]]?.name || venues[0]) : `${venues.length} cinema`}</span>
              <span class="poster-grid-summary">${dates.length} ${dates.length === 1 ? 'data' : 'date'} · ${showCount} ${showCount === 1 ? 'orario' : 'orari'}</span>
            </span>
          </button>
          ${isExpanded ? `
            <div class="poster-grid-detail" id="movie-grid-detail-${escapeHtml(movie.id)}">
              <div class="poster-grid-detail-heading">
                <div>
                  <div class="movie-badges">
                    ${(movie.tags || []).map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('')}
                    ${(movie.genres || []).map((genre) => `<span class="badge-tag">${escapeHtml(genre)}</span>`).join('')}
                    ${movie.duration ? `<span class="film-duration">${escapeHtml(cleanDuration(movie.duration))}</span>` : ''}
                  </div>
                  <h3>${escapeHtml(movie.title)}</h3>
                  <p class="movie-synopsis">${movie.synopsis ? escapeHtml(movie.synopsis) : 'Sinossi non disponibile.'}</p>
                  ${renderMovieMetadata(movie)}
                </div>
                <div class="movie-actions">
                  ${renderShareMenu(movie)}
                  <button class="fav-star-btn ${favorite ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${favorite ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${favorite ? 'Rimuovi dai salvati' : 'Salva film'}">
                    <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  </button>
                </div>
              </div>
              <div class="dates-horizontal-grid">
                ${dates.map((date) => {
                  const dateShows = relevantShows.filter((show) => show.date === date);
                  const dateProgramming = relevantProgramming.filter((item) => item.date === date);
                  const venuesWithShows = new Set(dateShows.map((show) => show.venue));
                  return `
                    <section class="date-schedule-group">
                      <div class="date-group-header"><span class="date-badge">${date === todayString ? 'Oggi' : escapeHtml(italianDate(parseDate(date)))}</span><span class="date-full-text">${escapeHtml(date)}</span></div>
                      <div class="date-venues-grid">
                        ${dateProgramming.filter((item) => !venuesWithShows.has(item.venue)).map((item) => {
                          const cinema = venuesMap[item.venue] || { name: item.venue, location: '' };
                          return `<div class="venue-time-block"><div class="venue-time-header"><span class="venue-name">${escapeHtml(cinema.name)}</span><span class="venue-loc">${escapeHtml(cinema.location)}</span></div><p class="no-times-note">Data annunciata. Orari e biglietti non ancora disponibili.</p></div>`;
                        }).join('')}
                        ${dateShows.map((show) => {
                          const cinema = venuesMap[show.venue] || { name: show.venue, location: '' };
                          return `<div class="venue-time-block"><div class="venue-time-header"><span class="venue-name">${escapeHtml(cinema.name)}</span><span class="venue-loc">${escapeHtml(cinema.location)}</span></div><div class="times-buttons">${show.shows.map((entry) => `<a class="showtime-btn" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer" title="Acquista biglietto per ${escapeHtml(movie.title)} alle ${escapeHtml(entry.time)} al ${escapeHtml(cinema.name)}"><strong>${escapeHtml(entry.time)}</strong><small>${entry.room ? escapeHtml(roomLabel(entry.room)) : 'Biglietti'}</small></a>`).join('')}</div></div>`;
                        }).join('')}
                      </div>
                    </section>
                  `;
                }).join('')}
              </div>
              <a class="card-more" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer">Scheda ufficiale del film &rarr;</a>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
    return;
  }

  moviesGrid.classList.remove('poster-movie-grid');

  moviesGrid.innerHTML = movies.map((movie) => {
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

    const allMovieDates = [...new Set(venueProgramming.map((item) => item.date))];
    const isOnlyToday = allMovieDates.length === 1 && allMovieDates[0] === todayString;
    const showCount = relevantShows.reduce((sum, show) => sum + show.shows.length, 0);

    return `
      <article class="movie-catalog-card ${isExpanded ? 'is-expanded' : ''}" data-movie-id="${escapeHtml(movie.id)}">
        <div class="movie-card-body">
          ${renderPosterLink(movie, venueIds, venuesMap, selectedVenue)}

          <div class="movie-card-details">
            <div class="movie-card-meta">
              <div class="movie-badges">
                ${isOnlyToday ? `<span class="badge-last-chance">Solo oggi</span>` : ''}
                ${movie.tags && movie.tags.length ? movie.tags.map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('') : ''}
                ${(movie.genres || []).map((genre) => `<span class="badge-tag">${escapeHtml(genre)}</span>`).join('')}
                ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
              </div>
            </div>
            <div class="movie-title-row">
              <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
              <div class="movie-actions">
                ${renderShareMenu(movie)}
                <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
                  <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                </button>
              </div>
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

            <button class="schedule-toggle" type="button" aria-expanded="${isExpanded}" aria-controls="schedule-${escapeHtml(movie.id)}" data-schedule-id="${escapeHtml(movie.id)}">
              <span>${isExpanded ? 'Nascondi dettagli' : `Date, orari e biglietti · ${showCount}`}</span>
              <svg class="cue-chevron ${isExpanded ? 'is-rotated' : ''}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
        </div>

        <!-- Sezione orari dettagliata con animazione fluida in CSS Grid -->
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
                              <div class="venue-time-header">
                                <span class="venue-name">${escapeHtml(cinema.name)}</span>
                                <span class="venue-loc">${escapeHtml(cinema.location)}</span>
                              </div>
                              <div class="times-buttons">
                                ${s.shows.map((entry) => `
                                  <div class="time-item-wrapper">
                                    <a class="showtime-btn" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer" title="Acquista biglietto per ${escapeHtml(movie.title)} alle ${escapeHtml(entry.time)} al ${escapeHtml(cinema.name)}">
                                      <strong>${escapeHtml(entry.time)}</strong>
                                      <small>${entry.room ? escapeHtml(roomLabel(entry.room)) : 'Biglietti'}</small>
                                    </a>
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
    const selectedVenue = venueFilter?.value || 'all';
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

  if (dayLayout === 'grid') {
    filmList.classList.add('day-movie-grid');
    filmList.innerHTML = visible.map((movie) => {
      const isExpanded = expandedDayMovie === movie.id;
      const isFav = favorites.has(movie.id);
      const dayShows = movie.shows;
      const venueDetails = movie.dayProgramming.map((item) => {
        const cinema = venuesMap[item.venue] || { name: item.venue };
        const show = dayShows.find((entry) => entry.venue === item.venue);
        const times = show?.shows.map((entry) => entry.time).join(' · ');
        return `<span class="day-grid-venue"><strong>${escapeHtml(cinema.name)}</strong><small>${times ? escapeHtml(times) : 'In programmazione · orari non disponibili'}</small></span>`;
      }).join('');
      const image = movie.poster
        ? `<img class="day-grid-poster" src="${escapeHtml(movie.poster)}" alt="" loading="lazy" />`
        : `<span class="day-grid-poster poster-missing" aria-hidden="true">${escapeHtml(movie.title.slice(0, 1))}</span>`;
      return `
        <article class="day-grid-card ${isExpanded ? 'is-expanded' : ''}" data-movie-id="${escapeHtml(movie.id)}">
          <button class="day-grid-trigger" type="button" data-day-grid-expand="${escapeHtml(movie.id)}" aria-expanded="${isExpanded}" aria-controls="day-detail-${escapeHtml(movie.id)}">
            ${image}
            <span class="day-grid-copy">
              <strong class="day-grid-title">${escapeHtml(movie.title)}</strong>
              ${movie.duration ? `<span class="day-grid-duration">${escapeHtml(cleanDuration(movie.duration))}</span>` : ''}
              <span class="day-grid-venues">${venueDetails}</span>
              <span class="day-grid-times">${escapeHtml(formatDayLabel(dayDate))}</span>
            </span>
          </button>
          ${isExpanded ? `
            <div class="day-grid-detail" id="day-detail-${escapeHtml(movie.id)}">
              <div class="day-grid-detail-heading">
                <div>
                  <p class="day-grid-kicker">${escapeHtml(dayDisplay)}</p>
                  <h3>${escapeHtml(movie.title)}</h3>
                  ${movie.synopsis ? `<p class="movie-synopsis">${escapeHtml(movie.synopsis)}</p>` : ''}
                  ${renderMovieMetadata(movie)}
                </div>
                <div class="movie-actions">
                  ${renderShareMenu(movie)}
                  <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
                    <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                  </button>
                </div>
              </div>
              <div class="day-grid-screenings">
                ${movie.dayProgramming.map((item) => {
                  const cinema = venuesMap[item.venue] || { name: item.venue, location: '' };
                  const show = dayShows.find((entry) => entry.venue === item.venue);
                  return `
                    <section class="day-grid-screening">
                      <div class="venue-line"><strong>${escapeHtml(cinema.name)}</strong><span class="venue-location-inline">${escapeHtml(cinema.location)}</span></div>
                      ${show ? `<div class="times">${show.shows.map((entry) => `<a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(entry.time)}</strong><small>${entry.room ? escapeHtml(roomLabel(entry.room)) : 'Biglietti'}</small></a>`).join('')}</div>` : '<p class="no-times-note">Data annunciata. Orari e biglietti non ancora disponibili.</p>'}
                    </section>
                  `;
                }).join('')}
              </div>
              <a class="card-more" href="${escapeHtml(movieUrlForVenue(movie, movie.dayProgramming[0]?.venue))}" target="_blank" rel="noreferrer">Dettagli e scheda ufficiale &rarr;</a>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
    return;
  }

  filmList.classList.remove('day-movie-grid');

  filmList.innerHTML = visible.map((movie) => {
    const isFav = favorites.has(movie.id);
    const durationText = cleanDuration(movie.duration);
    const detailsUrl = movieUrlForVenue(movie, movie.dayProgramming[0]?.venue);

    return `
      <article class="film-card" data-movie-id="${escapeHtml(movie.id)}">
        <div class="movie-topline">
          <div class="topline-left">
            ${movie.tags && movie.tags.length ? movie.tags.map((tag) => `<span class="badge-tag">${escapeHtml(tag)}</span>`).join('') : ''}
            ${(movie.genres || []).map((genre) => `<span class="badge-tag">${escapeHtml(genre)}</span>`).join('')}
            ${durationText ? `<span class="film-duration">${escapeHtml(durationText)}</span>` : ''}
          </div>
        </div>

        <div class="movie-main">
            ${renderPosterLink(movie, movie.dayProgramming.map((item) => item.venue), venuesMap)}
          <div class="movie-info">
            <div class="movie-title-row">
              <h3>${escapeHtml(movie.title)}</h3>
              <div class="movie-actions">
                ${renderShareMenu(movie)}
                <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva film'}">
                  <svg class="bookmark-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                </button>
              </div>
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
                      <a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer">
                        <strong>${escapeHtml(entry.time)}</strong>
                        <small>${entry.room ? escapeHtml(roomLabel(entry.room)) : 'Biglietti'}</small>
                      </a>
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
    const venuesById = Object.fromEntries((scheduleData.venues || []).map((item) => [item.id, item]));
    const inactiveVenues = requiredVenues.filter((id) => venuesById[id]?.status !== 'available');
    if (inactiveVenues.length) {
      throw new Error(`Programmazione incompleta: ${inactiveVenues.map((id) => venuesById[id]?.name || id).join(', ')} non risponde. Riprova più tardi.`);
    }
    renderVenuesInfo(scheduleData.venues);
    renderGenreOptions(scheduleData.movies);
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

// In-place accordion card toggle (con scroll fluido centrato)
document.addEventListener('click', (e) => {
  const movieGridButton = e.target.closest('[data-movie-grid-expand]');
  if (movieGridButton) {
    const movieId = movieGridButton.dataset.movieGridExpand;
    expandedMovieGrid = expandedMovieGrid === movieId ? '' : movieId;
    render();
    moviesGrid.querySelector(`[data-movie-grid-expand="${CSS.escape(movieId)}"]`)?.focus({ preventScroll: true });
    return;
  }

  const dayGridButton = e.target.closest('[data-day-grid-expand]');
  if (dayGridButton) {
    const movieId = dayGridButton.dataset.dayGridExpand;
    expandedDayMovie = expandedDayMovie === dayGridButton.dataset.dayGridExpand
      ? ''
      : movieId;
    render();
    filmList.querySelector(`[data-day-grid-expand="${CSS.escape(movieId)}"]`)?.focus({ preventScroll: true });
    return;
  }

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
    scheduleToggle.setAttribute('aria-expanded', String(willExpand));
    scheduleToggle.querySelector('span').textContent = willExpand
      ? 'Nascondi gli orari'
      : `Orari e biglietti · ${card.querySelectorAll('.showtime-btn').length}`;
    scheduleToggle.querySelector('.cue-chevron').classList.toggle('is-rotated', willExpand);
    panel.hidden = !willExpand;
    card.classList.toggle('is-expanded', willExpand);
    if (willExpand) expandedMovies.add(movieId);
    else expandedMovies.delete(movieId);
  }
});

// Boot
updateFavoritesBadge();
loadSchedule();
