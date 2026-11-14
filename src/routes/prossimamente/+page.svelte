<script lang="ts">
  import Breadcrumb from '../../lib/Breadcrumb.svelte';
  import JsonLd from '../../lib/JsonLd.svelte';
  import PeriodNav from '../../lib/PeriodNav.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title} | Fuori programma</title>
  <meta name="description" content={`Le prossime uscite al cinema a Cosenza, Rende e Zumpano con le date italiane: cosa arriva in sala e quando.`} />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content="Le prossime uscite al cinema a Cosenza e Rende, con le date italiane." />
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
  <p>{data.upcoming.length} uscite annunciate nei cinema di Cosenza e Rende</p>
</section>

<PeriodNav current="prossimamente" />

{#if data.upcoming.length}
  <div class="upcoming-list">
    {#each data.upcoming as entry (entry.movie.id)}
      <article class="upcoming-item">
        {#if entry.movie.poster}
          <a class="upcoming-poster" href={entry.href} tabindex="-1" aria-hidden="true">
            <img src={entry.movie.poster} alt="" width="180" height="270" loading="lazy" />
          </a>
        {/if}
        <div class="upcoming-copy">
          <p class="upcoming-date"><span>{entry.releaseLabel}</span>{#if entry.hasShows}<span class="upcoming-pill">Anteprime in vendita</span>{/if}</p>
          <h2><a href={entry.href}>{entry.movie.title}</a></h2>
          <p class="upcoming-meta">{[entry.movie.year, entry.movie.duration, (entry.movie.genres || []).join(' · ')].filter(Boolean).join(' · ')}</p>
          {#if entry.movie.synopsis}<p class="upcoming-synopsis">{entry.movie.synopsis}</p>{/if}
          <p class="upcoming-links">
            <a href={entry.href}>Scheda del film e orari &rarr;</a>
            {#if entry.movie.trailer}<a href={entry.movie.trailer} target="_blank" rel="nofollow noopener">Trailer ↗</a>{/if}
          </p>
        </div>
      </article>
    {/each}
  </div>
{:else}
  <p class="no-times-note">Nessuna uscita futura con data italiana confermata. Le sale aggiornano il calendario durante il mese: torna a controllare.</p>
{/if}

<style>
  .upcoming-list { display: grid; gap: 14px; }
  .upcoming-item { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; align-items: start; padding: 14px; border: 1px solid var(--line); background: var(--surface); }
  .upcoming-poster { display: block; border: 1px solid var(--line); background: var(--paper); }
  .upcoming-poster img { display: block; width: 100%; height: auto; }
  .upcoming-copy { min-width: 0; }
  .upcoming-date { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 4px; color: var(--link); font: 700 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
  .upcoming-pill { padding: 4px 7px; border: 1px solid var(--line); background: var(--paper); color: var(--muted); font: 700 9px/1 var(--mono); letter-spacing: .1em; }
  .upcoming-copy h2 { margin: 0 0 3px; font: 650 19px/1.2 var(--display); letter-spacing: -.015em; overflow-wrap: anywhere; }
  .upcoming-copy h2 a:hover { color: var(--link); text-decoration: underline; }
  .upcoming-meta { margin: 0 0 8px; color: var(--muted); font-size: 12px; }
  .upcoming-synopsis { margin: 0 0 10px; font-size: 14px; line-height: 1.5; }
  .upcoming-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; font-size: 12px; font-weight: 600; }
  .upcoming-links a:hover { color: var(--link); text-decoration: underline; }
  @media (max-width: 620px) {
    .upcoming-item { grid-template-columns: 92px minmax(0, 1fr); gap: 12px; padding: 12px; }
    .upcoming-copy h2 { font-size: 17px; }
  }
</style>
