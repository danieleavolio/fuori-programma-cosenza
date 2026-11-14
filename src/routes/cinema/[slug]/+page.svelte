<script lang="ts">
  import JsonLd from '../../../lib/JsonLd.svelte';
  let { data } = $props();
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

<p class="bread"><a href="/">Home</a> / Cinema / {data.venue.name}</p>
<p class="eyebrow">Cinema · {data.info.city || data.venue.location}</p>
<h1>{data.venue.name}</h1>
<p class="intro">{data.info.address}{#if data.info.city}, {data.info.city}{/if}</p>
{#if data.info.mapsUrl}<p><a class="button" href={data.info.mapsUrl} rel="noopener">Apri indicazioni stradali</a></p>{/if}
{#if data.info.phone}<p><a href={`tel:${data.info.phoneHref || data.info.phone}`}>{data.info.phone}</a></p>{/if}
{#if data.info.features?.length}<div class="film-meta">{#each data.info.features as feature}<span class="tag">{feature}</span>{/each}</div>{/if}

<section>
  <h2 class="section-title">Programmazione pubblicata</h2>
  {#if data.screenings.length}
    <div class="screening-list">
      {#each data.screenings as item}
        <article class="show-row">
          <time class="show-time" datetime={item.dateISO}>{item.dateLabel}<br />{item.show.time}</time>
          <div>
            <h3><a href={item.filmPath}>{item.movie.title}</a></h3>
            <p class="muted">{item.group.date}{#if item.show.room} · {item.show.room}{/if}</p>
          </div>
          <a class="button" href={item.url} rel="nofollow noopener" target="_blank">Biglietti</a>
        </article>
      {/each}
    </div>
  {:else}<p class="notice">Non risultano spettacoli pubblicati al momento.</p>{/if}
</section>
