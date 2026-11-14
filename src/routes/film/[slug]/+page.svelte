<script lang="ts">
  import Breadcrumb from '../../../lib/Breadcrumb.svelte';
  import JsonLd from '../../../lib/JsonLd.svelte';
  let { data } = $props();

  const byVenue = $derived.by(() => {
    const venues = new Map<string, { venue: typeof data.screenings[number]['venue']; info: typeof data.screenings[number]['info']; days: Map<string, typeof data.screenings> }>();
    for (const item of data.screenings) {
      const entry = venues.get(item.venue.id) || { venue: item.venue, info: item.info, days: new Map() };
      const day = entry.days.get(item.dateISO) || [];
      day.push(item);
      entry.days.set(item.dateISO, day);
      venues.set(item.venue.id, entry);
    }
    return [...venues.values()];
  });
</script>

<svelte:head>
  <title>{data.movie.title} ({data.movie.year || 'film'}) — orari cinema | Fuori programma</title>
  <meta name="description" content={`Trama, cast e orari di ${data.movie.title} nei cinema di Cosenza e Rende. Biglietti e spettacoli aggiornati.`} />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="video.movie" />
  <meta property="og:title" content={`${data.movie.title} — Fuori programma`} />
  <meta property="og:description" content={data.movie.synopsis || `Scopri gli orari di ${data.movie.title} a Cosenza e Rende.`} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:image" content={data.ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={`${data.movie.title} in programmazione a Cosenza e Rende`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={data.ogImage} />
  <JsonLd schema={data.schema} />
</svelte:head>

<Breadcrumb schema={data.crumb.schema} trail={data.crumb.trail} />

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">{data.movie.title}</h1>
  <p>{[data.movie.year, data.movie.duration, (data.movie.genres || []).join(' · ')].filter(Boolean).join(' · ')}</p>
</section>

<article class="venue-schedule-block film-summary">
  {#if data.movie.poster}
    <img class="film-summary-poster" src={data.movie.poster} alt={`Locandina di ${data.movie.title}`} />
  {/if}
  <div class="film-summary-copy">
    <p class="movie-credits">
      {#if data.movie.director}Regia: {data.movie.director}{/if}{#if data.movie.year}{data.movie.director ? ' · ' : ''}{data.movie.year}{/if}
    </p>
    {#if data.movie.synopsis}<p>{data.movie.synopsis}</p>{/if}
    {#if data.movie.cast}<p class="movie-cast"><strong>Con</strong> {data.movie.cast}</p>{/if}
    {#if data.movie.external?.rating}
      <p class="movie-rating"><span class="rating-value"><span aria-hidden="true">★</span> {data.movie.external.rating.toFixed(1)}<small>/5</small></span><span class="rating-source">MYmovies</span></p>
    {/if}
    <div class="film-summary-actions">
      {#if data.movie.trailer}<a class="film-action" href={data.movie.trailer} target="_blank" rel="nofollow noopener">Trailer ↗</a>{/if}
      <a class="film-action" href="/calendario">Segui i cinema nel calendario</a>
    </div>
  </div>
</article>

<section class="cinema-section" aria-labelledby="screenings-title">
  <div class="section-heading">
    <h2 id="screenings-title">Orari e cinema</h2>
    <p class="section-note">{data.screenings.length} spettacoli pubblicati</p>
  </div>

  {#if byVenue.length}
    {#each byVenue as group (group.venue.id)}
      <section class="venue-schedule-block" aria-label={group.venue.name}>
        <header class="venue-schedule-head">
          <div>
            <h5><a href={`/cinema/${group.venue.id}`}>{group.venue.name}</a></h5>
            <p>{[group.info?.address, group.info?.city || group.venue.location].filter(Boolean).join(' · ')}</p>
          </div>
          <a href={`/cinema/${group.venue.id}`}>Scheda del cinema ↗</a>
        </header>
        {#each [...group.days.entries()] as [iso, shows] (iso)}
          <div class="venue-date-row">
            <h6>{shows[0].label}</h6>
            <div class="times-buttons">
              {#each shows as show (show.time + show.url)}
                <div class="show-entry">
                  <a class="showtime" href={show.url} target="_blank" rel="nofollow noopener" aria-label={`Biglietti per ${data.movie.title} alle ${show.time} da ${group.venue.name}`}>
                    <strong>{show.time}</strong>
                    <span class="showtime-room">{show.room || 'Biglietti'}</span>
                  </a>
                  <div class="show-entry-links">
                    <a href={show.googleCalendar} target="_blank" rel="noopener">Google</a>
                    <a href={show.ics}>.ics</a>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/each}
  {:else}
    <p class="no-times-note">Al momento non risultano spettacoli pubblicati.</p>
  {/if}
</section>

<style>
  .film-summary { display: grid; grid-template-columns: 180px 1fr; gap: 18px; align-items: start; }
  .film-summary-poster { width: 100%; display: block; border: 1px solid var(--line); border-radius: 8px; }
  .film-summary-copy p { margin: 0 0 10px; }
  .film-summary-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .film-action { min-height: 44px; display: inline-flex; align-items: center; padding: 8px 12px; border: 1px solid var(--line); background: var(--surface); font-size: 12px; font-weight: 600; }
  .film-action:hover { background: var(--green); }
  .show-entry { display: flex; flex-direction: column; gap: 4px; }
  .show-entry-links { display: flex; gap: 8px; justify-content: center; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .show-entry-links a:hover { color: var(--ink); text-decoration: underline; }
  a { color: inherit; }
  @media (max-width: 620px) {
    .film-summary { grid-template-columns: 110px 1fr; gap: 12px; }
    .film-summary-copy p { font-size: 14px; }
  }
</style>
