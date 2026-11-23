<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
  import Seo from '../../../lib/Seo.svelte';
  import ScreeningCatalog from '../../../lib/ScreeningCatalog.svelte';
  import CatalogLayout from '../../../lib/CatalogLayout.svelte';
  let { data } = $props();
  let layout = $state<'grid' | 'list'>('grid');

</script>

<Seo title={data.title} description={data.description} canonical={data.canonical} image={data.ogImage} imageAlt={`${data.title}: film, locandine e orari`} />
<svelte:head>
  <JsonLd schema={data.schema} />
</svelte:head>

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">{data.title}</h1>
  <p>{data.screenings.length} {data.screenings.length === 1 ? 'spettacolo pubblicato' : 'spettacoli pubblicati'}</p>
</section>

<CatalogLayout bind:layout />

{#if data.screenings.length}
  <ScreeningCatalog screenings={data.screenings} {layout} />
{:else}
  <p class="no-times-note">{data.period === 'stasera' ? 'Nessuno spettacolo serale (dalle 20 in poi) risulta pubblicato per oggi: le sale aggiornano gli orari durante la giornata.' : 'Le sale non hanno ancora pubblicato spettacoli per questo periodo. Gli orari compaiono qui quando disponibili.'}</p>
{/if}
