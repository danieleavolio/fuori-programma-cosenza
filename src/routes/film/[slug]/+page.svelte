<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.movie.title} ({data.movie.year || 'film'}) — orari cinema | Fuori programma</title>
  <meta name="description" content={`Trama, cast e orari di ${data.movie.title} nei cinema di Cosenza e Rende. Biglietti e spettacoli aggiornati.`} />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="video.movie" />
  <meta property="og:title" content={`${data.movie.title} — Fuori programma`} />
  <meta property="og:description" content={data.movie.synopsis || `Scopri gli orari di ${data.movie.title} a Cosenza e Rende.`} />
  {#if data.movie.poster}<meta property="og:image" content={data.movie.poster} />{/if}
  <meta property="og:url" content={data.canonical} />
  <meta name="twitter:card" content="summary_large_image" />
  {#if data.movie.poster}<meta name="twitter:image" content={data.movie.poster} />{/if}
  <JsonLd schema={data.schema} />
</svelte:head>

<p class="bread"><a href="/">Home</a> / Film / {data.movie.title}</p>
<article>
  <header class="film-head">
    {#if data.movie.poster}<img class="film-poster" src={data.movie.poster} alt={`Locandina di ${data.movie.title}`} />{/if}
    <div>
      <p class="eyebrow">Film in programmazione</p>
      <h1>{data.movie.title}</h1>
      <div class="film-meta">
        {#if data.movie.year}<span class="tag">{data.movie.year}</span>{/if}
        {#if data.movie.duration}<span class="tag">{data.movie.duration}</span>{/if}
        {#each data.movie.genres || [] as genre}<span class="tag">{genre}</span>{/each}
      </div>
      {#if data.movie.director}<p><strong>Regia:</strong> {data.movie.director}</p>{/if}
      {#if data.movie.cast}<p><strong>Cast:</strong> {data.movie.cast}</p>{/if}
      {#if data.movie.synopsis}<p class="intro">{data.movie.synopsis}</p>{/if}
      {#if data.movie.external?.rating}<p class="muted">MYmovies: {data.movie.external.rating.toFixed(1)}/5 · fonte: MYmovies</p>{/if}
      {#if data.movie.trailer}<p><a class="button" href={data.movie.trailer} rel="nofollow noopener">Guarda il trailer</a></p>{/if}
    </div>
  </header>
</article>

<section>
  <h2 class="section-title">Orari e cinema</h2>
  {#if data.screenings.length}
    <div class="screening-list">
      {#each data.screenings as item}
        <article class="show-row">
          <time class="show-time" datetime={item.startDate}>{item.time}</time>
          <div>
            <h3>{item.venue.name}</h3>
            <p class="muted">{item.label}{#if item.room} · {item.room}{/if}</p>
            <p class="muted">{item.info?.address}, {item.info?.city || item.venue.location}</p>
          </div>
          <div class="show-actions">
            <a class="button" href={item.url} rel="nofollow noopener" target="_blank">Biglietti</a>
            <a class="button secondary" href={item.googleCalendar} rel="noopener">Google Calendar</a>
            <a class="text-action" href={item.ics}>File per altre app</a>
          </div>
        </article>
      {/each}
    </div>
  {:else}<p class="notice">Al momento non risultano spettacoli pubblicati.</p>{/if}
</section>

<aside class="calendar-note">
  <p><strong>Vuoi seguire tutta la programmazione?</strong></p>
  <p>I pulsanti accanto all’orario creano un singolo appuntamento. Per un calendario aggiornabile, scegli i cinema nella pagina Calendario.</p>
  <a class="button" href="/calendario">Segui i tuoi cinema</a>
</aside>
