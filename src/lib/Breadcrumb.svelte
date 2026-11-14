<script lang="ts">
  import JsonLd from './JsonLd.svelte';
  let { schema, trail }: { schema: unknown; trail: { name: string; href?: string }[] } = $props();
</script>

<nav class="breadcrumb" aria-label="Percorso">
  {#each trail as item, index (item.name)}
    {#if index > 0}<span class="breadcrumb-sep" aria-hidden="true">›</span>{/if}
    {#if item.href}
      <a href={item.href}>{item.name}</a>
    {:else}
      <span aria-current="page">{item.name}</span>
    {/if}
  {/each}
</nav>
<JsonLd schema={schema} />

<style>
  .breadcrumb { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 7px; margin: 0 0 8px; color: var(--muted); font-size: 12px; line-height: 1.4; }
  .breadcrumb a { color: var(--muted); text-decoration: none; }
  .breadcrumb a:hover { color: var(--ink); text-decoration: underline; }
  .breadcrumb [aria-current='page'] { color: var(--ink); font-weight: 600; overflow-wrap: anywhere; }
  .breadcrumb-sep { opacity: .55; }
</style>
