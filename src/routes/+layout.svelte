<script lang="ts">
  import { page } from '$app/state';
  import { onNavigate } from '$app/navigation';

  let { children } = $props();
  const isHome = $derived(page.url.pathname === '/');
  const current = (path: string) => (page.url.pathname.startsWith(path) ? 'page' : undefined);

  onNavigate((navigation) => {
    if (navigation.from?.url.pathname === navigation.to?.url.pathname
      || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return new Promise<void>((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
      transition.types?.add('route');
      transition.ready.catch(() => {});
    });
  });
</script>

<svelte:head>
  <link rel="stylesheet" href="/styles.css?v=20261124a" />
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" sizes="any" />
  <link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="application-name" content="Fuori programma" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Fuori programma" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#15191e" media="(prefers-color-scheme: dark)" />
  <meta property="og:site_name" content="Fuori programma" />
  <meta property="og:locale" content="it_IT" />
  <link rel="preconnect" href="https://cdn.18tickets.net" />
</svelte:head>

<a class="skip-link" href="#programmazione">Vai alla programmazione</a>

<header class="masthead">
  <div class="masthead-brand">
    <a class="wordmark" href="/" data-sveltekit-reload aria-label="Fuori programma, home">
      <span class="mark">fp</span>
      <span class="wordmark-text">fuori<br />programma</span>
    </a>
    <span class="masthead-location">Cosenza e Rende</span>
  </div>

  {#if isHome}
    <div class="view-switcher" role="tablist" aria-label="Modalità di visualizzazione">
      <button class="view-pill active" id="btn-view-movies" role="tab" aria-selected="true" data-view="movies">Per Film</button>
      <button class="view-pill" id="btn-view-schedule" role="tab" aria-selected="false" data-view="schedule">Per Giorno</button>
    </div>
  {:else}
    <nav class="view-switcher" aria-label="Programmazione">
      <a class="view-pill" href="/" data-sveltekit-reload>Per Film</a>
      <a class="view-pill" href="/?view=schedule" data-sveltekit-reload>Per Giorno</a>
    </nav>
  {/if}

  <div class="masthead-actions">
    <nav class="masthead-links" aria-label="Sezioni">
      <a class="top-link coming-soon-link" href="/prossimamente" aria-current={current('/prossimamente')}>Prossimamente</a>
      <a class="top-link" href="/maratona" aria-current={current('/maratona')}>Maratona</a>
      <a class="top-link" href={isHome ? '#cinema' : '/#cinema'} data-sveltekit-reload={isHome ? undefined : true}>Sale</a>
    </nav>
    {#if isHome}
      <button class="calendar-btn" id="calendar-open" type="button" aria-haspopup="dialog" aria-controls="calendar-dialog" aria-label="Segui i tuoi cinema nel calendario">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="7"></line><line x1="8" y1="2" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="13" x2="12" y2="19"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>
        <span class="calendar-label">Calendario</span>
      </button>
      <button class="fav-badge-btn" id="fav-toggle-btn" type="button" aria-label="Film salvati" title="Film salvati" aria-pressed="false">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        <span class="fav-count" id="fav-count">0</span>
      </button>
    {:else}
      <a class="calendar-btn" href="/calendario" aria-label="Segui i tuoi cinema nel calendario">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="7"></line><line x1="8" y1="2" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="13" x2="12" y2="19"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>
        <span class="calendar-label">Calendario</span>
      </a>
      <a class="fav-badge-btn" href="/?view=favorites" data-sveltekit-reload aria-label="Film salvati" title="Film salvati">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
      </a>
    {/if}
  </div>
</header>

<main id="programmazione">
  {#key page.url.pathname}
    <div class="page-enter">
      {@render children()}
    </div>
  {/key}
</main>

<footer>
  <span class="footer-mark">fuori programma</span>
  <a href="mailto:danieleavolio14@gmail.com?subject=Segnalazione%20Fuori%20Programma">Segnala un errore &rarr;</a>
</footer>

<style>
  /* Header: link di sezione come testo, azioni come pulsanti-icona. */
  :global(.masthead .view-switcher) { border-radius: 10px; }
  :global(.masthead .view-pill) { border-radius: 8px; }
  :global(.masthead a.view-pill) { display: inline-flex; align-items: center; justify-content: center; }
  :global(.masthead .masthead-actions) { gap: 6px; }
  :global(.masthead .masthead-links) { display: flex; align-items: center; gap: 2px; margin-right: 6px; }
  :global(.masthead .masthead-actions .top-link) { border: 0; border-radius: 8px; background: transparent; padding: 7px 11px; font-size: 13px; color: var(--muted); }
  :global(.masthead .masthead-actions .top-link:hover) { background: var(--green); color: var(--ink); }
  :global(.masthead .masthead-actions .top-link[aria-current='page']) { color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); border-radius: 8px 8px 2px 2px; }
  :global(.masthead .masthead-actions .calendar-btn), :global(.masthead .masthead-actions .fav-badge-btn) { border-radius: 10px; }
  @media (max-width: 1100px) {
    :global(.masthead .masthead-location), :global(.masthead .calendar-label) { display: none; }
  }
  @media (max-width: 699px) {
    :global(.masthead .masthead-links) { margin-right: 0; }
    :global(.masthead .masthead-actions .top-link) { padding: 6px 8px; font-size: 12px; }
  }
</style>
