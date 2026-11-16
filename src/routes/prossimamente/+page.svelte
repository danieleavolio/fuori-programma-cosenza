<script lang="ts">
  import Breadcrumb from '../../lib/Breadcrumb.svelte';
  import JsonLd from '../../lib/JsonLd.svelte';
  import Seo from '../../lib/Seo.svelte';
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

<Seo title={data.title} description="I film in arrivo nei cinema di Cosenza, Rende e Zumpano: locandine, date annunciate e fonti ufficiali, divisi per cinema." canonical={data.canonical} image={data.ogImage} imageAlt="Prossimamente: film in arrivo nei cinema di Cosenza, Rende e Zumpano" />
<svelte:head>
  <JsonLd schema={data.schema} />
</svelte:head>

<Breadcrumb schema={data.crumb.schema} trail={data.crumb.trail} />
<section class="page-heading coming-heading" aria-labelledby="page-title">
  <h1 id="page-title">Prossimamente</h1>
  <p>I film in arrivo nei cinema di Cosenza, Rende e Zumpano, con locandine, date annunciate e fonti ufficiali.</p>
</section>

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
  .coming-heading { flex-direction: column; align-items: flex-start; gap: 8px; }
  .coming-heading p { max-width: 760px; line-height: 1.6; }
  .source-note { margin: 0 0 20px; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .section-heading { flex-wrap: wrap; gap: 8px 16px; }
  a.section-note { min-height: 44px; display: inline-flex; align-items: center; color: var(--link); }
</style>
