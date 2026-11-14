<script lang="ts">
  import JsonLd from '../lib/JsonLd.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>Programmazione cinema a Cosenza e Rende | Fuori programma</title>
  <meta name="description" content="Programmazione e orari dei cinema a Cosenza e Rende: Andromeda River, Citrigno, Teatro Italia, Garden e Cinema Unical." />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Fuori programma — Cinema a Cosenza e Rende" />
  <meta property="og:description" content="Tutti gli orari dei cinema di Cosenza, Rende e Zumpano in un solo posto." />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content="it_IT" />
  {#if data.movies[0]?.poster}<meta property="og:image" content={data.movies[0].poster} />{/if}
  <meta name="twitter:card" content="summary_large_image" />
  {#if data.movies[0]?.poster}<meta name="twitter:image" content={data.movies[0].poster} />{/if}
  <JsonLd schema={data.schema} />
  <script src="/app.js?v=20261113i" defer></script>
</svelte:head>

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">Programmazione cinema</h1>
  <p>Cosenza, Rende e Zumpano</p>
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

    <div class="quick-chips">
      <button type="button" class="chip active" data-chip="all" aria-pressed="true">Tutti</button>
      <button type="button" class="chip" data-chip="today" aria-pressed="false">Oggi</button>
      <button type="button" class="chip" data-chip="tonight" aria-pressed="false">Stasera</button>
      <button type="button" class="chip" data-chip="weekend" aria-pressed="false">Weekend</button>
      <button type="button" class="chip" data-chip="favorites" aria-pressed="false">
        Salvati (<span id="chip-fav-count">0</span>)
      </button>
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
    <h2 id="cinema-title">Cinema</h2>
    <p class="section-note">Orari, indirizzo e indicazioni per le cinque sale.</p>
  </div>
  <div class="cinema-list" id="cinema-list"></div>
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
      <a id="calendar-google" class="calendar-app-link" href="#calendar-dialog-title" target="_blank" rel="noopener noreferrer"><strong>Google Calendar</strong><small>Aggiunta da URL, una volta sola</small></a>
      <a id="calendar-apple" class="calendar-app-link" href="#calendar-dialog-title"><strong>Apple Calendario</strong><small>Apri la richiesta di abbonamento</small></a>
      <a id="calendar-outlook" class="calendar-app-link" href="#calendar-dialog-title" target="_blank" rel="noopener noreferrer"><strong>Outlook</strong><small>Aggiungi dalla versione web</small></a>
      <button id="calendar-copy" type="button" class="calendar-app-link"><strong>Copia link</strong><small>Per altre app di calendario</small></button>
    </div>
    <p class="calendar-help" id="calendar-subscription-help">Un solo calendario per i cinema selezionati. Nessun promemoria per ogni proiezione; i tempi di aggiornamento dipendono dall’app. Per cambiare cinema, sostituisci l’abbonamento precedente.</p>
    <details class="calendar-instructions">
      <summary>Come aggiungerlo su Google Calendar</summary>
      <p>Apri Google Calendar, scegli Altri calendari → + → Da URL e incolla il link copiato qui. Dal telefono, se la pagina si apre in versione mobile e non trovi «Da URL», attiva «Sito desktop» nel menu del browser. Dopo l’aggiunta il calendario compare nell’app su iPhone e Android con lo stesso account Google.</p>
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

<noscript>Per visualizzare gli orari è necessario attivare JavaScript.</noscript>
