<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title} | Fuori programma</title>
  <meta name="description" content={`${data.title}: spettacoli e orari aggiornati dei cinema. Scegli un film e raggiungi la biglietteria ufficiale.`} />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content={`Film e orari dei cinema a Cosenza e Rende: ${data.title.toLowerCase()}.`} />
  <meta property="og:url" content={data.canonical} />
  <meta name="twitter:card" content="summary" />
  <JsonLd schema={data.schema} />
</svelte:head>

<p class="bread"><a href="/">Home</a> / Programmazione / {data.period}</p>
<p class="eyebrow">Cosenza · Rende · Zumpano</p>
<h1>{data.title}</h1>
<p class="intro">Orari pubblicati dalle sale, con link alla biglietteria ufficiale.</p>
{#if data.screenings.length}
  <div class="screening-list">
    {#each data.screenings as item}
      <article class="show-row">
        <time class="show-time" datetime={item.startDate}>{item.show.time}<br /><small>{item.dateLabel}</small></time>
        <div>
          <h3><a href={item.filmPath}>{item.movie.title}</a></h3>
          <p class="muted">{item.venue.name}{#if item.show.room} · {item.show.room}{/if}</p>
        </div>
        <a class="button" href={item.url} rel="nofollow noopener" target="_blank">Biglietti</a>
      </article>
    {/each}
  </div>
{:else}
  <p class="notice">Le sale non hanno ancora pubblicato spettacoli per questo periodo. Gli orari compaiono qui quando disponibili.</p>
{/if}
<p class="muted">Per la vista interattiva, i filtri e i calendari: <a href="/legacy/">apri l’app completa</a>.</p>
