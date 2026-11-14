<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
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
  <title>{data.venue.name} — programmazione e orari | Fuori programma</title>
  <meta name="description" content={`Film, orari, indirizzo e biglietti di ${data.venue.name} a ${data.info.city || data.venue.location}. Programmazione aggiornata.`} />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={`${data.venue.name} — cinema a Cosenza e Rende`} />
  <meta property="og:description" content={`Programmazione, indirizzo e biglietti di ${data.venue.name}.`} />
  <meta property="og:url" content={data.canonical} />
  <meta name="twitter:card" content="summary" />
  <JsonLd schema={data.schema} />
</svelte:head>

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">{data.venue.name}</h1>
  <p>{[data.info.address, data.info.city || data.venue.location].filter(Boolean).join(' · ')}</p>
</section>

<section class="venue-schedule-block" aria-label="Informazioni sulla sala">
  <div class="venue-info-row">
    <p class="venue-info-address">{data.info.address}{#if data.info.city}, {data.info.city}{/if}</p>
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

<section class="cinema-section" aria-labelledby="screenings-title">
  <div class="section-heading">
    <h2 id="screenings-title">Programmazione pubblicata</h2>
    <p class="section-note">{data.screenings.length} spettacoli</p>
  </div>

  {#if byDay.length}
    {#each byDay as [iso, shows] (iso)}
      <div class="venue-date-row">
        <h6>{shows[0].dateLabel}</h6>
        <div class="times-buttons">
          {#each shows as show (show.movie.id + show.show.time + show.url)}
            <div class="show-entry">
              <a class="showtime" href={show.filmPath} aria-label={`${show.movie.title}, orari e sale`}>
                <strong>{show.show.time}</strong>
                <span class="showtime-room">{show.movie.title}</span>
              </a>
              <div class="show-entry-links">
                <a href={show.url} target="_blank" rel="nofollow noopener">Biglietti</a>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <p class="no-times-note">Non risultano spettacoli pubblicati al momento.</p>
  {/if}
</section>

<style>
  .venue-info-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  .venue-info-address { margin: 0; }
  .venue-info-actions { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; font-weight: 600; }
  .venue-info-actions a { text-decoration: underline; text-underline-offset: 3px; }
  .show-entry { display: flex; flex-direction: column; gap: 4px; }
  .show-entry-links { display: flex; justify-content: center; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .show-entry-links a:hover { color: var(--ink); text-decoration: underline; }
  .showtime-room { max-width: 150px; text-align: center; }
</style>
