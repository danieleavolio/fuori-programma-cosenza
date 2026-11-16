import { cinemaPath, filmPath, movies, romeNow, venues, venueDetails, updatedAt } from '../lib/server/data';
import { buildCatalogHtml } from '../lib/server/legacy-cards';
import { ogDefault } from '../lib/server/og';
import { siteOrigin } from '../lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const base = siteOrigin;
  const now = romeNow();
  const paths = Object.fromEntries(movies.map((movie) => [movie.id, filmPath(movie)]));
  const catalog = buildCatalogHtml(movies, venues, now, paths);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite', '@id': `${base}/#website`, name: 'Fuori programma',
        alternateName: 'Fuori programma Cosenza', url: `${base}/`, inLanguage: 'it-IT',
        description: 'Guida indipendente alla programmazione dei cinema di Cosenza, Rende e Zumpano.'
      },
      {
        '@type': 'CollectionPage', '@id': `${base}/#webpage`, url: `${base}/`,
        name: 'Cinema a Cosenza e Rende: film, orari e biglietti', inLanguage: 'it-IT',
        isPartOf: { '@id': `${base}/#website` },
        about: ['Cosenza', 'Rende', 'Zumpano'].map((name) => ({ '@type': 'City', name })),
        mainEntity: {
          '@type': 'ItemList', name: 'Cinema di Cosenza, Rende e Zumpano',
          itemListElement: venues.map((venue, index) => ({
            '@type': 'ListItem', position: index + 1,
            item: { '@type': 'MovieTheater', name: venue.name, url: `${base}${cinemaPath(venue)}` }
          }))
        }
      }
    ]
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
    paths,
    filmCount: catalog.films,
    showCount: catalog.shows,
    canonical: `${base}/`,
    ogImage: `${base}${ogDefault}`,
    schema
  };
};
