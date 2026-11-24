import { cinemaPath, filmChangedAt, filmPath, movies, updatedAt, venues } from '../../lib/server/data';
import type { RequestHandler } from './$types';
import { siteOrigin } from '../../lib/server/site';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const iso = (value: string) => new Date(value).toISOString();
const latest = (values: string[]) => values.reduce((max, value) => (value > max ? value : max), '');

export const GET: RequestHandler = () => {
  // lastmod deve dire quando una pagina è cambiata davvero: le liste del giorno
  // cambiano a ogni aggiornamento, le schede film solo quando cambiano i loro
  // orari o dati (changedAt in data/film-archive.json), le sale quando cambia
  // uno dei loro film. Le schede dei film usciti non sono in sitemap (noindex).
  const siteChanged = iso(updatedAt);
  const filmChanged = new Map(movies.map((movie) => [movie.id, iso(filmChangedAt(movie))]));
  const venueChanged = (venueId: string) => latest(movies
    .filter((movie) => movie.shows.some((group) => group.venue === venueId)
      || (movie.announcedDates || []).some((item) => item.venue === venueId))
    .map((movie) => filmChanged.get(movie.id) || siteChanged)) || siteChanged;

  const entries: { path: string; lastmod?: string; poster?: string; title?: string }[] = [
    { path: '/', lastmod: siteChanged },
    { path: '/programmazione/oggi', lastmod: siteChanged },
    { path: '/programmazione/stasera', lastmod: siteChanged },
    { path: '/programmazione/weekend', lastmod: siteChanged },
    { path: '/prossimamente', lastmod: siteChanged },
    // La pagina del calendario cambia solo con il codice: niente lastmod inventato.
    { path: '/calendario' },
    { path: '/maratona', lastmod: siteChanged },
    ...venues.map((venue) => ({ path: cinemaPath(venue), lastmod: venueChanged(venue.id) })),
    ...movies.map((movie) => ({ path: filmPath(movie), lastmod: filmChanged.get(movie.id), poster: movie.poster, title: movie.title }))
  ];
  const urls = entries.map((entry) => {
    // <image:image> segnala la locandina che compare nella scheda: e' quella
    // che Google puo' mostrare nei risultati immagini.
    const image = entry.poster
      ? `<image:image><image:loc>${escapeXml(new URL(entry.poster, siteOrigin).href)}</image:loc><image:title>${escapeXml(`Locandina di ${entry.title}`)}</image:title></image:image>`
      : '';
    const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '';
    return `<url><loc>${escapeXml(siteOrigin + entry.path)}</loc>${lastmod}${image}</url>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
};
