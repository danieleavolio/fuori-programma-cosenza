const $ = (selector) => document.querySelector(selector);
const filmList = $('#film-list');
const dayFilter = $('#day-filter');
const venueFilter = $('#venue-filter');
const searchInput = $('#search');
let scheduleData;

const italianDate = (date) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace('.', '');
const parseDate = (value) => {
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
};
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function renderVenues(venues) {
  $('#venue-count').textContent = venues.length;
  venueFilter.innerHTML = '<option value="all">Tutti i cinema</option>' + venues.map((venue) => `<option value="${escapeHtml(venue.id)}">${escapeHtml(venue.name)}</option>`).join('');
  $('#cinema-list').innerHTML = venues.map((venue) => `<article class="cinema-item"><span class="cinema-name">${escapeHtml(venue.name)}</span><span class="cinema-location">${escapeHtml(venue.location)}</span><span class="cinema-status ${venue.status === 'available' ? 'available' : ''}">${venue.status === 'available' ? 'Programmazione online' : 'Fonte in collegamento'}</span>${venue.source ? `<a class="cinema-source" href="${escapeHtml(venue.source)}" target="_blank" rel="noreferrer">${escapeHtml(venue.sourceName || 'Fonte')} ↗</a>` : ''}</article>`).join('');
}

function renderDays(movies) {
  const dates = [...new Set(movies.flatMap((movie) => movie.shows.map((show) => show.date)))].sort((a, b) => parseDate(a) - parseDate(b));
  const today = new Date();
  const todayString = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const selected = dates.includes(todayString) ? todayString : dates[0];
  dayFilter.innerHTML = dates.map((date) => `<option value="${date}" ${date === selected ? 'selected' : ''}>${date === todayString ? 'Oggi' : italianDate(parseDate(date))}</option>`).join('');
  if (!dates.length) dayFilter.innerHTML = '<option value="">Nessuna data</option>';
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase('it');
  const date = dayFilter.value;
  const venue = venueFilter.value;
  const venues = Object.fromEntries(scheduleData.venues.map((item) => [item.id, item]));
  const visible = scheduleData.movies.map((movie) => ({ ...movie, shows: movie.shows.filter((show) => show.date === date && (venue === 'all' || show.venue === venue)) })).filter((movie) => movie.shows.length && movie.title.toLocaleLowerCase('it').includes(query));
  const showCount = visible.reduce((sum, movie) => sum + movie.shows.reduce((total, show) => total + show.shows.length, 0), 0);
  $('#result-summary').innerHTML = `<strong>${visible.length}</strong> ${visible.length === 1 ? 'film' : 'film'} <span>·</span> <strong>${showCount}</strong> orari <span>·</span> ${date ? italianDate(parseDate(date)) : 'nessuna data selezionata'}`;
  filmList.innerHTML = visible.map((movie, index) => `<article class="film-card" style="--card-index:${index}"><div class="movie-topline"><span class="movie-number">${String(index + 1).padStart(2, '0')}</span><span class="movie-category">${movie.tag ? escapeHtml(movie.tag) : 'IN SALA'}</span></div><div class="movie-main"><a class="poster-link" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer" aria-label="Apri la scheda di ${escapeHtml(movie.title)}"><span class="poster-sticker">AL CINEMA</span>${movie.poster ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="Locandina di ${escapeHtml(movie.title)}" loading="lazy" />` : `<span class="poster poster-missing" aria-label="Locandina non disponibile">${escapeHtml(movie.title.slice(0, 1))}</span>`}</a><div class="movie-info"><h3>${escapeHtml(movie.title)}</h3>${movie.duration ? `<span class="film-duration">⏱ ${escapeHtml(movie.duration)}</span>` : ''}<p class="movie-prompt">Scegli lo spettacolo</p></div></div><div class="showtime-groups">${movie.shows.map((show) => { const cinema = venues[show.venue]; return `<div class="showtime-group"><div class="venue-line"><span class="venue-pin" aria-hidden="true">●</span><span>${escapeHtml(cinema?.name || show.venue)}</span><small>${escapeHtml(cinema?.location || '')}</small></div><div class="times">${show.shows.map((entry) => `<a class="showtime" href="${escapeHtml(entry.url || movie.url)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(movie.title)}, ${escapeHtml(entry.time)}, ${escapeHtml(cinema?.name || 'cinema')}, ${escapeHtml(entry.room ? `sala ${entry.room}` : '')}"><strong>${escapeHtml(entry.time)}</strong><small>${entry.room ? `Sala ${escapeHtml(entry.room)}` : 'Biglietti'}</small></a>`).join('')}</div></div>`; }).join('')}</div><a class="card-more" href="${escapeHtml(movie.url)}" target="_blank" rel="noreferrer">Biglietti e dettagli <span aria-hidden="true">↗</span></a></article>`).join('');
  $('#empty-state').hidden = visible.length > 0;
  filmList.hidden = visible.length === 0;
}

function setToday() {
  const now = new Date();
  $('#today-date').dateTime = now.toISOString().slice(0, 10);
  $('#today-date').textContent = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

async function loadSchedule({ fresh = false } = {}) {
  const button = $('#refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`data/schedule.json${fresh ? `?t=${Date.now()}` : ''}`, { cache: fresh ? 'no-store' : 'default' });
    if (!response.ok) throw new Error('Non è stato possibile caricare la programmazione.');
    scheduleData = await response.json();
    renderVenues(scheduleData.venues);
    renderDays(scheduleData.movies);
    $('#updated-at').textContent = `DATI AGGIORNATI ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduleData.updatedAt))}`;
    render();
  } catch (error) {
    $('#result-summary').textContent = error.message;
    filmList.hidden = true;
    $('#empty-state').hidden = false;
    $('#empty-state h2').textContent = 'Programmazione non disponibile';
    $('#empty-state p').textContent = 'Controlla la connessione e riprova.';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

setToday();
searchInput.addEventListener('input', render);
dayFilter.addEventListener('change', render);
venueFilter.addEventListener('change', render);
$('#refresh').addEventListener('click', () => loadSchedule({ fresh: true }));
$('#clear-filters').addEventListener('click', () => { searchInput.value = ''; venueFilter.value = 'all'; renderDays(scheduleData.movies); render(); });
loadSchedule();
