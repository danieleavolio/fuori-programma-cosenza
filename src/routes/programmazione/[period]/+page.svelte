<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
  import PeriodNav from '../../../lib/PeriodNav.svelte';
  import MovieCollection, { type CatalogEntry } from '../../../lib/MovieCollection.svelte';
  import CatalogLayout from '../../../lib/CatalogLayout.svelte';
  let { data } = $props();
  let layout = $state<'grid' | 'list'>('grid');

  const byDay = $derived.by(() => {
    const days = new Map<string, typeof data.screenings>();
    for (const item of data.screenings) {
      const list = days.get(item.dateISO) || [];
      list.push(item);
      days.set(item.dateISO, list);
    }
    return [...days.entries()];
  });

  function filmEntries(shows: typeof data.screenings): CatalogEntry[] {
    const grouped = new Map<string, typeof shows>();
    for (const show of shows) {
      const list = grouped.get(show.movie.id) || [];
      list.push(show);
      grouped.set(show.movie.id, list);
    }
    return [...grouped.values()].map((items) => ({
      id: items[0].movie.id,
      title: items[0].movie.title,
      poster: items[0].movie.poster,
      href: items[0].filmPath,
      state: `${items.length} spettacoli`,
      meta: [items[0].movie.duration, ...(items[0].movie.genres || [])].filter(Boolean).join(' · '),
      links: items.map((item) => ({
        label: [item.show.time, item.venue.name, item.show.room, item.show.format, item.show.language, item.show.version, item.show.subtitles ? 'sottotitoli' : undefined].filter(Boolean).join(' · '),
        href: item.url,
        external: true
      })).filter((link, index, all) => all.findIndex((other) => other.label === link.label && other.href === link.href) === index)
    }));
  }
</script>

<svelte:head>
  <title>{data.title} | Fuori programma</title>
  <meta name="description" content={data.description} />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content={data.description} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:image" content={data.ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={`${data.title}: film e orari dei cinema di Cosenza e Rende`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={data.ogImage} />
  <JsonLd schema={data.schema} />
</svelte:head>

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">{data.title}</h1>
  <p>{data.screenings.length} spettacoli pubblicati</p>
</section>

<PeriodNav current={data.period} />
<CatalogLayout bind:layout />

{#if byDay.length}
  {#each byDay as [iso, shows] (iso)}
    <section class="cinema-section" aria-label={shows[0].dateLabel}>
      <div class="section-heading">
        <h2>{shows[0].dateLabel}</h2>
        <p class="section-note">{shows.length} spettacoli</p>
      </div>
      <MovieCollection entries={filmEntries(shows)} label={`Film del ${shows[0].dateLabel}`} {layout} />
    </section>
  {/each}
{:else}
  <p class="no-times-note">{data.period === 'stasera' ? 'Nessuno spettacolo serale (dalle 20 in poi) risulta pubblicato per oggi: le sale aggiornano gli orari durante la giornata.' : 'Le sale non hanno ancora pubblicato spettacoli per questo periodo. Gli orari compaiono qui quando disponibili.'}</p>
{/if}
