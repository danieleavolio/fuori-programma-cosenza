<script lang="ts">
  import { tick } from 'svelte';

  let { layout = $bindable('grid'), hint = 'Scegli un film per vedere i dettagli.' }: {
    layout?: 'grid' | 'list';
    hint?: string;
  } = $props();

  function setLayout(value: 'grid' | 'list') {
    if (layout === value) return;
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      layout = value;
      return;
    }
    const transition = document.startViewTransition(async () => {
      layout = value;
      await tick();
    });
    transition.ready.catch(() => {});
  }
</script>

<div class="catalog-toolbar">
  <span class="view-hint">{hint}</span>
  <div class="schedule-layout-switch" role="group" aria-label="Visualizzazione dei film">
    <button class="layout-button" class:active={layout === 'grid'} type="button" aria-pressed={layout === 'grid'} onclick={() => setLayout('grid')}>Griglia</button>
    <button class="layout-button" class:active={layout === 'list'} type="button" aria-pressed={layout === 'list'} onclick={() => setLayout('list')}>Lista</button>
  </div>
</div>

<style>
  .catalog-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; margin-bottom: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
</style>
