<script lang="ts">
  import Breadcrumb from '../../../lib/Breadcrumb.svelte';
  import JsonLd from '../../../lib/JsonLd.svelte';
  import Seo from '../../../lib/Seo.svelte';
  import CatalogLayout from '../../../lib/CatalogLayout.svelte';
  import ScreeningCatalog from '../../../lib/ScreeningCatalog.svelte';
  let { data } = $props();
  let layout = $state<'grid' | 'list'>('grid');
  const city = $derived((data.info.city || data.venue.location).replace(/\s*\([A-Z]{2}\)$/, ''));
  const cinemaName = $derived(data.venue.id === 'cinema-teatro-italia' ? 'Cinema Italia Tieri'
    : ['citrigno', 'garden'].includes(data.venue.id) ? `Cinema ${data.venue.name}` : data.venue.name);

</script>

<Seo title={`${cinemaName} a ${city}: programmazione e orari`} description={`Film, orari, indirizzo e biglietteria di ${data.venue.name} a ${city}. Consulta gli spettacoli pubblicati e le indicazioni per raggiungere la sala.`} canonical={data.canonical} image={data.ogImage} imageAlt={`${data.venue.name}: film e orari su Fuori programma`} />
<svelte:head>
  <JsonLd schema={data.schema} />
</svelte:head>

<Breadcrumb schema={data.crumb.schema} trail={data.crumb.trail} />

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">{data.venue.name}</h1>
  <p>{city}</p>
</section>

<section class="venue-schedule-block" aria-label="Informazioni sulla sala">
  <div class="venue-info-row">
    <p class="venue-info-address">{[data.info.address, data.info.city || data.venue.location].filter(Boolean).join(' · ')}</p>
    <div class="venue-info-actions">
      {#if data.info.mapsUrl}<a href={data.info.mapsUrl} target="_blank" rel="noopener">Indicazioni ↗</a>{/if}
      {#if data.info.phone}<a href={`tel:${data.info.phoneHref || data.info.phone}`}>{data.info.phone}</a>{/if}
      {#if data.venue.source}<a href={data.venue.source} target="_blank" rel="noopener">Biglietteria ↗</a>{/if}
    </div>
  </div>
  {#if data.info.features?.length}
    <div class="cinema-features">{#each data.info.features as feature}<span>{feature}</span>{/each}</div>
  {/if}
</section>

{#if data.screenings.length}
  <CatalogLayout bind:layout hint="Film e orari pubblicati da oggi in poi." />
  <ScreeningCatalog screenings={data.screenings} today={data.today} {layout} showVenue={false} />
{:else}
  <p class="no-times-note">Non risultano spettacoli pubblicati da oggi in poi. <a href="/programmazione/oggi">Vedi gli orari delle altre sale</a>.</p>
{/if}

<style>
  .venue-info-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  .venue-info-address { margin: 0; }
  .venue-info-actions { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; font-weight: 600; }
  .venue-info-actions a { text-decoration: underline; text-underline-offset: 3px; }
</style>
