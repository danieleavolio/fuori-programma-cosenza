<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
  import PeriodNav from '../../../lib/PeriodNav.svelte';
  let { data } = $props();

  const byDay = $derived.by(() => {
    const days = new Map<string, typeof data.screenings>();
    for (const item of data.screenings) {
      const list = days.get(item.dateISO) || [];
      list.push(item);
      days.set(item.dateISO, list);
    }
    return [...days.entries()];
  });
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

{#if byDay.length}
  {#each byDay as [iso, shows] (iso)}
    <section class="cinema-section" aria-label={shows[0].dateLabel}>
      <div class="section-heading">
        <h2>{shows[0].dateLabel}</h2>
        <p class="section-note">{shows.length} spettacoli</p>
      </div>
      <div class="times-buttons">
        {#each shows as show (show.movie.id + show.venue.id + show.show.time)}
          <div class="show-entry">
            <a class="showtime" href={show.filmPath}>
              <strong>{show.show.time}</strong>
              <span class="showtime-room">{show.movie.title}</span>
              <span class="showtime-format">{show.venue.name}</span>
            </a>
            <div class="show-entry-links">
              <a href={show.url} target="_blank" rel="nofollow noopener">Biglietti</a>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
{:else}
  <p class="no-times-note">{data.period === 'stasera' ? 'Nessuno spettacolo serale (dalle 20 in poi) risulta pubblicato per oggi: le sale aggiornano gli orari durante la giornata.' : 'Le sale non hanno ancora pubblicato spettacoli per questo periodo. Gli orari compaiono qui quando disponibili.'}</p>
{/if}

<style>
  .show-entry { display: flex; flex-direction: column; gap: 4px; }
  .show-entry-links { display: flex; justify-content: center; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .show-entry-links a:hover { color: var(--ink); text-decoration: underline; }
  .showtime { width: 190px; }
  .showtime-room { max-width: 100%; text-align: center; overflow-wrap: anywhere; }
</style>
