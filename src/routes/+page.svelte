<script lang="ts">
  import JsonLd from '../lib/JsonLd.svelte';
  let { data } = $props();
  const updated = $derived(new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.updatedAt)));
</script>

<svelte:head>
  <title>Programmazione cinema a Cosenza e Rende | Fuori programma</title>
  <meta name="description" content="Scopri i film e gli orari di oggi nei cinema di Cosenza, Rende e Zumpano. Programmazione aggiornata, cinema, trailer e biglietti." />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Cinema a Cosenza e Rende: film e orari" />
  <meta property="og:description" content="Tutti gli orari dei cinema di Cosenza, Rende e Zumpano in un solo posto." />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content="it_IT" />
  {#if data.movies[0]?.poster}<meta property="og:image" content={data.movies[0].poster} />{/if}
  <meta name="twitter:card" content="summary_large_image" />
  {#if data.movies[0]?.poster}<meta name="twitter:image" content={data.movies[0].poster} />{/if}
  <JsonLd schema={data.schema} />
</svelte:head>

<section>
  <p class="eyebrow">Cosenza · Rende · Zumpano</p>
  <h1>Il cinema, fuori programma.</h1>
  <p class="intro">Film e orari aggiornati delle sale di Cosenza e dintorni. Confronta la programmazione, scegli il cinema e vai alla biglietteria ufficiale.</p>
  <div class="quick-links">
    <a href="/programmazione/oggi">Programmazione di oggi</a>
    <a class="secondary" href="/programmazione/weekend">Film del weekend</a>
    <a class="secondary" href="/calendario">Segui i tuoi cinema</a>
  </div>
  <p class="muted">Dati aggiornati: {updated}</p>
</section>

<section aria-labelledby="movies-heading">
  <h2 class="section-title" id="movies-heading">Film in programmazione</h2>
  <div class="movie-grid">
    {#each data.movies as movie (movie.id)}
      <a class="movie-card" href={movie.path}>
        {#if movie.poster}<img src={movie.poster} alt={`Locandina di ${movie.title}`} loading="lazy" />{/if}
        <div class="movie-copy">
          <h3>{movie.title}</h3>
          <p class="muted">{[movie.year, movie.director].filter(Boolean).join(' · ')}</p>
          <p class="muted">{movie.venues.join(' · ')}</p>
        </div>
      </a>
    {/each}
  </div>
</section>

<section id="cinema" aria-labelledby="cinema-heading">
  <h2 class="section-title" id="cinema-heading">Cinema a Cosenza e Rende</h2>
  <div class="venue-grid">
    {#each data.venues as venue (venue.id)}
      <article class="venue-card">
        <h3><a href={venue.path}>{venue.name}</a></h3>
        <p class="muted">{venue.address}, {venue.city || venue.location}</p>
        <p><a href={venue.mapsUrl}>Indicazioni stradali</a></p>
      </article>
    {/each}
  </div>
</section>
