import { error } from '@sveltejs/kit';
import { breadcrumb, dateISO, dateTimeISO, dateLabel, filmPath, movies, showUrl, venues, venueDetails } from '../../../lib/server/data';
import { ogForFilm } from '../../../lib/server/og';
import type { PageServerLoad } from './$types';

function durationMinutes(value = ''): number {
  const hours = Number(value.match(/(\d+)\s*h/i)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)\s*(?:m|['’])/i)?.[1] || 0);
  return hours * 60 + minutes;
}

export const load: PageServerLoad = ({ params, url }) => {
  const movie = movies.find((item) => filmPath(item) === `/film/${params.slug}`);
  if (!movie) error(404, 'Film non trovato');

  const screenings = movie.shows.flatMap((group) => {
    const venue = venues.find((item) => item.id === group.venue);
    if (!venue) return [];
    return group.shows.map((show) => {
      const ticketUrl = showUrl(movie, venue.id, show);
      const start = dateTimeISO(group.date, show.time);
      const startDate = new Date(start);
      const endDate = new Date(startDate.getTime() + (durationMinutes(movie.duration) || 110) * 60_000);
      const googleDates = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const googleDetails = [`Film: ${movie.title}`, `Cinema: ${venue.name}`, show.room || '', ticketUrl].filter(Boolean).join('\n');
      const googleCalendar = `https://calendar.google.com/calendar/render?${new URLSearchParams({
        action: 'TEMPLATE', text: `${movie.title} — ${venue.name}`,
        dates: `${googleDates(startDate)}/${googleDates(endDate)}`, details: googleDetails,
        location: [venue.name, venueDetails[venue.id]?.address, venueDetails[venue.id]?.city].filter(Boolean).join(', ')
      })}`;
      const ics = `/evento.ics?${new URLSearchParams({
        title: movie.title, venue: venue.name, date: dateISO(group.date), time: show.time,
        room: show.room || '', url: ticketUrl, minutes: String(durationMinutes(movie.duration) || 110)
      })}`;
      return {
      date: group.date, dateISO: dateISO(group.date), label: dateLabel(group.date),
      startDate: start, ...show, venue, info: venueDetails[venue.id],
      url: ticketUrl, googleCalendar, ics
    };
    });
  }).sort((a, b) => `${a.dateISO} ${a.time}`.localeCompare(`${b.dateISO} ${b.time}`));

  const canonical = `${url.origin}${filmPath(movie)}`;
  return {
    movie, screenings, canonical,
    crumb: breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Oggi al cinema', path: '/programmazione/oggi' },
      { name: movie.title }
    ], url.origin),
    ogImage: `${url.origin}${ogForFilm(params.slug)}`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Movie',
      name: movie.title,
      ...(movie.year ? { dateCreated: movie.year } : {}),
      ...(movie.director ? { director: { '@type': 'Person', name: movie.director } } : {}),
      ...(movie.cast ? { actor: movie.cast.split(',').filter((name) => !/\.\.\.|…/.test(name)).map((name) => ({ '@type': 'Person', name: name.trim() })) } : {}),
      ...(movie.genres?.length ? { genre: movie.genres } : {}),
      ...(movie.synopsis ? { description: movie.synopsis } : {}),
      ...(movie.poster ? { image: movie.poster } : {}),
      inLanguage: 'it-IT',
      subjectOf: screenings.map((item) => ({
        '@type': 'ScreeningEvent', name: `${movie.title} — ${item.venue.name}`,
        startDate: item.startDate,
        location: { '@type': 'MovieTheater', name: item.venue.name, address: [item.info?.address, item.info?.city || item.venue.location].filter(Boolean).join(', ') },
        url: item.url
      }))
    }
  };
};
