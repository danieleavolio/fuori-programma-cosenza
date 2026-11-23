<script module lang="ts">
  import type { Movie, Show, Venue } from './server/data';

  type Screening = {
    movie: Movie;
    show: Show;
    venue: Venue;
    dateISO: string;
    dateLabel: string;
    filmPath: string;
    url: string;
    hasStarted: boolean;
  };

  function groupBy<T>(items: T[], key: (item: T) => string) {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const id = key(item);
      const list = groups.get(id);
      if (list) list.push(item);
      else groups.set(id, [item]);
    }
    return groups;
  }
</script>

<script lang="ts">
  import MovieCollection, { type CatalogEntry } from './MovieCollection.svelte';

  let { screenings, layout, today, showVenue = true }: {
    screenings: Screening[];
    layout: 'grid' | 'list';
    today?: string;
    showVenue?: boolean;
  } = $props();

  const days = $derived(groupBy(screenings, item => item.dateISO));

  function films(shows: Screening[]): CatalogEntry[] {
    const ordered = [...shows].sort((a, b) => Number(a.hasStarted) - Number(b.hasStarted));
    return [...groupBy(ordered, item => item.movie.id)].map(([id, items]) => {
      const { movie, filmPath } = items[0];
      const links = items.map((item) => ({
        label: [
          item.show.time, showVenue ? item.venue.name : undefined, item.show.room,
          item.show.format, item.show.language, item.show.version,
          item.show.subtitles ? 'sottotitoli' : undefined,
          item.hasStarted ? 'Già iniziato' : (!showVenue && item.url !== '#' ? 'Biglietti ↗' : undefined)
        ].filter(Boolean).join(' · '),
        href: !item.hasStarted && item.url !== '#' ? item.url : undefined,
        external: true
      }));
      return {
        id, title: movie.title, poster: movie.poster, href: filmPath,
        state: items.length === 1 ? '1 spettacolo' : `${items.length} spettacoli`,
        meta: [movie.duration, ...(movie.genres || [])].filter(Boolean).join(' · '),
        links: links.filter((link, index) => links.findIndex(other => other.label === link.label && other.href === link.href) === index)
      };
    });
  }
</script>

{#each days as [iso, shows] (iso)}
  {@const label = iso === today ? `Oggi · ${shows[0].dateLabel}` : shows[0].dateLabel}
  <section class="cinema-section" aria-label={label}>
    <div class="section-heading">
      <h2><time datetime={iso}>{label}</time></h2>
      <p class="section-note">{shows.length} {shows.length === 1 ? 'spettacolo' : 'spettacoli'}</p>
    </div>
    <MovieCollection entries={films(shows)} label={`Film del ${shows[0].dateLabel}`} {layout} />
  </section>
{/each}
