<script lang="ts">
  import { page } from '$app/state';

  const notFound = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{notFound ? 'Pagina non trovata' : 'Errore'} | Fuori programma</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="page-heading" aria-labelledby="error-title">
  <h1 id="error-title">{notFound ? 'Pagina non trovata' : 'Qualcosa non ha funzionato'}</h1>
  <p>
    {notFound
      ? 'La pagina cercata non esiste o non è più disponibile.'
      : 'Riprova tra poco: la programmazione non è raggiungibile in questo momento.'}
  </p>
</section>

<section class="venue-schedule-block">
  <div class="calendar-subscribe">
    <p class="calendar-help">
      Torna alla <a href="/">programmazione dei cinema</a> oppure apri il
      <a href="/calendario">calendario aggiornabile</a>.
    </p>
  </div>
</section>
