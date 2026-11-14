import type { Movie, ScreeningGroup, Show, Venue } from './data';

type EnrichedShow = Show & { date: string; venue: string };
type ShowGroup = { date: string; venue: string; shows: Show[] };

const escapeHtml = (value: unknown = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char] as string));

const pad2 = (value: number) => String(value).padStart(2, '0');

const timeLabel = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const parseDate = (value?: string) => {
  if (!value) return new Date();
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
};

const dateString = (date: Date) => `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;

const getTodayString = (now: Date) => dateString(now);

const isPastDate = (dateStr: string, now: Date) => {
  const [day, month, year] = dateStr.split('/').map(Number);
  if (!year || !month || !day) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return new Date(year, month - 1, day) < today;
};

const italianDate = (date: Date) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  .format(date).replace('.', '');

const formatDayLabel = (dateStr: string, now: Date) => (dateStr === getTodayString(now) ? 'Oggi' : italianDate(parseDate(dateStr)));

const cleanDuration = (raw?: string) => {
  if (!raw) return '';
  return String(raw).replace(/H/i, 'h ').replace(/['’]/g, 'm').replace(/\s+/g, ' ').trim();
};

const parseDurationMinutes = (raw?: string) => {
  const text = String(raw || '').toLocaleLowerCase('it');
  const hours = Number((text.match(/(\d+)\s*h/) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+)\s*m/) || [])[1] || 0);
  return hours * 60 + minutes;
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60000);

const wallClockDate = (dateStr: string, timeStr: string) => {
  const [day, month, year] = String(dateStr || '').split('/').map(Number);
  const [hours, minutes] = String(timeStr || '').split(':').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
};

const roomLabel = (room?: string) => (room && /^sala\b/i.test(room) ? room : `Sala ${room}`);

const readableISODate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '';
};

const showtimeFormats = (entry: Show) => {
  const declared = [entry.format, entry.language, entry.version, entry.room, ...(entry.tags || [])].filter(Boolean).join(' ');
  const flags: string[] = [];
  if (/(?:\b(?:OV|VO)\b|V\.O\.|versione originale|original version)/i.test(declared)) flags.push('V.O.');
  if (entry.subtitles || /\b(?:sottotitol[io]|sub(?:\s*ita)?)\b/i.test(declared)) flags.push('Sottotitoli');
  if (/\b3D\b/i.test(declared)) flags.push('3D');
  return flags;
};

function ratingInfo(movie: Movie) {
  const source = movie.external || {};
  const rating = Number(source.rating);
  let url = '';
  try {
    const parsed = new URL(String(source.url));
    if (parsed.protocol === 'https:' && parsed.hostname === 'www.mymovies.it') url = parsed.href;
  } catch {
    url = '';
  }
  return {
    ...source,
    rating: url && rating > 0 && rating <= 5 ? rating : 0,
    ratingCount: Math.max(0, Number(source.ratingCount) || 0),
    url,
  };
}

function renderMovieRating(movie: Movie) {
  const info = ratingInfo(movie);
  if (!info.rating) return '<p class="movie-rating rating-unavailable">Voto non disponibile</p>';
  const value = info.rating.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `<a class="movie-rating" href="${escapeHtml(info.url)}" target="_blank" rel="noreferrer"
    aria-label="Voto complessivo MYmovies: ${value} su 5. Apri la fonte">
    <span class="rating-value"><span aria-hidden="true">★</span> ${value}<small>/5</small></span><span class="rating-source">MYmovies</span></a>`;
}

function renderRatingDetails(movie: Movie) {
  const info = ratingInfo(movie);
  if (!info.url) return '';
  const score = (value?: number) => (Number(value) > 0 && Number(value) <= 5
    ? `${Number(value).toLocaleString('it-IT', { maximumFractionDigits: 2 })}/5` : 'Non disponibile');
  return `<section class="rating-details" aria-label="Valutazioni MYmovies">
    <div class="rating-breakdown"><p><span>Complessivo</span><strong>${score(info.rating)}</strong></p>
    <p><span>Critica</span><strong>${score(info.criticsRating)}</strong></p>
    <p><span>Pubblico</span><strong>${score(info.audienceRating)}</strong></p></div>
    <p>${info.ratingCount ? `${info.ratingCount.toLocaleString('it-IT')} valutazioni complessive. ${info.ratingCount < 10 ? 'Campione ancora piccolo. ' : ''}` : 'Numero di valutazioni non disponibile. '}
    Il voto complessivo MYmovies include fonti diverse: non è il solo voto del pubblico.</p>
    <a href="${escapeHtml(info.url)}" target="_blank" rel="noreferrer">Fonte: MYmovies ↗</a>
    ${info.checkedAt ? `<small>Verificato il ${escapeHtml(readableISODate(String(info.checkedAt)))}</small>` : ''}
  </section>`;
}

function renderMovieMetadata(movie: Movie) {
  const details: string[] = [];
  if (movie.director) details.push(`Regia: ${escapeHtml(movie.director)}`);
  if (movie.year) details.push(escapeHtml(movie.year));
  if (movie.language) details.push(escapeHtml(movie.language));
  return `<p class="movie-credits" title="${details.join(' · ')}">${details.join(' · ')}</p>`;
}

function renderTrailerLink(movie: Movie) {
  let url = '';
  if (movie.trailer) {
    try {
      const parsed = new URL(movie.trailer);
      if (/^https?:$/.test(parsed.protocol)) url = parsed.href;
    } catch {
      url = '';
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

function renderShareMenu(movie: Movie) {
  return `<button class="btn-share-icon" type="button" title="Condividi film" aria-label="Condividi ${escapeHtml(movie.title)} con locandina e orari" data-share-film="${escapeHtml(movie.id)}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    </button>`;
}

function movieUrlForVenue(movie: Movie, venueId: string) {
  return movie.venueUrls?.[venueId] || movie.url;
}

function movieProgramming(movie: Movie) {
  const dates = new Map<string, { date: string; venue: string }>();
  for (const item of movie.announcedDates || []) {
    dates.set(`${item.date}|${item.venue}`, item);
  }
  for (const show of movie.shows || []) {
    const key = `${show.date}|${show.venue}`;
    if (!dates.has(key)) dates.set(key, { date: show.date, venue: show.venue });
  }
  return [...dates.values()];
}

function renderPosterLink(movie: Movie, panelId: string) {
  const image = movie.poster
    ? `<img class="poster" src="${escapeHtml(movie.poster)}" alt="" loading="lazy" />`
    : `<span class="poster poster-missing" aria-hidden="true">${escapeHtml(movie.title.slice(0, 1))}</span>`;

  return `<button class="poster-link" type="button" data-card-open
    aria-expanded="false" aria-controls="${escapeHtml(panelId)}"
    aria-label="Apri la scheda, le sale e gli orari di ${escapeHtml(movie.title)}">${image}</button>`;
}

function nextShowtime(shows: ScreeningGroup[], durationRaw: string | undefined, now: Date) {
  const duration = parseDurationMinutes(durationRaw);
  const entries = [];
  for (const group of shows) {
    for (const entry of group.shows) {
      const startsAt = wallClockDate(group.date, entry.time);
      entries.push({ date: group.date, time: entry.time, venue: group.venue, startsAt, duration });
    }
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const upcoming = entries.filter((entry) => entry.startsAt >= now);
  return upcoming.length ? upcoming[0] : null;
}

function showtimeChipHtml(movie: Movie, cinema: { id: string; name: string; location?: string }, dateStr: string, entry: Show, isPast = false) {
  const minutes = parseDurationMinutes(movie.duration);
  const end = minutes ? addMinutes(wallClockDate(dateStr, entry.time), minutes) : null;
  const endsAt = end ? `${timeLabel(end)}${dateString(end) !== dateStr ? ' (+1g)' : ''}` : '';
  const flags = showtimeFormats(entry);
  return `
    <button class="showtime-btn${isPast ? ' is-past' : ''}" type="button" data-showtime aria-haspopup="menu" aria-controls="showtime-menu" aria-expanded="false"
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

function periodDateMatches(dateStr: string, now: Date) {
  return !isPastDate(dateStr, now);
}

function catalogSelection(movie: Movie, now: Date) {
  const venueShows = movie.shows || [];
  const venueProgramming = movieProgramming(movie);
  const relevantShows = venueShows
    .filter((group) => periodDateMatches(group.date, now))
    .map((group) => ({ ...group, shows: group.shows.filter((entry) => wallClockDate(group.date, entry.time) >= now) }))
    .filter((group) => group.shows.length);
  const relevantProgramming = venueProgramming
    .filter((item) => periodDateMatches(item.date, now))
    .filter((item) => relevantShows.some((group) => group.date === item.date && group.venue === item.venue)
      || !venueShows.some((group) => group.date === item.date && group.venue === item.venue && group.shows.length));
  return { shows: relevantShows, programming: relevantProgramming };
}

function movieCardHtml(
  movie: Movie,
  venuesMap: Record<string, Venue>,
  selection: { shows: ShowGroup[]; programming: { date: string; venue: string }[] },
  now: Date,
  paths: Record<string, string> = {},
) {
  const { shows, programming } = selection;
  const cardKey = `movies-${movie.id}`;
  const panelId = `schedule-${cardKey}`;
  const filmPath = paths[movie.id];
  const venueIds = [...new Set(programming.map((item) => item.venue))];
  const dates = [...new Set(programming.map((item) => item.date))].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());
  const durationText = cleanDuration(movie.duration);
  const showCount = shows.reduce((sum, group) => sum + group.shows.length, 0);
  const next = nextShowtime(shows, movie.duration, now);
  const first = shows.flatMap((group) => group.shows.map((entry) => ({
    ...entry, date: group.date, venue: group.venue,
  }))).sort((a, b) => wallClockDate(a.date, a.time).getTime() - wallClockDate(b.date, b.time).getTime())[0];
  const preview = next || first;
  const previewTitle = next ? 'Prossimo spettacolo' : preview ? 'Spettacolo iniziato' : 'Data annunciata';
  const previewDate = preview ? formatDayLabel(preview.date, now) : dates.length ? formatDayLabel(dates[0], now) : 'Orari in arrivo';
  const previewVenue = preview ? (venuesMap[preview.venue]?.name || preview.venue) : 'Orari non ancora pubblicati';
  const publishedDates = [...new Set(movieProgramming(movie).map((item) => item.date))].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());
  const age = now.getTime() - Date.parse(movie.firstSeenAt || '');
  const today = dateString(now).split('/').reverse().join('-');
  const state = movie.releaseDateIT && movie.releaseDateIT > today ? 'Prossimamente'
    : age >= 0 && age < 7 * 86400000 ? 'Nuovo sul sito' : '';

  return `
    <article class="movie-catalog-card "
      id="film-${escapeHtml(movie.id)}" data-movie-id="${escapeHtml(movie.id)}"
      data-card-key="${escapeHtml(cardKey)}" style="view-transition-name: film-${escapeHtml(cardKey)}">
      <div class="movie-card-body">
        ${renderPosterLink(movie, panelId)}

        <div class="movie-card-details">
          <div class="movie-title-row">
            <span class="movie-state">${escapeHtml(state)}</span>
            <h3 class="movie-title" title="${escapeHtml(movie.title)}">${filmPath ? `<a href="${escapeHtml(filmPath)}">${escapeHtml(movie.title)}</a>` : escapeHtml(movie.title)}</h3>
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
              ${(movie.genres || []).length ? `<p><strong>Generi</strong> ${escapeHtml(movie.genres!.join(', '))}</p>` : ''}
              ${(movie.tags || []).length ? `<p><strong>Info dalla sala</strong> ${escapeHtml(movie.tags!.join(', '))}</p>` : ''}
              <p>${escapeHtml(movie.synopsis || 'Sinossi non disponibile.')}</p>
              ${movie.cast ? `<p class="movie-cast"><strong>Con</strong> ${escapeHtml(movie.cast)}</p>` : ''}
              ${renderRatingDetails(movie)}
            </div>
          </details>
          <div class="actions-wrap">
            <div class="movie-actions" role="group" aria-label="Trailer, condivisione e salvataggio di ${escapeHtml(movie.title)}">
              ${renderTrailerLink(movie)}
              ${renderShareMenu(movie)}
              <button class="fav-star-btn " type="button" data-fav-id="${escapeHtml(movie.id)}"
                aria-pressed="false" title="Salva film" aria-label="Salva film">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
              </button>
            </div>
          </div>
          <div class="card-preview">
            <span class="preview-label">${previewTitle}</span>
            <strong class="preview-time"><span class="preview-day">${escapeHtml(previewDate)}</span>${preview ? `<span class="preview-hour">${escapeHtml(preview.time)}</span>` : ''}</strong>
            <span class="preview-venue" title="${escapeHtml(previewVenue)}">${escapeHtml(previewVenue)}</span>
          </div>

          <button class="schedule-toggle" type="button" aria-expanded="false" aria-controls="${escapeHtml(panelId)}">
            <span>Vedi sale e orari</span>
            <svg class="cue-chevron " viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      </div>

      <section class="movie-full-schedule-panel" id="${escapeHtml(panelId)}" aria-label="Sale e orari di ${escapeHtml(movie.title)}" hidden>
        <div class="panel-heading">
          <h4 tabindex="-1">Scegli il cinema e l’orario</h4>
          <p>${showCount ? `${showCount} spettacoli · ${venueIds.length} cinema. Tocca un orario per biglietti, calendario e condivisione.` : 'Date annunciate: gli orari saranno pubblicati dal cinema.'}</p>
          ${publishedDates.length ? `<p class="published-until">In programma fino al ${escapeHtml(readableISODate(parseDate(publishedDates.at(-1)!).toISOString()))}, secondo le date pubblicate. Possono essere aggiunti altri giorni.</p>` : ''}
          ${parseDurationMinutes(movie.duration) ? '<p class="end-time-note">Fine indicativa: durata del film, escluse pubblicità e intervallo.</p>' : ''}
        </div>
        ${venueIds.map((venueId) => {
    const venue = venuesMap[venueId];
    const cinema = { id: venueId, name: venue?.name || venueId, location: venue?.location || '' };
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
                <h6>${escapeHtml(formatDayLabel(date, now))}</h6>
                <div class="times-buttons">${entries.length ? entries.map((entry) => showtimeChipHtml(movie, cinema, date, entry,
        date === getTodayString(now) && wallClockDate(date, entry.time) < now)).join('')
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

/**
 * Markup della griglia film identico a quello che app.js costruisce nel browser:
 * serve ai crawler (e al primo paint) prima che l'app prenda il controllo.
 */
export function buildCatalogHtml(movies: Movie[], venues: Venue[], now: Date, paths: Record<string, string> = {}) {
  const venuesMap = Object.fromEntries(venues.map((venue) => [venue.id, venue]));
  const visible = movies
    .map((movie) => ({ movie, selection: catalogSelection(movie, now) }))
    .filter((item) => item.selection.programming.length);

  visible.sort((a, b) => {
    const available = (movie: Movie) => (movie.releaseDateIT && movie.releaseDateIT <= dateString(now).split('/').reverse().join('-')
      ? Number.isFinite(Date.parse(movie.releaseDateIT)) ? Date.parse(movie.releaseDateIT) : -Infinity
      : -Infinity);
    const left = available(a.movie);
    const right = available(b.movie);
    const difference = left === right ? 0 : right > left ? 1 : -1;
    return difference || a.movie.title.localeCompare(b.movie.title, 'it', { sensitivity: 'base' });
  });

  const totalShows = visible.reduce((sum, item) => sum + item.selection.shows.reduce((total, group) => total + group.shows.length, 0), 0);
  const html = visible.map((item) => movieCardHtml(item.movie, venuesMap, item.selection, now, paths)).join('');
  return { html, films: visible.length, shows: totalShows };
}
