import schedule from '../../../data/schedule.json';
import venueInfo from '../../../data/venues-info.json';

export type Show = {
  time: string;
  room?: string;
  url?: string;
  format?: string;
  language?: string;
  version?: string;
  subtitles?: boolean;
  tags?: string[];
};
export type ScreeningGroup = { date: string; venue: string; shows: Show[] };
export type Movie = {
  id: string;
  title: string;
  poster?: string;
  url?: string;
  duration?: string;
  tags?: string[];
  genres?: string[];
  director?: string;
  year?: string;
  language?: string;
  cast?: string;
  trailer?: string;
  synopsis?: string;
  releaseDateIT?: string;
  firstSeenAt?: string;
  external?: {
    rating?: number;
    ratingCount?: number;
    criticsRating?: number;
    audienceRating?: number;
    source?: string;
    url?: string;
    checkedAt?: string;
  };
  venueUrls?: Record<string, string>;
  announcedDates?: { date: string; venue: string }[];
  shows: ScreeningGroup[];
};
export type Venue = { id: string; name: string; location: string; source: string; status: string };

export const movies = schedule.movies as unknown as Movie[];
export const venues = schedule.venues as unknown as Venue[];
export const updatedAt = schedule.updatedAt as string;
export const venueDetails = venueInfo as Record<string, { address?: string; city?: string; mapsUrl?: string; phone?: string; phoneHref?: string; features?: string[] }>;

export function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function filmPath(movie: Movie): string {
  return `/film/${slugify(movie.title)}-${movie.year || movie.id}`;
}

export function cinemaPath(venue: Venue): string {
  return `/cinema/${venue.id}`;
}

export function dateISO(value: string): string {
  const [day, month, year] = value.split('/').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateTimeISO(date: string, time: string): string {
  const [day, month, year] = date.split('/').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const local = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const offset = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Rome', timeZoneName: 'longOffset', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(`${local}+01:00`)).find((part) => part.type === 'timeZoneName')?.value || 'GMT+01:00';
  return `${local}${offset.replace('GMT', '')}`;
}

export function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const [day, month, year] = value.split('/').map(Number);
  return new Intl.DateTimeFormat('it-IT', options).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function showUrl(movie: Movie, venueId: string, show: Show): string {
  return show.url || movie.venueUrls?.[venueId] || movie.url || '#';
}

export function allScreenings() {
  return movies.flatMap((movie) => movie.shows.flatMap((group) => group.shows.map((show) => ({
    movie, group, show, venue: venues.find((item) => item.id === group.venue)
  })))).filter((item) => item.venue);
}

/**
 * "Adesso" con le lancette di Roma. Il server di deploy gira in UTC: senza
 * questo, fra mezzanotte e le due il sito mostrerebbe il giorno prima.
 */
export function romeNow(): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return new Date(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
}

/** Data di oggi (YYYY-MM-DD) nel fuso di Roma, indipendente dal server. */
export function romeDateISO(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Etichetta italiana di una data ISO (YYYY-MM-DD). */
export function isoDateLabel(iso: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat('it-IT', options).format(new Date(`${iso}T12:00:00Z`));
}

/** Giorni che mancano a una data ISO, contati sul calendario di Roma. */
export function daysUntil(iso: string, from = romeDateISO()): number {
  return Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export type Crumb = { name: string; path?: string };

/**
 * Percorso di navigazione: la versione visibile usa link relativi, quella
 * strutturata URL assoluti come richiede Google.
 */
export function breadcrumb(items: Crumb[], origin: string) {
  return {
    trail: items.map((item) => ({ name: item.name, href: item.path })),
    schema: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        ...(item.path ? { item: `${origin}${item.path}` } : {})
      }))
    }
  };
}
