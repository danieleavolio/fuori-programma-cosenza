<script module lang="ts">
  export type CatalogEntry = {
    id: string;
    title: string;
    poster?: string;
    href: string;
    external?: boolean;
    state?: string;
    meta?: string;
    synopsis?: string;
    links: { label: string; href?: string; external?: boolean }[];
  };
</script>

<script lang="ts">
  let { entries, label, layout = 'grid' }: {
    entries: CatalogEntry[];
    label: string;
    layout?: 'grid' | 'list';
  } = $props();
  const collectionId = $props.id();
</script>

<div class="movies-catalog-grid" class:movie-grid={layout === 'grid'} aria-label={label}>
  {#each entries as entry, index (entry.id)}
    <article class="movie-catalog-card" style:view-transition-name={`catalog-${collectionId}-${index}`}>
      <div class="movie-card-body">
        <a class="poster-link" href={entry.href} target={entry.external ? '_blank' : undefined} rel={entry.external ? 'noopener' : undefined} aria-label={`Scheda di ${entry.title}`}>
          {#if entry.poster}
            <img class="poster" src={entry.poster} alt={`Locandina di ${entry.title}`} width="300" height="450" loading="lazy" />
          {:else}
            <span class="poster-missing" aria-label="Locandina non disponibile">fp</span>
          {/if}
        </a>
        <div class="movie-card-details">
          <div class="movie-title-row">
            <span class="movie-state">{entry.state || ''}</span>
            <h3 class="movie-title" title={entry.title}><a href={entry.href} target={entry.external ? '_blank' : undefined} rel={entry.external ? 'noopener' : undefined}>{entry.title}</a></h3>
          </div>
          {#if entry.meta}<p class="movie-credits">{entry.meta}</p>{/if}
          {#if entry.synopsis}<details class="catalog-synopsis"><summary>Trama</summary><p>{entry.synopsis}</p></details>{/if}
          <div class="catalog-links">
            {#each entry.links as link (`${link.href}-${link.label}`)}
              {#if link.href}
                <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'nofollow noopener' : undefined}>{link.label}</a>
              {:else}
                <span class="past-screening">{link.label}</span>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </article>
  {/each}
</div>

<style>
  .catalog-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; align-content: start; }
  .catalog-links > * { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--link); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .catalog-links .past-screening { color: var(--muted); }
  .catalog-links a:hover { border-color: var(--ink); }
  .catalog-synopsis { color: var(--muted); font-size: 13px; line-height: 1.6; }
  .catalog-synopsis summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
  .catalog-synopsis p { margin: 0 0 10px; }
  .movie-grid .movie-credits { min-height: 36px; }
  .movie-grid .movie-state { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (prefers-reduced-motion: reduce) { .movie-catalog-card { transition: none; } }
</style>
