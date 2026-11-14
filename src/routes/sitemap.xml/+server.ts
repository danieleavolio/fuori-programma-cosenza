import { cinemaPath, filmPath, movies, updatedAt, venues } from '../../lib/server/data';
import type { RequestHandler } from './$types';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: RequestHandler = ({ url }) => {
  const filmPages = movies.filter((movie) => movie.shows.length);
  const entries: { path: string; poster?: string; title?: string }[] = [
    { path: '/' },
    { path: '/programmazione/oggi' },
    { path: '/programmazione/stasera' },
    { path: '/programmazione/weekend' },
    { path: '/prossimamente' },
    { path: '/calendario' },
    ...venues.map((venue) => ({ path: cinemaPath(venue) })),
    ...filmPages.map((movie) => ({ path: filmPath(movie), poster: movie.poster, title: movie.title }))
  ];
  // lastmod aiuta i crawler a capire quando la programmazione e' cambiata.
  const lastmod = new Date(updatedAt).toISOString();
  const urls = entries.map((entry) => {
    // <image:image> segnala la locandina che compare nella scheda: e' quella
    // che Google puo' mostrare nei risultati immagini.
    const image = entry.poster
      ? `<image:image><image:loc>${escapeXml(entry.poster)}</image:loc><image:title>${escapeXml(`Locandina di ${entry.title}`)}</image:title></image:image>`
      : '';
    return `<url><loc>${escapeXml(url.origin + entry.path)}</loc><lastmod>${lastmod}</lastmod>${image}</url>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
};
