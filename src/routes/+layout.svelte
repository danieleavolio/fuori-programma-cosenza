<script lang="ts">
  import './global.css';
  let { children } = $props();
</script>

<svelte:head>
  <meta name="theme-color" content="#f5f5f5" />
  <link rel="icon" href="/legacy/icon.svg" type="image/svg+xml" />
</svelte:head>

<header class="site-header">
  <a class="brand" href="/" aria-label="Fuori programma — home"><span>fp</span><strong>fuori<br />programma</strong></a>
  <span class="place">Cosenza e Rende</span>
  <nav aria-label="Navigazione principale">
    <a href="/programmazione/oggi">Oggi</a>
    <a href="/programmazione/weekend">Weekend</a>
    <a href="/#cinema">Cinema</a>
    <a href="/calendario">Calendario</a>
    <a class="legacy-link" href="/legacy/">Apri app completa</a>
  </nav>
</header>
<main>{@render children()}</main>
<footer><a href="/">Fuori programma</a><span>Programmazione cinema a Cosenza e Rende</span><a href="/legacy/">App completa e calendari</a></footer>
