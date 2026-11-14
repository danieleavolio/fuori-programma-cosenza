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

<p class="bread"><a href="/">Home</a> / Calendario</p>
<p class="eyebrow">Il cinema nella tua agenda</p>
<h1>Segui i tuoi cinema</h1>
<p class="intro">Un calendario separato, con la programmazione delle sale che scegli. Gli aggiornamenti arrivano attraverso l’abbonamento: non devi importare un file ogni volta.</p>

<form method="GET" class="calendar-note">
  <fieldset>
    <legend><strong>1. Scegli uno o più cinema</strong></legend>
    <div class="calendar-choices">
      {#each data.venues as venue}
        <label><input type="checkbox" name="cinema" value={venue.id} checked={data.selected.includes(venue.id)} /> <span>{venue.name}<small>{venue.location}</small></span></label>
      {/each}
    </div>
  </fieldset>
  <button class="button" type="submit">Aggiorna selezione</button>
  <p class="muted">Senza selezione viene mostrato il calendario di tutti i cinema.</p>
</form>

{#if data.feed}
  <section class="calendar-note">
    <h2>2. Aggiungi un abbonamento</h2>
    <p>Selezione attiva: <strong>{data.selected.length} cinema</strong>. Per cambiarli, sostituisci il vecchio abbonamento per evitare doppioni.</p>
    <div class="calendar-methods">
      <article>
        <h3>Apple Calendario</h3>
        <p>Apri il link da Safari e conferma la richiesta di abbonamento, se supportata. Se non si apre, usa il link HTTPS qui sotto nelle impostazioni di Calendario, alla voce Aggiungi calendario con iscrizione.</p>
        <a class="button" href={data.apple}>Richiedi abbonamento Apple</a>
      </article>
      <article>
        <h3>Google Calendar</h3>
        <p>L’app mobile non aggiunge calendari da URL. Da un computer apri Google Calendar → Altri calendari → + → Da URL, incolla il link e conferma. Poi rendilo visibile nell’app sul telefono.</p>
        <a class="button secondary" href={data.google} rel="noopener" target="_blank">Apri Google Calendar sul web</a>
        <p class="muted">Non è un pulsante di aggiunta diretta all’app mobile.</p>
      </article>
      <article>
        <h3>Outlook e altre app</h3>
        <p>Su Outlook web usa l’aggiunta da Internet. Nelle altre app cerca la funzione Iscriviti tramite URL: importare il file crea invece una copia non aggiornata.</p>
        <a class="button secondary" href={data.outlook} rel="noopener" target="_blank">Apri Outlook sul web</a>
      </article>
    </div>
    <label class="calendar-url">Link dell’abbonamento
      <input type="url" readonly value={data.feed} aria-label="Link HTTPS del calendario aggiornabile" />
    </label>
    <button class="button secondary" type="button" onclick={copyLink}>Copia link</button>
    <p role="status">{feedback}</p>
    <p class="muted">Il feed resta sul sito attuale, anche da questa preview. La frequenza di sincronizzazione dipende dall’app; nessun promemoria automatico per tutte le proiezioni.</p>
  </section>
{:else}
  <p class="notice">Nessun cinema riconosciuto. Scegli una sala dall’elenco.</p>
{/if}

<aside class="calendar-note">
  <h2>Vuoi un solo spettacolo?</h2>
  <p>Apri la <a href="/">scheda del film</a> e scegli Google Calendar oppure il file per altre app accanto all’orario. È un appuntamento singolo: non si aggiorna con il feed.</p>
  <p class="muted">L’apertura dell’app installata dipende dal telefono e dal browser. Se sei nel browser interno di un social, apri la pagina in Safari o Chrome.</p>
</aside>

<style>
  fieldset { border: 0; padding: 0; margin: 0 0 18px; }
  .calendar-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 10px; margin-top: 14px; }
  .calendar-choices label { display: flex; gap: 10px; align-items: center; min-height: 56px; padding: 12px; border: 1px solid #dce4dc; border-radius: 9px; cursor: pointer; }
  .calendar-choices small { display: block; color: #626b63; margin-top: 4px; }
  .calendar-choices input { width: 20px; height: 20px; }
  .calendar-methods { display: grid; gap: 18px; margin: 20px 0; }
  .calendar-methods article { border-top: 1px solid #e0e5e0; padding-top: 12px; }
  .calendar-methods p { line-height: 1.6; }
  .calendar-url { display: block; font-weight: 650; margin: 20px 0 10px; }
  .calendar-url input { display: block; width: 100%; min-width: 0; margin-top: 8px; padding: 12px; min-height: 44px; border: 1px solid #a9b6ab; border-radius: 6px; font-size: 16px; }
</style>
