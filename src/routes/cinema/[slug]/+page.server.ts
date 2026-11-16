import { error } from '@sveltejs/kit';
import { breadcrumb, cinemaPath, dateISO, dateLabel, filmPath, movies, showUrl, venues, venueDetails } from '../../../lib/server/data';
import { ogForPage } from '../../../lib/server/og';
import { siteOrigin } from '../../../lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const venue = venues.find((item) => item.id === params.slug);
  if (!venue) error(404, 'Cinema non trovato');
  const info = venueDetails[venue.id] || {};
  const screenings = movies.flatMap((movie) => movie.shows.filter((group) => group.venue === venue.id)
    .flatMap((group) => group.shows.map((show) => ({
      movie, group, show, dateISO: dateISO(group.date), dateLabel: dateLabel(group.date),
      filmPath: filmPath(movie), url: showUrl(movie, venue.id, show)
    })))).sort((a, b) => `${a.dateISO} ${a.show.time}`.localeCompare(`${b.dateISO} ${b.show.time}`));
  const canonical = `${siteOrigin}${cinemaPath(venue)}`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'MovieTheater', '@id': `${canonical}#cinema`, name: venue.name,
    url: canonical, address: { '@type': 'PostalAddress', streetAddress: info.address, addressLocality: info.city || venue.location, addressCountry: 'IT' },
    ...(info.phone ? { telephone: info.phone } : {}),
    sameAs: [venue.source, info.mapsUrl].filter(Boolean)
  };
  return { venue, info, screenings, canonical, ogImage: `${siteOrigin}${ogForPage(venue.id)}`, schema,
    crumb: breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Sale', path: '/#cinema' },
      { name: venue.name }
    ], siteOrigin)
  };
};
