import { error } from '@sveltejs/kit';
import { cinemaPath, dateISO, dateLabel, filmPath, movies, showUrl, venues, venueDetails } from '../../../lib/server/data';
import { ogDefault } from '../../../lib/server/og';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
  const venue = venues.find((item) => item.id === params.slug);
  if (!venue) error(404, 'Cinema non trovato');
  const info = venueDetails[venue.id] || {};
  const screenings = movies.flatMap((movie) => movie.shows.filter((group) => group.venue === venue.id)
    .flatMap((group) => group.shows.map((show) => ({
      movie, group, show, dateISO: dateISO(group.date), dateLabel: dateLabel(group.date),
      filmPath: filmPath(movie), url: showUrl(movie, venue.id, show)
    })))).sort((a, b) => `${a.dateISO} ${a.show.time}`.localeCompare(`${b.dateISO} ${b.show.time}`));
  const canonical = `${url.origin}${cinemaPath(venue)}`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'MovieTheater', name: venue.name,
    url: canonical, address: { '@type': 'PostalAddress', streetAddress: info.address, addressLocality: info.city || venue.location, addressCountry: 'IT' },
    ...(info.phone ? { telephone: info.phone } : {}),
    ...(info.mapsUrl ? { sameAs: info.mapsUrl } : {})
  };
  return { venue, info, screenings, canonical, ogImage: `${url.origin}${ogDefault}`, schema };
};
