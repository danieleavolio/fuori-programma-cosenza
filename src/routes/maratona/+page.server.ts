import { dateISO, dateLabel, filmPath, movies, romeDateISO, romeNow, showUrl, venues } from '../../lib/server/data';
import { parseDuration, toMinutes, type PlanDay, type PlanFilm } from '../../lib/marathon';
import { ogForPage } from '../../lib/server/og';
import { siteOrigin } from '../../lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const today = romeDateISO();
  const now = romeNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const days = new Map<string, { label: string; films: Map<string, PlanFilm> }>();

  for (const movie of movies) {
    const path = filmPath(movie);
    for (const group of movie.shows) {
      const iso = dateISO(group.date);
      if (iso < today) continue;
      const venue = venues.find((item) => item.id === group.venue);
      if (!venue) continue;
      const shows = group.shows
        .map((show) => ({
          venue: venue.id, venueName: venue.name, time: show.time, start: toMinutes(show.time),
          room: show.room, url: showUrl(movie, venue.id, show)
        }))
        // Oggi contano solo gli spettacoli che devono ancora iniziare.
        .filter((show) => iso > today || show.start > nowMinutes);
      if (!shows.length) continue;
      if (!days.has(iso)) days.set(iso, { label: dateLabel(group.date), films: new Map() });
      const films = days.get(iso)!.films;
      const slug = path.split('/').pop() || movie.id;
      if (!films.has(slug)) {
        films.set(slug, {
          slug, title: movie.title, poster: movie.poster, filmPath: path,
          duration: parseDuration(movie.duration), durationLabel: movie.duration || undefined, shows: []
        });
      }
      films.get(slug)!.shows.push(...shows);
    }
  }

  const planDays: PlanDay[] = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, day]) => ({
      iso, label: day.label,
      films: [...day.films.values()]
        .map((film) => ({ ...film, shows: film.shows.sort((a, b) => a.start - b.start) }))
        .sort((a, b) => a.title.localeCompare(b.title, 'it'))
    }));

  const title = 'Maratona al cinema: quali film vedere di fila a Cosenza';
  const description = 'Scegli un giorno e più film: Fuori programma trova gli spettacoli che puoi vedere uno dopo l’altro nei cinema di Cosenza, Rende e Zumpano, contando lo spostamento fra le sale.';
  const canonical = `${siteOrigin}/maratona`;
  return {
    days: planDays, today, title, description, canonical,
    ogImage: `${siteOrigin}${ogForPage('maratona')}`,
    schema: {
      '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'Fuori programma', url: `${siteOrigin}/` }
    }
  };
};
