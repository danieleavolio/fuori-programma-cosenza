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

const isWeekend = (dateObj) => {
  const day = dateObj.getDay();
  // 5 = Venerdì, 6 = Sabato, 0 = Domenica
  return day === 5 || day === 6 || day === 0;
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char]);

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

function toggleFavorite(movieId) {
  if (favorites.has(movieId)) {
    favorites.delete(movieId);
    showToast('Film rimosso dai promemoria');
  } else {
    favorites.add(movieId);
    showToast('Film salvato nei tuoi promemoria ★');
  }
  saveFavorites();
  render();
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
    setTimeout(() => { toastEl.hidden = true; }, 300);
  }, 2600);
}

function shareShowtime({ title, venueName, dateStr, timeStr, url }) {
  const dObj = parseDate(dateStr);
  const formattedDay = (dateStr === getTodayString()) ? 'Oggi' : italianDate(dObj);
  const text = `🍿 Andiamo al cinema a vedere "${title}"?\n📍 ${venueName}\n🗓 ${formattedDay} (${dateStr}) alle ${timeStr}\n🎟 Info e biglietti: ${url}`;

  if (navigator.share && window.isSecureContext) {
    navigator.share({ title: `Cinema: ${title}`, text: text, url: url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Invito copiato! Incollalo su WhatsApp o Telegram 🍿');
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
          ${venue.status === 'available' ? '● Programmazione online' : '○ In aggiornamento'}
        </span>
        ${venue.source ? `<a class="cinema-source" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">${escapeHtml(venue.sourceName || 'Biglietteria')} ↗</a>` : ''}
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
      ${date === todayString ? 'Oggi (' + date.slice(0, 5) + ')' : italianDate(parseDate(date)) + ' (' + date.slice(0, 5) + ')'}
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

  // Update Section Headers and Filter Visibility based on view mode
  if (currentView === 'movies') {
    sectionEyebrow.textContent = 'CATALOGO FILM';
    sectionTitle.textContent = 'Tutti i film in sala';
    filterGroupDay.style.display = 'none';
  } else if (currentView === 'schedule') {
    sectionEyebrow.textContent = 'ORARI DEL GIORNO';
    sectionTitle.textContent = 'Che si guarda stasera?';
    filterGroupDay.style.display = 'block';
  } else if (currentView === 'venues') {
    sectionEyebrow.textContent = 'LE SALE';
    sectionTitle.textContent = 'Programmazione per cinema';
    filterGroupDay.style.display = 'none';
  }

  // Filter movies
  let filteredMovies = scheduleData.movies.filter((movie) => {
    // 1. Text Search (title or matching venue)
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

  // Render specific view
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
  $('#result-summary').innerHTML = `<strong>${movies.length}</strong> ${movies.length === 1 ? 'film in cartellone' : 'film in cartellone'} <span>·</span> <strong>${totalShows}</strong> proiezioni disponibili`;

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

    // Filter movie shows by selected venue / time if applied
    const relevantShows = movie.shows.filter((s) => {
      if (selectedVenue !== 'all' && s.venue !== selectedVenue) return false;
      if (selectedTime !== 'all') {
        return s.shows.some((entry) => matchesTimeSlot(entry.time, selectedTime));
      }
      return true;
    });

    // Extract unique venues screening this film
    const venueIds = [...new Set(relevantShows.map((s) => s.venue))];
    const venuesPlaying = venueIds.map((id) => venuesMap[id] || { id, name: id, location: '' });

    // Group dates for this movie
    const datesAvailable = [...new Set(relevantShows.map((s) => s.date))].sort((a, b) => parseDate(a) - parseDate(b));

    return `
      <article class="movie-catalog-card ${isExpanded ? 'is-expanded' : ''}" data-movie-id="${escapeHtml(movie.id)}" style="--card-index:${index}">
        <div class="movie-card-topline">
          <div class="topline-left">
            <span class="movie-rank">#${String(index + 1).padStart(2, '0')}</span>
            ${movie.duration ? `<span class="film-duration">⏱ ${escapeHtml(movie.duration)}</span>` : ''}
          </div>
          <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva nei promemoria'}" aria-label="${isFav ? 'Rimuovi dai salvati' : 'Salva nei promemoria'}">
            ★
          </button>
        </div>

        <div class="movie-card-body">
          <a class="poster-link" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer" aria-label="Locandina di ${escapeHtml(movie.title)}">
            <span class="poster-sticker">AL CINEMA</span>
            ${movie.poster ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="Locandina di ${escapeHtml(movie.title)}" loading="lazy" />` : `<span class="poster poster-missing">${escapeHtml(movie.title.slice(0, 1))}</span>`}
          </a>

          <div class="movie-card-details">
            <h3 class="movie-title">${escapeHtml(movie.title)}</h3>

            <!-- Sale dove viene proiettato -->
            <div class="venues-summary-block">
              <span class="meta-label">IN SALA A:</span>
              <div class="venue-pill-list">
                ${venuesPlaying.length ? venuesPlaying.map((v) => `<span class="cinema-pill" title="${escapeHtml(v.location)}">📍 <strong>${escapeHtml(v.name)}</strong> <small>(${escapeHtml(v.location)})</small></span>`).join('') : '<span class="cinema-pill none">Nessun cinema con i filtri attuali</span>'}
              </div>
            </div>

            <!-- Date disponibili -->
            <div class="days-summary-block">
              <span class="meta-label">DISPONIBILITÀ:</span>
              <div class="days-chip-list">
                ${datesAvailable.map((d) => `<span class="date-chip ${d === todayString ? 'is-today' : ''}">${d === todayString ? 'Oggi' : italianDate(parseDate(d))}</span>`).join('')}
              </div>
            </div>

            <!-- Pulsante espansione orari completi -->
            <button class="toggle-schedule-btn" type="button" data-toggle-movie="${escapeHtml(movie.id)}" aria-expanded="${isExpanded}">
              <span>${isExpanded ? 'Nascondi orari completi' : 'Vedi tutti i giorni, sale e orari'}</span>
              <span class="toggle-icon">${isExpanded ? '▲' : '▼'}</span>
            </button>
          </div>
        </div>

        <!-- Sezione orari dettagliata (giorno per giorno) -->
        <div class="movie-full-schedule-panel" ${isExpanded ? '' : 'hidden'}>
          <div class="schedule-panel-inner">
            <h4 class="schedule-panel-title">TUTTI GLI ORARI PER DATA E CINEMA:</h4>
            ${datesAvailable.length ? datesAvailable.map((dateStr) => {
              const dShows = relevantShows.filter((s) => s.date === dateStr);
              return `
                <div class="date-schedule-group">
                  <div class="date-group-header">
                    <span class="date-badge ${dateStr === todayString ? 'today-badge' : ''}">${dateStr === todayString ? 'OGGI' : italianDate(parseDate(dateStr)).toUpperCase()}</span>
                    <span class="date-full-text">${dateStr}</span>
                  </div>
                  <div class="date-venues-grid">
                    ${dShows.map((s) => {
                      const cinema = venuesMap[s.venue] || { name: s.venue, location: '' };
                      const matchingTimes = selectedTime === 'all' ? s.shows : s.shows.filter((entry) => matchesTimeSlot(entry.time, selectedTime));
                      return `
                        <div class="venue-time-block">
                          <div class="venue-time-header">
                            <span class="venue-dot">●</span>
                            <span class="venue-name">${escapeHtml(cinema.name)}</span>
                            <small class="venue-loc">${escapeHtml(cinema.location)}</small>
                          </div>
                          <div class="times-buttons">
                            ${matchingTimes.map((entry) => `
                              <div class="time-item-wrapper">
                                <a class="showtime-btn" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer" title="Acquista biglietto per ${escapeHtml(movie.title)} alle ${escapeHtml(entry.time)} al ${escapeHtml(cinema.name)}">
                                  <strong>${escapeHtml(entry.time)}</strong>
                                  <small>${entry.room ? 'Sala ' + escapeHtml(entry.room) : 'Biglietti'}</small>
                                </a>
                                <button class="btn-share-icon" type="button" title="Condividi spettacolo con amici" data-share-title="${escapeHtml(movie.title)}" data-share-venue="${escapeHtml(cinema.name)}" data-share-date="${escapeHtml(dateStr)}" data-share-time="${escapeHtml(entry.time)}" data-share-url="${escapeHtml(entry.url || movie.url)}">
                                  ↗
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
            }).join('') : '<p class="no-times-note">Nessuno spettacolo corrisponde ai filtri selezionati.</p>'}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// ==========================================
// VIEW 2: Programmazione per Giorno e Orari
// ==========================================
function renderScheduleDayView(movies, venuesMap, selectedDate, selectedVenue, selectedTime) {
  moviesGrid.hidden = true;
  filmList.hidden = false;
  venuesView.hidden = true;

  // Filter shows to selected date
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
  $('#result-summary').innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} <span>·</span> <strong>${showCount}</strong> orari <span>·</span> ${selectedDate ? italianDate(parseDate(selectedDate)) : 'nessuna data'}`;

  if (visible.length === 0) {
    $('#empty-state').hidden = false;
    filmList.hidden = true;
    return;
  }
  $('#empty-state').hidden = true;

  filmList.innerHTML = visible.map((movie, index) => {
    const isFav = favorites.has(movie.id);
    return `
      <article class="film-card" style="--card-index:${index}">
        <div class="movie-topline">
          <div class="topline-left">
            <span class="movie-number">#${String(index + 1).padStart(2, '0')}</span>
            <span class="movie-category">${movie.tag ? escapeHtml(movie.tag) : 'IN SALA'}</span>
          </div>
          <button class="fav-star-btn ${isFav ? 'is-favorite' : ''}" type="button" data-fav-id="${escapeHtml(movie.id)}" title="${isFav ? 'Rimuovi dai salvati' : 'Salva nei promemoria'}" aria-label="Salva preferito">
            ★
          </button>
        </div>
        <div class="movie-main">
          <a class="poster-link" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer" aria-label="Locandina di ${escapeHtml(movie.title)}">
            <span class="poster-sticker">AL CINEMA</span>
            ${movie.poster ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="Locandina di ${escapeHtml(movie.title)}" loading="lazy" />` : `<span class="poster poster-missing">${escapeHtml(movie.title.slice(0, 1))}</span>`}
          </a>
          <div class="movie-info">
            <h3>${escapeHtml(movie.title)}</h3>
            ${movie.duration ? `<span class="film-duration">⏱ ${escapeHtml(movie.duration)}</span>` : ''}
            <p class="movie-prompt">Scegli orario e cinema:</p>
          </div>
        </div>
        <div class="showtime-groups">
          ${movie.shows.map((show) => {
            const cinema = venuesMap[show.venue] || { name: show.venue, location: '' };
            return `
              <div class="showtime-group">
                <div class="venue-line">
                  <span class="venue-pin" aria-hidden="true">●</span>
                  <span>${escapeHtml(cinema.name)}</span>
                  <small>${escapeHtml(cinema.location)}</small>
                </div>
                <div class="times">
                  ${show.shows.map((entry) => `
                    <div class="time-item-wrapper">
                      <a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer">
                        <strong>${escapeHtml(entry.time)}</strong>
                        <small>${entry.room ? 'Sala ' + escapeHtml(entry.room) : 'Biglietti'}</small>
                      </a>
                      <button class="btn-share-icon" type="button" title="Condividi spettacolo con amici" data-share-title="${escapeHtml(movie.title)}" data-share-venue="${escapeHtml(cinema.name)}" data-share-date="${escapeHtml(show.date)}" data-share-time="${escapeHtml(entry.time)}" data-share-url="${escapeHtml(entry.url || movie.url)}">
                        ↗
                      </button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <a class="card-more" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer">
          Biglietti e dettagli ufficiali <span aria-hidden="true">↗</span>
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
  $('#result-summary').innerHTML = `<strong>${targetVenues.length}</strong> cinema attivi <span>·</span> Esplora la programmazione per ciascuna sala`;

  venuesView.innerHTML = targetVenues.map((venue) => {
    // Collect all movies screening in this venue
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
            <p class="venue-block-meta">${venue.status === 'available' ? '● Programmazione verificata e online' : '○ In fase di collegamento'}</p>
          </div>
          ${venue.source ? `
            <a class="venue-official-btn" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">
              Cassa e Biglietti ${escapeHtml(venue.sourceName || '')} ↗
            </a>
          ` : ''}
        </div>

        <div class="venue-movies-list">
          ${venueMovies.length ? venueMovies.map((movie) => `
            <article class="venue-movie-row">
              <a class="row-poster-thumb" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer">
                ${movie.poster ? `<img src="${escapeHtml(movie.poster)}" alt="${escapeHtml(movie.title)}" loading="lazy" />` : `<span>${escapeHtml(movie.title.slice(0, 1))}</span>`}
              </a>
              <div class="row-info">
                <div class="row-headline">
                  <h4>${escapeHtml(movie.title)}</h4>
                  ${movie.duration ? `<span class="film-duration">⏱ ${escapeHtml(movie.duration)}</span>` : ''}
                </div>
                <div class="row-dates">
                  ${movie.venueShows.map((vShow) => `
                    <div class="row-day-times">
                      <span class="row-day-badge">${vShow.date === getTodayString() ? 'Oggi' : italianDate(parseDate(vShow.date))}</span>
                      <div class="times">
                        ${vShow.shows.map((entry) => `
                          <div class="time-item-wrapper">
                            <a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer">
                              <strong>${escapeHtml(entry.time)}</strong>
                              <small>${entry.room ? 'Sala ' + escapeHtml(entry.room) : 'Biglietti'}</small>
                            </a>
                            <button class="btn-share-icon" type="button" title="Condividi spettacolo con amici" data-share-title="${escapeHtml(movie.title)}" data-share-venue="${escapeHtml(venue.name)}" data-share-date="${escapeHtml(vShow.date)}" data-share-time="${escapeHtml(entry.time)}" data-share-url="${escapeHtml(entry.url || movie.url)}">
                              ↗
                            </button>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </article>
          `).join('') : '<p class="empty-venue-note">Nessun film in programmazione per questa sala con i filtri attuali.</p>'}
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
    $('#updated-at').textContent = `AGGIORNATO IL ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduleData.updatedAt))}`;
    render();
  } catch (error) {
    $('#result-summary').textContent = error.message;
    moviesGrid.hidden = true;
    filmList.hidden = true;
    venuesView.hidden = true;
    $('#empty-state').hidden = false;
    $('#empty-state h2').textContent = 'Programmazione temporaneamente non disponibile';
    $('#empty-msg').textContent = 'Controlla la connessione e riprova tra pochi istanti.';
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

// Delegated Clicks for Accordion Toggle, Favorites, and Share
document.addEventListener('click', (e) => {
  // 1. Toggle Movie Schedule Accordion
  const toggleBtn = e.target.closest('[data-toggle-movie]');
  if (toggleBtn) {
    const movieId = toggleBtn.dataset.toggleMovie;
    if (expandedMovies.has(movieId)) {
      expandedMovies.delete(movieId);
    } else {
      expandedMovies.add(movieId);
    }
    render();
    return;
  }

  // 2. Favorite Star Button
  const favBtn = e.target.closest('[data-fav-id]');
  if (favBtn) {
    e.stopPropagation();
    toggleFavorite(favBtn.dataset.favId);
    return;
  }

  // 3. Share Button
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
