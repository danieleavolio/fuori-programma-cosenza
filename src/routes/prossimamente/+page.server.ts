import { breadcrumb, comingSoon, daysUntil, filmPath, isoDateLabel, movies, romeDateISO, venues } from '../../lib/server/data';
import { ogForPage } from '../../lib/server/og';
import { siteOrigin } from '../../lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
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

  const localAnnouncements = venues
    .map((venue) => ({
      venue,
      movies: comingSoon
        .filter((item) => item.venue === venue.id)
        .map((item) => {
          const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').replace(/[^a-z0-9]+/g, ' ').trim();
          const match = movies.find((movie) => normalize(movie.title) === normalize(item.title));
          return {
            ...item,
            releaseDate: match?.releaseDateIT,
            releaseLabel: match?.releaseDateIT ? isoDateLabel(match.releaseDateIT) : undefined,
            localDateLabel: item.localDate ? isoDateLabel(item.localDate) : undefined,
            href: match ? filmPath(match) : undefined
          };
        })
    }))
    .filter((group) => group.movies.length > 0);

  const title = 'Prossimamente al cinema a Cosenza e Rende';
  const canonical = `${siteOrigin}/prossimamente`;
  const crumb = breadcrumb([{ name: 'Home', path: '/' }, { name: 'Prossimamente' }], siteOrigin);
  return {
    title,
    canonical,
    ogImage: `${siteOrigin}${ogForPage('prossimamente')}`,
    upcoming,
    localAnnouncements,
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
           url: `${siteOrigin}${entry.href}`,
           releasedEvent: { '@type': 'PublicationEvent', startDate: entry.releaseDate, location: { '@type': 'Country', name: 'Italia' } },
          ...(entry.movie.poster ? { image: entry.movie.poster } : {}),
          ...(entry.movie.genres?.length ? { genre: entry.movie.genres } : {}),
          ...(entry.movie.synopsis ? { description: entry.movie.synopsis } : {})
        }
      }))
    }
  };
};
