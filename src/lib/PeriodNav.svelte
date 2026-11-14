<script lang="ts">
  // Collegamenti tra le viste di programmazione: sostituiscono i vecchi link
  // sciolti e rendono raggiungibili anche le pagine nuove dai risultati Google.
  let { current }: { current: string } = $props();

  const links = [
    { id: 'oggi', href: '/programmazione/oggi', label: 'Oggi' },
    { id: 'stasera', href: '/programmazione/stasera', label: 'Stasera' },
    { id: 'weekend', href: '/programmazione/weekend', label: 'Weekend' },
    { id: 'prossimamente', href: '/prossimamente', label: 'Prossimamente' }
  ];
</script>

<nav class="period-nav" aria-label="Programmazione">
  {#each links as link (link.id)}
    <a href={link.href} aria-current={current === link.id ? 'page' : undefined}>{link.label}</a>
  {/each}
</nav>

<style>
  .period-nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 20px; }
  .period-nav a { min-height: 38px; display: inline-flex; align-items: center; padding: 6px 12px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12px; font-weight: 600; text-decoration: none; transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease; }
  .period-nav a:hover { border-color: var(--ink); color: var(--ink); }
  .period-nav a[aria-current='page'] { border-color: var(--ink); background: var(--ink); color: var(--on-ink); }
</style>
