import { breadcrumb, daysUntil, filmPath, isoDateLabel, movies, romeDateISO } from '../../lib/server/data';
import { ogDefault } from '../../lib/server/og';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const today = romeDateISO();
  const upcoming = movies
    .filter((movie) => movie.releaseDateIT && movie.releaseDateIT >= today)
    .sort((a, b) => (a.releaseDateIT || '').localeCompare(b.releaseDateIT || ''))
    .map((movie) => {
      const releaseDate = movie.releaseDateIT as string;
      const days = daysUntil(releaseDate, today);
      return {
        movie,
        href: filmPath(movie),
        releaseDate,
        releaseLabel: days === 0 ? 'Oggi al cinema'
          : days === 1 ? 'Domani al cinema'
            : days === 2 ? 'Dopodomani al cinema'
              : `Dal ${isoDateLabel(releaseDate)}`,
        hasShows: movie.shows.some((group) => group.shows.length > 0)
      };
    });

  const title = 'Prossimamente al cinema a Cosenza e Rende';
  const canonical = `${url.origin}/prossimamente`;
  const crumb = breadcrumb([{ name: 'Home', path: '/' }, { name: 'Prossimamente' }], url.origin);
  return {
    title,
    canonical,
    ogImage: `${url.origin}${ogDefault}`,
    upcoming,
    crumb,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: title,
      itemListElement: upcoming.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Movie',
          name: entry.movie.title,
          url: `${url.origin}${entry.href}`,
          datePublished: entry.releaseDate,
          ...(entry.movie.poster ? { image: entry.movie.poster } : {}),
          ...(entry.movie.genres?.length ? { genre: entry.movie.genres } : {}),
          ...(entry.movie.synopsis ? { description: entry.movie.synopsis } : {})
        }
      }))
    }
  };
};
