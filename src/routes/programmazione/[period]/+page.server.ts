import { error } from '@sveltejs/kit';
import { dateISO, dateTimeISO, dateLabel, filmPath, movies, showUrl, venues, venueDetails } from '../../../lib/server/data';
import { ogDefault } from '../../../lib/server/og';
import type { PageServerLoad } from './$types';

function localISO(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function offsetDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const PAGES: Record<string, { title: string; description: string }> = {
  oggi: {
    title: 'Cinema oggi a Cosenza e Rende',
    description: 'Tutti gli spettacoli di oggi nei cinema di Cosenza, Rende e Zumpano: orari aggiornati e biglietti ufficiali.'
  },
  stasera: {
    title: 'Cinema stasera a Cosenza e Rende',
    description: 'Cosa vedere stasera a Cosenza e Rende: tutti gli spettacoli dalle 20 in poi, con orari aggiornati e biglietti.'
  },
  weekend: {
    title: 'Cinema questo weekend a Cosenza e Rende',
    description: 'Cinema nel weekend a Cosenza e Rende: spettacoli di venerdì, sabato e domenica con orari aggiornati.'
  }
};

export const load: PageServerLoad = ({ params, url }) => {
  const period = params.period;
  if (!(period in PAGES)) error(404, 'Programmazione non trovata');
  const today = localISO(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  let start = today;
  let end = today;
  if (period === 'weekend') {
    const untilFriday = weekday === 0 ? -2 : weekday === 6 ? -1 : (5 - weekday + 7) % 7;
    start = offsetDate(today, untilFriday);
    end = offsetDate(start, 2);
  }
  const screenings = movies.flatMap((movie) => movie.shows.flatMap((group) => {
    const iso = dateISO(group.date);
    if (iso < start || iso > end) return [];
    const venue = venues.find((item) => item.id === group.venue);
    if (!venue) return [];
    return group.shows.map((show) => {
      const startDate = dateTimeISO(group.date, show.time);
      return {
        movie, group, show, venue, info: venueDetails[venue.id],
        dateISO: iso, dateLabel: dateLabel(group.date), startDate,
        filmPath: filmPath(movie), url: showUrl(movie, venue.id, show)
      };
    })
      // "Stasera" e' la fascia serale: dalle 20 in poi, sempre di oggi.
      .filter((item) => period !== 'stasera' || item.show.time >= '20:00')
      .filter((item) => new Date(item.startDate).getTime() >= Date.now());
  })).sort((a, b) => `${a.dateISO} ${a.show.time}`.localeCompare(`${b.dateISO} ${b.show.time}`));
  const { title, description } = PAGES[period];
  const canonical = `${url.origin}/programmazione/${period}`;
  return {
    period, title, description, canonical, ogImage: `${url.origin}${ogDefault}`, start, end, screenings,
    schema: {
      '@context': 'https://schema.org', '@type': 'ItemList', name: title,
      itemListElement: screenings.map((item, index) => ({
        '@type': 'ListItem', position: index + 1, item: {
          '@type': 'ScreeningEvent', name: `${item.movie.title} — ${item.venue.name}`,
          startDate: item.startDate, url: item.url,
          location: { '@type': 'MovieTheater', name: item.venue.name, address: [item.info?.address, item.info?.city || item.venue.location].filter(Boolean).join(', ') }
        }
      }))
    }
  };
};
