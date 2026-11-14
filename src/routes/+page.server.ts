import { cinemaPath, filmPath, movies, venues, venueDetails, updatedAt } from '../lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const base = url.origin;
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Fuori programma',
    url: base, inLanguage: 'it-IT',
    description: 'Programmazione e orari dei cinema a Cosenza, Rende e Zumpano.'
  };
  return {
    movies: movies.filter((movie) => movie.shows.length).map((movie) => ({
      ...movie, path: filmPath(movie),
      venues: [...new Set(movie.shows.map((group) => venues.find((v) => v.id === group.venue)?.name).filter(Boolean))]
    })),
    venues: venues.map((venue) => ({ ...venue, ...venueDetails[venue.id], path: cinemaPath(venue) })),
    updatedAt,
    canonical: `${base}/`,
    schema
  };
};
