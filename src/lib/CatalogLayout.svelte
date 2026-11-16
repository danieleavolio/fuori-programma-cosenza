<script lang="ts">
  let { layout = $bindable('grid') }: { layout?: 'grid' | 'list' } = $props();
</script>

<div class="catalog-toolbar">
  <span class="view-hint">Scegli un film per vedere i dettagli.</span>
  <div class="schedule-layout-switch" role="group" aria-label="Visualizzazione dei film">
    <button class="layout-button" class:active={layout === 'grid'} type="button" aria-pressed={layout === 'grid'} onclick={() => layout = 'grid'}>Griglia</button>
    <button class="layout-button" class:active={layout === 'list'} type="button" aria-pressed={layout === 'list'} onclick={() => layout = 'list'}>Lista</button>
  </div>
</div>

<style>
  .catalog-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; margin-bottom: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
</style>
