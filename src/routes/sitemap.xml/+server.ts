import { cinemaPath, filmPath, movies, venues } from '../../lib/server/data';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const pages = [
    '/', '/programmazione/oggi', '/programmazione/weekend', '/calendario',
    ...venues.map(cinemaPath),
    ...movies.filter((movie) => movie.shows.length).map(filmPath)
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `<url><loc>${url.origin}${page}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
};
