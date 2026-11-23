<script lang="ts">
  import JsonLd from '../lib/JsonLd.svelte';
  import Seo from '../lib/Seo.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <meta name="google-site-verification" content="pcJ4_jepxpSEoTyEsHGYJ2XLyoelCmPYbdCb5JisBgE" />
  <JsonLd schema={data.schema} />
  {@html `<script>window.__FP_FILM_PATHS__=${JSON.stringify(data.paths).replace(/</g, '\\u003c')};window.__FP_POSTERS__=${JSON.stringify(data.posters).replace(/</g, '\\u003c')}</script>`}
  <script src="/app.js?v=20261123b" defer></script>
</svelte:head>

<Seo title={data.title} description="Scopri cosa c’è al cinema oggi a Cosenza, Rende e Zumpano. Confronta film e orari di Andromeda River, Citrigno, Italia Tieri, Garden e Unical." canonical={data.canonical} image={data.ogImage} imageAlt="Fuori programma: film e orari dei cinema a Cosenza, Rende e Zumpano" />

<section class="page-heading home-heading" aria-labelledby="page-title">
  <div class="home-heading-copy">
    <h1 id="page-title">Cinema a Cosenza e Rende</h1>
    <p>Film, orari e biglietti · anche a Zumpano</p>
  </div>
  <div class="home-ctas">
    <a class="today-cta" href="/programmazione/oggi">
      <span class="cta-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
      <span class="cta-text"><strong>Oggi in sala</strong><small>Tutti gli orari di oggi</small></span>
      <span class="cta-arrow" aria-hidden="true">→</span>
    </a>
    <a class="today-cta marathon-cta" href="/maratona">
      <span class="cta-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="7" height="12" rx="1.5"/><rect x="14" y="6" width="7" height="12" rx="1.5"/><path d="M10 12h4"/></svg></span>
      <span class="cta-text"><strong>Maratona</strong><small>Più film nella stessa sera</small></span>
      <span class="cta-arrow" aria-hidden="true">→</span>
    </a>
  </div>
</section>

<section class="airing-now" id="airing-now" aria-labelledby="airing-now-title" hidden>
  <div class="airing-now-head">
    <h2 class="airing-now-title" id="airing-now-title"><span class="airing-dot" aria-hidden="true"></span>Ora in sala</h2>
    <span class="airing-now-status" id="airing-now-status"></span>
  </div>
  <div class="airing-now-body" id="airing-now-body"></div>
</section>

<section class="saved-updates" id="saved-updates" aria-labelledby="saved-updates-title" hidden>
  <div class="saved-updates-copy">
    <p class="saved-updates-kicker">Nei tuoi salvati</p>
    <h2 id="saved-updates-title">Novità nei tuoi salvati</h2>
    <p class="saved-updates-text" id="saved-updates-text"></p>
  </div>
  <div class="saved-updates-actions">
    <button type="button" class="saved-updates-primary" id="saved-updates-view">Vedi i film</button>
    <button type="button" class="saved-updates-dismiss" id="saved-updates-dismiss">Chiudi</button>
  </div>
</section>

<section class="schedule-controls" aria-label="Filtri programmazione">
  <div class="controls-shared">
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input id="search" type="search" placeholder="Cerca un film…" autocomplete="off" aria-label="Cerca un film, un regista o un cinema" />
    </div>

    <div class="filter-row">
      <div class="filter-dropdown" id="venue-filter-control">
        <label for="venue-filter">Cinema</label>
        <select id="venue-filter" aria-label="Filtra per cinema">
          <option value="all">Tutte le sale</option>
        </select>
      </div>

      <div class="filter-dropdown">
        <label for="genre-filter">Genere</label>
        <select id="genre-filter" aria-label="Filtra per genere">
          <option value="all">Tutti i generi</option>
        </select>
      </div>
      <div class="filter-dropdown sort-control">
        <label for="movie-sort">Ordina per</label>
        <select id="movie-sort">
          <option value="release">Ultime uscite</option>
          <option value="added">Ultime aggiunte</option>
          <option value="next">Prossimo spettacolo</option>
          <option value="rating">Più votati</option>
          <option value="title">Titolo A–Z</option>
        </select>
      </div>
    </div>
    <details class="venue-preferences" id="venue-preferences">
      <summary>I miei cinema <span id="preferred-venue-count"></span></summary>
      <p>Scegli le sale che frequenti. Le ricorderemo su questo dispositivo.</p>
      <div class="venue-choice-grid" id="preferred-venues"></div>
      <button type="button" class="preference-apply" id="preferred-venues-apply">Mostra i miei cinema</button>
    </details>
  </div>
  <div class="controls-view" id="controls-per-film">
    <span class="view-hint">Scegli un film, poi la sala e l’orario.</span>
    <div class="schedule-layout-switch movie-layout-switch" role="group" aria-label="Visualizzazione dei film">
      <button class="layout-button active" id="movie-layout-grid" type="button" aria-pressed="true" data-movie-layout="grid">Griglia</button>
      <button class="layout-button" id="movie-layout-list" type="button" aria-pressed="false" data-movie-layout="list">Lista</button>
    </div>
  </div>

  <div class="controls-view" id="controls-per-day" hidden>
    <div class="days-strip-container">
      <span class="days-strip-label">Scegli la data:</span>
      <div class="days-nav-strip" id="days-nav-strip" role="tablist" aria-label="Seleziona giorno di programmazione"></div>
      <div class="schedule-layout-switch" role="group" aria-label="Visualizzazione della programmazione">
        <button class="layout-button active" id="day-layout-grid" type="button" aria-pressed="true" data-layout="grid">Griglia</button>
        <button class="layout-button" id="day-layout-list" type="button" aria-pressed="false" data-layout="list">Lista</button>
      </div>
    </div>
  </div>
</section>

<div class="schedule-meta-bar">
  <p id="result-summary" class="result-summary" aria-live="polite"><strong>{data.filmCount}</strong> film in cartellone <span>&middot;</span> <strong>{data.showCount}</strong> spettacoli totali</p>
  <div class="meta-right">
    <span id="updated-at" class="updated-at">{data.updatedLabel}</span>
    <button class="refresh-btn" id="refresh" type="button" title="Ricarica orari aggiornati" aria-label="Ricarica orari aggiornati">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      <span>Ricarica</span>
    </button>
  </div>
</div>

<div id="view-container">
  <section class="movies-catalog-grid" id="movies-grid" aria-label="Catalogo film in programmazione">{@html data.gridHtml}</section>
  <section class="film-list" id="film-list" aria-label="Programmazione orari per giorno" hidden></section>
</div>

<section class="empty-state" id="empty-state" hidden>
  <h2>Nessun film trovato</h2>
  <p id="empty-msg">Nessuna proiezione corrisponde ai filtri selezionati.</p>
  <button type="button" id="clear-filters">Azzera ricerca</button>
</section>

<section class="cinema-section" id="cinema" aria-labelledby="cinema-title">
  <div class="section-heading">
    <h2 id="cinema-title">Le sale</h2>
    <p class="section-note">Cosenza, Rende e Zumpano</p>
  </div>
  <div class="venue-directory" id="cinema-list" data-ssr>
    {#each data.venues as venue (venue.id)}
      <a class="venue-tile" href={venue.path}>
        <span class="venue-tile-name">{venue.name} <span aria-hidden="true">→</span></span>
        <span class="venue-tile-address">{[venue.address, venue.city || venue.location].filter(Boolean).join(' · ')}</span>
        <span class="venue-tile-today" data-venue-today={venue.id}></span>
        {#if venue.status === 'stale' || venue.status === 'unavailable'}
          <span class="venue-tile-today">{venue.status === 'stale' ? 'Dati non aggiornati' : 'Fonte non disponibile'}</span>
        {/if}
      </a>
    {/each}
  </div>
  <details class="venue-source-note">
    <summary>Da dove arrivano gli orari?</summary>
    <p>Fuori programma confronta gli orari pubblicati dalle sale di Cosenza, Rende e Zumpano. È una guida indipendente: orari e disponibilità si confermano sulla biglietteria ufficiale del cinema.</p>
    <p>Se una fonte non risponde, manteniamo gli ultimi dati disponibili. Le date degli annunci senza orario sono in <a href="/prossimamente">Prossimamente</a>.</p>
  </details>
</section>

<div class="showtime-menu" id="showtime-menu" role="menu" aria-label="Azioni per questo orario" hidden>
  <div class="showtime-menu-head">
    <strong id="showtime-menu-time"></strong>
    <span id="showtime-menu-meta"></span>
  </div>
  <button class="showtime-menu-item" type="button" role="menuitem" data-time-action="open">
    <span class="showtime-menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
    </span>
    <span id="showtime-ticket-label">Biglietti per questo spettacolo</span>
    <svg class="menu-go" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </button>
  <button class="showtime-menu-item" type="button" role="menuitem" data-time-action="share">
    <span class="showtime-menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    </span>
    <span>Condividi</span>
  </button>
  <button class="showtime-menu-item" type="button" role="menuitem" data-time-action="calendar">
    <span class="showtime-menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="7"></line><line x1="8" y1="2" x2="8" y2="7"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="13" x2="12" y2="19"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>
    </span>
    <span>Aggiungi evento al calendario</span>
  </button>
</div>

<dialog class="calendar-dialog" id="calendar-dialog" aria-labelledby="calendar-dialog-title">
  <div class="calendar-dialog-head">
    <p class="calendar-dialog-kicker">Il cinema, nella tua agenda</p>
    <h2 id="calendar-dialog-title">Segui i tuoi cinema</h2>
    <button class="calendar-dialog-close" id="calendar-close" type="button" aria-label="Chiudi">&times;</button>
  </div>
  <p class="calendar-dialog-intro">Aggiungili una volta alla tua app: la programmazione si aggiornerà in un calendario separato, senza importare ogni volta un file.</p>
  <div class="calendar-selection-head">
    <strong>1. Scegli uno o più cinema</strong>
    <button type="button" class="text-button" id="calendar-select-all">Seleziona tutti</button>
  </div>
  <fieldset class="venue-choice-grid calendar-venues" id="calendar-venues">
    <legend class="sr-only">Cinema da seguire</legend>
  </fieldset>
  <p class="calendar-summary" id="calendar-summary" aria-live="polite"></p>
  <section class="calendar-subscribe" aria-labelledby="calendar-app-title">
    <h3 id="calendar-app-title">2. Aggiungi alla tua app</h3>
    <div class="calendar-apps">
      <a id="calendar-google" class="calendar-app-link" href="#calendar-dialog-title"><strong>Scarica il file .ics</strong><small>Da importare una volta, senza aggiornamenti</small></a>
      <a id="calendar-apple" class="calendar-app-link" href="#calendar-dialog-title"><strong>Apple Calendario</strong><small>Apri la richiesta di abbonamento</small></a>
      <a id="calendar-outlook" class="calendar-app-link" href="#calendar-dialog-title" target="_blank" rel="noopener noreferrer"><strong>Outlook</strong><small>Aggiungi dalla versione web</small></a>
      <button id="calendar-copy" type="button" class="calendar-app-link"><strong>Copia link</strong><small>Per altre app di calendario</small></button>
    </div>
    <p class="calendar-help" id="calendar-subscription-help">Un solo calendario per i cinema selezionati. Nessun promemoria per ogni proiezione; i tempi di aggiornamento dipendono dall’app. Per cambiare cinema, sostituisci l’abbonamento precedente.</p>
    <details class="calendar-instructions">
      <summary>Come aggiungerlo su Google Calendar</summary>
      <p>Su computer apri Google Calendar, scegli Altri calendari → + → Da URL e incolla il link copiato qui: il calendario si aggiorna da solo e compare nell’app su iPhone e Android con lo stesso account Google. Il file .ics scaricato, invece, è una copia degli spettacoli attuali.</p>
    </details>
  </section>
  <details class="calendar-export" id="calendar-export">
    <summary>Preferisci una copia da importare?</summary>
    <p>Il file non si aggiorna automaticamente. Puoi esportare anche soltanto i film salvati o un giorno.</p>
    <div class="calendar-select">
      <label for="calendar-export-mode">Cosa includere</label>
      <select id="calendar-export-mode">
        <option value="venues">I cinema selezionati</option>
        <option value="favorites">I film salvati, nei cinema selezionati</option>
        <option value="day">Un giorno, nei cinema selezionati</option>
      </select>
    </div>
    <div class="calendar-select" id="calendar-day-row" hidden>
      <label for="calendar-day">Giorno</label>
      <select id="calendar-day"></select>
    </div>
    <label class="calendar-alarm">
      <input type="checkbox" id="calendar-alarm" />
      <span>Promemoria 45 minuti prima<small>Solo per gli eventi del file esportato</small></span>
    </label>
    <p id="calendar-export-summary" class="calendar-help" aria-live="polite"></p>
    <button type="button" class="calendar-download" id="calendar-download">Scarica file .ics</button>
  </details>
  <div class="calendar-dialog-actions">
    <button type="button" class="calendar-cancel" id="calendar-cancel">Fatto</button>
  </div>
  <p class="calendar-footnote">Gli orari possono cambiare: la scheda della sala resta la fonte ufficiale.</p>
</dialog>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

<noscript>I film e gli orari pubblicati sono consultabili anche senza JavaScript. I filtri interattivi e i salvati richiedono JavaScript.</noscript>

<style>
  .home-ctas { display: flex; flex-wrap: wrap; gap: 10px; }
  :global(.home-ctas .today-cta) { position: relative; justify-content: flex-start; gap: 12px; min-height: 58px; padding: 9px 14px 9px 10px; border-radius: 14px; text-align: left; transition: transform 160ms var(--ease), box-shadow 160ms ease, background-color 160ms ease; }
  :global(.home-ctas .today-cta:hover) { transform: translateY(-1px); box-shadow: 0 8px 22px rgb(0 0 0 / .18); border-color: var(--blue); background: var(--blue); color: var(--on-blue); }
  :global(.home-ctas .cta-icon) { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: rgb(255 255 255 / .16); }
  :global(.home-ctas .cta-text) { display: grid; gap: 1px; line-height: 1.15; }
  :global(.home-ctas .cta-text strong) { font-size: 15px; }
  :global(.home-ctas .cta-text small) { font-size: 12px; font-weight: 500; opacity: .85; }
  :global(.home-ctas .cta-arrow) { margin-left: 6px; font-size: 18px; transition: transform 160ms var(--ease); }
  :global(.home-ctas .today-cta:hover .cta-arrow) { transform: translateX(3px); }
  :global(.home-ctas .marathon-cta) { border-color: var(--line); background: var(--surface); color: var(--ink); }
  :global(.home-ctas .marathon-cta .cta-icon) { background: linear-gradient(135deg, #c25a1c, #8250c4); color: #fff; }
  :global(.home-ctas .marathon-cta:hover) { border-color: var(--ink); background: var(--surface); color: var(--ink); }
  @media (max-width: 699px) {
    .home-ctas { display: grid; grid-template-columns: 1fr 1fr; align-self: stretch; gap: 8px; }
    :global(.home-ctas .today-cta) { padding: 8px 10px 8px 8px; gap: 9px; }
    :global(.home-ctas .cta-icon) { width: 32px; height: 32px; }
    :global(.home-ctas .cta-text small), :global(.home-ctas .cta-arrow) { display: none; }
  }
  .venue-directory { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr)); gap: 10px; }
  .venue-tile { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .venue-tile:hover { border-color: var(--link); background: var(--surface-alt); }
  .venue-tile-name { display: flex; justify-content: space-between; gap: 12px; font-weight: 700; }
  .venue-tile-name span, .venue-tile-today { color: var(--link); }
  .venue-tile-address { color: var(--muted); font-size: 13px; }
  .venue-tile-today { margin-top: auto; padding-top: 4px; font-size: 12px; }
  .venue-tile-today:empty { display: none; }
  .venue-source-note { margin-top: 16px; max-width: 720px; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .venue-source-note summary { min-height: 44px; align-content: center; cursor: pointer; }
  .venue-source-note a { color: var(--link); text-decoration: underline; }
</style>
