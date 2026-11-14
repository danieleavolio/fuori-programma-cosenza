import { cinemaPath, filmPath, movies, romeNow, venues, venueDetails, updatedAt } from '../lib/server/data';
import { buildCatalogHtml } from '../lib/server/legacy-cards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const base = url.origin;
  const now = romeNow();
  const catalog = buildCatalogHtml(movies, venues, now);
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Fuori programma',
    url: base, inLanguage: 'it-IT',
    description: 'Programmazione e orari dei cinema a Cosenza, Rende e Zumpano.'
  };
  const updatedLabel = `Aggiornato il ${new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
  }).format(new Date(updatedAt))}`;
  return {
    movies: movies.filter((movie) => movie.shows.length).map((movie) => ({
      ...movie, path: filmPath(movie),
      venues: [...new Set(movie.shows.map((group) => venues.find((v) => v.id === group.venue)?.name).filter(Boolean))]
    })),
    venues: venues.map((venue) => ({ ...venue, ...venueDetails[venue.id], path: cinemaPath(venue) })),
    updatedAt,
    updatedLabel,
    gridHtml: catalog.html,
    filmCount: catalog.films,
    showCount: catalog.shows,
    canonical: `${base}/`,
    schema
  };
};
