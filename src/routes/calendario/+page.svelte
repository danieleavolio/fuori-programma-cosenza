<script lang="ts">
  let { data } = $props();
  let feedback = $state('');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(data.feed);
      feedback = 'Link copiato. Incollalo nella sezione abbonamenti della tua app.';
    } catch {
      feedback = 'Copia manualmente il link dal campo qui sotto.';
    }
  }
</script>

<svelte:head>
  <title>Calendario cinema aggiornabile | Fuori programma</title>
  <meta name="description" content="Segui la programmazione dei cinema di Cosenza e Rende con un calendario aggiornabile. Istruzioni per Apple Calendario, Google Calendar e Outlook." />
  <link rel="canonical" href={data.canonical} />
  <meta property="og:title" content="Segui i tuoi cinema nel calendario" />
  <meta property="og:description" content="Scegli i cinema e copia il link per un calendario aggiornabile." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={data.canonical} />
</svelte:head>

<section class="page-heading" aria-labelledby="page-title">
  <h1 id="page-title">Segui i tuoi cinema</h1>
  <p>Un calendario separato, aggiornato tramite abbonamento</p>
</section>

<form method="GET" class="venue-schedule-block">
  <div class="calendar-selection-head">
    <strong>1. Scegli uno o più cinema</strong>
    <button class="text-button" type="submit">Aggiorna selezione</button>
  </div>
  <fieldset class="venue-choice-grid calendar-venues">
    <legend class="sr-only">Cinema da seguire</legend>
    {#each data.venues as venue (venue.id)}
      <label class="venue-choice">
        <input type="checkbox" name="cinema" value={venue.id} checked={data.selected.includes(venue.id)} />
        <span><strong>{venue.name}</strong><small>{venue.location}</small></span>
      </label>
    {/each}
  </fieldset>
  <p class="calendar-help">Senza selezione viene mostrato il calendario di tutti i cinema.</p>
</form>

{#if data.feed}
  <section class="venue-schedule-block" aria-labelledby="subscribe-title">
    <div class="calendar-subscribe">
      <h3 id="subscribe-title">2. Aggiungi alla tua app</h3>
      <div class="calendar-apps">
        <a class="calendar-app-link" href={data.apple}><strong>Apple Calendario</strong><small>Apri la richiesta di abbonamento</small></a>
        <a class="calendar-app-link" href={data.feed}><strong>Scarica il file .ics</strong><small>Da importare una volta, senza aggiornamenti</small></a>
        <a class="calendar-app-link" href={data.outlook} target="_blank" rel="noopener noreferrer"><strong>Outlook</strong><small>Aggiungi dalla versione web</small></a>
        <button class="calendar-app-link" type="button" onclick={copyLink}><strong>Copia link</strong><small>Per altre app di calendario</small></button>
      </div>
      <p class="calendar-help"><strong>Sul telefono:</strong> il file .ics si apre nell’app calendario del dispositivo o si salva per importarlo. È una copia degli spettacoli attuali: non si aggiorna da sola. Per un abbonamento che si aggiorna, copia il link e aggiungilo dalla versione desktop di Google Calendar (Altri calendari → + → Da URL).</p>
      <p class="calendar-help">Un solo calendario per i cinema selezionati. Nessun promemoria per ogni proiezione; i tempi di aggiornamento dipendono dall’app. Per cambiare cinema, sostituisci l’abbonamento precedente.</p>
      <label class="feed-label" for="feed-url">Link dell’abbonamento</label>
      <input class="feed-url" id="feed-url" type="url" readonly value={data.feed} aria-label="Link HTTPS del calendario aggiornabile" />
      <p class="calendar-help" role="status">{feedback}</p>
      <details class="calendar-instructions">
        <summary>Come aggiungerlo su Google Calendar</summary>
        <p>Su computer apri Google Calendar, scegli Altri calendari → + → Da URL e incolla il link copiato qui: il calendario si aggiorna da solo e compare nell’app su iPhone e Android con lo stesso account Google.</p>
      </details>
      <p class="calendar-help">Il calendario si aggiorna da solo: non serve aggiungerlo di nuovo quando cambiano gli orari.</p>
    </div>
  </section>
{:else}
  <p class="no-times-note">Nessun cinema riconosciuto. Scegli una sala dall’elenco.</p>
{/if}

<aside class="venue-schedule-block">
  <div class="calendar-subscribe">
    <h3>Vuoi un solo spettacolo?</h3>
    <p class="calendar-help">Apri la <a href="/">scheda del film</a> e scegli Google Calendar oppure il file per altre app accanto all’orario. È un appuntamento singolo: non si aggiorna con il feed.</p>
    <p class="calendar-help">L’apertura dell’app installata dipende dal telefono e dal browser. Se sei nel browser interno di un social, apri la pagina in Safari o Chrome.</p>
  </div>
</aside>

<style>
  .feed-label { display: block; margin: 14px 0 6px; font-size: 12px; font-weight: 700; }
  .feed-url { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); font: 600 12px/1.4 var(--mono); }
  .calendar-subscribe { margin: 20px; }
</style>
