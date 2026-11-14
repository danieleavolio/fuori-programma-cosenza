<script lang="ts">
  import { page } from '$app/state';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';

  let { children } = $props();
  const isHome = $derived(page.url.pathname === '/');
</script>

<svelte:head>
  <link rel="stylesheet" href="/styles.css?v=20261114c" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
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
</svelte:head>

<a class="skip-link" href="#programmazione">Vai alla programmazione</a>

<header class="masthead">
  <div class="masthead-brand">
    <a class="wordmark" href="/" aria-label="Fuori programma, home">
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
      <a class="view-pill" href="/">Per Film</a>
      <a class="view-pill" href="/?view=schedule">Per Giorno</a>
    </nav>
  {/if}

  <div class="masthead-actions">
    {#if isHome}
      <button class="calendar-btn" id="calendar-open" type="button" aria-haspopup="dialog" aria-controls="calendar-dialog" aria-label="Segui i tuoi cinema nel calendario">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="7"></line><line x1="8" y1="2" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="13" x2="12" y2="19"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>
        <span class="calendar-label">Calendario</span>
      </button>
      <button class="fav-badge-btn" id="fav-toggle-btn" type="button" aria-label="Mostra film salvati">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        <span class="fav-label">Salvati</span>
        <span class="fav-count" id="fav-count">0</span>
      </button>
    {:else}
      <a class="calendar-btn" href="/calendario" aria-label="Segui i tuoi cinema nel calendario">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="7"></line><line x1="8" y1="2" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="13" x2="12" y2="19"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>
        <span class="calendar-label">Calendario</span>
      </a>
      <a class="fav-badge-btn" href="/?view=favorites" aria-label="Mostra film salvati">
        <svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        <span class="fav-label">Salvati</span>
      </a>
    {/if}
    <a class="top-link" href="/#cinema">Sale &rarr;</a>
  </div>
</header>

<main id="programmazione">
  {#key page.url.pathname}
    <div class="page-enter" in:fly={{ y: 12, duration: prefersReducedMotion.current ? 0 : 220 }}>
      {@render children()}
    </div>
  {/key}
</main>

<footer>
  <span class="footer-mark">fuori programma</span>
  <a href="mailto:danieleavolio14@gmail.com?subject=Segnalazione%20Fuori%20Programma">Segnala un errore &rarr;</a>
</footer>
