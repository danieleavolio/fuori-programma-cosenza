<script lang="ts">
  import Breadcrumb from '../../lib/Breadcrumb.svelte';
  import JsonLd from '../../lib/JsonLd.svelte';
  import PeriodNav from '../../lib/PeriodNav.svelte';
  import MovieCollection, { type CatalogEntry } from '../../lib/MovieCollection.svelte';
  import CatalogLayout from '../../lib/CatalogLayout.svelte';
  let { data } = $props();
  let layout = $state<'grid' | 'list'>('grid');

  const nationalEntries = $derived(data.upcoming.map((entry): CatalogEntry => ({
    id: entry.movie.id,
    title: entry.movie.title,
    poster: entry.movie.poster,
    href: entry.href,
    state: entry.releaseLabel,
    meta: [entry.movie.year, entry.movie.duration, ...(entry.movie.genres || [])].filter(Boolean).join(' · '),
    synopsis: entry.movie.synopsis,
    links: [
      { label: 'Scheda del film e orari →', href: entry.href },
      ...(entry.movie.trailer ? [{ label: 'Trailer ↗', href: entry.movie.trailer, external: true }] : [])
    ]
  })));

  function localEntries(group: typeof data.localAnnouncements[number]): CatalogEntry[] {
    return group.movies.map((item) => ({
      id: `${group.venue.id}-${item.title}`,
      title: item.title,
      poster: item.poster,
      href: item.href || item.url,
      external: !item.href,
      state: item.localDateLabel ? `Dal ${item.localDateLabel}` : 'Data da annunciare',
      meta: item.releaseLabel ? `Uscita italiana: ${item.releaseLabel}` : group.venue.name,
      links: [{ label: 'Annuncio ufficiale ↗', href: item.url, external: true }]
    }));
  }
</script>

<svelte:head>
  <title>{data.title} | Fuori programma</title>
  <meta name="description" content="Film in arrivo nei cinema di Cosenza, Rende e Zumpano: locandine, annunci per cinema e fonti ufficiali." />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content="Film in arrivo, locandine e annunci ufficiali divisi per cinema." />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:image" content={data.ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Prossimamente al cinema a Cosenza e Rende" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={data.ogImage} />
  <JsonLd schema={data.schema} />
</svelte:head>

<Breadcrumb schema={data.crumb.schema} trail={data.crumb.trail} />
<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">Prossimamente</h1>
  <p>{data.localAnnouncements.reduce((total, group) => total + group.movies.length, 0)} annunci dalle sale · {data.upcoming.length} uscite con data italiana</p>
</section>

<PeriodNav current="prossimamente" />
<CatalogLayout bind:layout />

<p class="source-note">Film annunciati dalle sale, divisi per cinema. Le date pubblicate dal cinema sono distinte dalle uscite italiane e non indicano necessariamente orari già prenotabili.</p>

{#each data.localAnnouncements as group (group.venue.id)}
  <section class="cinema-section" aria-labelledby={`venue-${group.venue.id}`}>
    <div class="section-heading">
      <h2 id={`venue-${group.venue.id}`}>{group.venue.name}</h2>
      <a class="section-note" href={group.movies[0].source} target="_blank" rel="noopener">Fonte: {group.movies[0].sourceName} ↗</a>
    </div>
    <MovieCollection entries={localEntries(group)} label={`Film annunciati da ${group.venue.name}`} {layout} />
  </section>
{:else}
  <p class="no-times-note">Nessun annuncio disponibile nelle fonti ufficiali consultate.</p>
{/each}

<section class="cinema-section" aria-labelledby="national-releases">
  <div class="section-heading">
    <h2 id="national-releases">Uscite con data italiana</h2>
    <p class="section-note">La data nazionale non conferma la programmazione in una sala.</p>
  </div>
  {#if nationalEntries.length}
    <MovieCollection entries={nationalEntries} label="Uscite con data italiana" {layout} />
  {:else}
    <p class="no-times-note">Nessuna uscita futura con data italiana confermata.</p>
  {/if}
</section>

<style>
  .source-note { margin: 0 0 20px; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .section-heading { flex-wrap: wrap; gap: 8px 16px; }
  a.section-note { min-height: 44px; display: inline-flex; align-items: center; color: var(--link); }
</style>
