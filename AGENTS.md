# AGENTS.md

Istruzioni operative per chi lavora su **Fuori programma Cosenza**.

## Contesto

- Sito pubblico: `https://fuori-programma-cosenza.vercel.app/`
- Stack: SvelteKit + Svelte 5, con la vecchia app `app.js` servita dalla stessa origine.
- Dati statici in `data/schedule.json`; nessun database e nessuna API a runtime.
- Il bot GitHub aggiorna la programmazione ogni 4 ore e la pubblica su GitHub Pages
  (`https://danieleavolio.github.io/fuori-programma-cosenza/`).
- Vercel ricostruisce il sito e, in build, scarica i dati appena pubblicati.
- `README.md` descrive prodotto e dati. `SEO.md` descrive SEO, canonical e anteprime social.
- Vercel è il sito principale. GitHub Pages serve solo come backend statico di dati e feed calendario.

## Lavorare con pochi token

- Parti da questo file; apri `README.md` o `SEO.md` solo per la sezione che ti serve (`grep -n "^#"`).
- **Non leggere per intero** `app.js` (~100 KB), `styles.css` (~45 KB), `data/*.json`,
  `package-lock.json`, `src/lib/server/posters.generated.json`, `src/lib/og-manifest.json`,
  `.svelte-kit/`, `static/`, `calendars/`. Cerca con `grep -n` e leggi solo le righe utili;
  per i dati usa uno script (`python -c` / `node -e`) che stampi chiavi e conteggi.
- Mappa rapida: route in `src/routes/<pagina>/`, dati e helper SSR in `src/lib/server/data.ts`,
  metadati in `src/lib/Seo.svelte`, sitemap in `src/routes/sitemap.xml/+server.ts`,
  immagini social in `scripts/make_og.mjs`, header e navigazione in `src/routes/+layout.svelte`.
- Stili di una pagina nuova: `<style>` del componente, con le variabili CSS di `styles.css`
  (`--ink`, `--muted`, `--line`, `--surface`, `--blue`, `--link`, `--focus`…). Così non serve
  toccare `styles.css` né aggiornare la versione del service worker.
- Verifica proporzionata: per logica pura uno script mirato; poi `npm run check`;
  `npm run build` + `npm run test:preview` solo prima di chiudere il lavoro.
- Shell Linux su questa cartella (es. agenti remoti): i `node_modules` installati da Windows
  non funzionano (binding nativi di rolldown/sharp). Copia il progetto fuori dalla cartella
  senza `node_modules`, esegui `npm ci` lì e verifica sulla copia.

## Comandi essenziali

| Cosa | Comando | Note |
| --- | --- | --- |
| Sviluppo | `npm run dev` | `http://127.0.0.1:5173` |
| Type check | `npm run check` | `svelte-check`, non serve il server |
| Build produzione | `npm run build` | prepara dati, asset, locandine e anteprime prima di Vite |
| Test completi | `npm run build && npm run test:preview -- --browser` | avvia `vite preview` sulla porta 4387 |
| SEO su server attivo | `npm run test:seo` | default `http://127.0.0.1:5173`, oppure `node scripts/test_seo.mjs <url>` |
| Griglia, liste e locandine | `node scripts/test_catalog_browser.mjs <url>` | richiede Chrome/Chromium |
| Test scraper | `python scripts/test_resilience.py` | deterministico, senza rete |
| Test metadati | `python scripts/test_enrichment.py` | cache, voti e date italiane |
| Sintassi app legacy | `node --check app.js` | |
| Rigenera anteprime social | `npm run og:build` | immagini 1200×630 in `static/og/` |
| Ottimizza locandine | `npm run posters:build` | confronta le sale, The Space, MYmovies e fonti curate; serve le migliori in WebP |
| Normalizza i dati | `npm run data:normalize` | unisce film duplicati in `data/schedule.json` |

`npm run test:svelte` e `npm run test:seo` hanno bisogno di un server già acceso.
`npm run test:preview` usa la build esistente: eseguire prima `npm run build`.

## Flusso dati e build

1. `scripts/update_schedule.py` legge le fonti ufficiali delle cinque sale e scrive
   `data/schedule.json`.
2. Il workflow `.github/workflows/update-schedule.yml` pubblica i dati su GitHub Pages
   e chiama il deploy hook di Vercel.
3. La build Vercel esegue, in ordine:
   - `data:pull`: scarica la programmazione pubblicata (solo su Vercel);
   - `data:normalize`: unisce le schede duplicate;
   - `legacy:sync`: copia dati e asset in `static/`;
   - `posters:build`, `icons:build`: prepara le locandine ottimizzate e la favicon;
   - `og:build`: genera le immagini social;
   - `vite build`.
4. `src/lib/server/data.ts` importa `data/schedule.json` per l'SSR.
   `app.js` scarica `/data/schedule.json` nel browser: le due copie devono restare allineate.

I file generati non vanno modificati a mano:
`static/posters/`, `src/lib/server/posters.generated.json`,
`static/data/`, `static/legacy/`, `static/app.js`, `static/styles.css`,
`static/sw.js`, `static/icons/`, `static/calendars/`, `static/og/*.jpg`, `calendars/`.

`data/poster-sources.json` contiene alternative verificate a mano (titolo, anno,
pagina della fonte e URL della locandina; es. UCI). The Space e MYmovies vengono
consultati automaticamente quando c'è una corrispondenza verificabile. Non usare
foto di scena o titoli ambigui; se nessuna variante migliora la resa, resta il feed.
Per un annuncio senza anno, `announcementPosters` deve indicare le URL esatte
delle locandine della sala già abbinate manualmente all'edizione corretta.

## Trappole ricorrenti

### Maratona

`/maratona` calcola le sequenze di spettacoli compatibili nello stesso giorno. La logica è in
`src/lib/marathon.ts` (puro, usato in SSR e browser); lo stato vive solo nell'URL
(`giorno`, `film`, `viaggio`, `pubblicita`) e il cambio di selezione non richiama il server.
Gli slug dei film sono quelli di `filmPath()` e includono l'anno (es. `dio-ride-2026`).
Non presentare la fine stimata come certa e non inventare durate: senza durata si usa
`FALLBACK_DURATION` e la pagina lo dichiara.

### Titoli duplicati

Lo stesso film può arrivare da due sale con apostrofo dritto (`'`) o tipografico (`’`).
Senza normalizzazione nascono due schede: una con locandina e orari, l'altra vuota con
“Orari non ancora pubblicati”. La chiave va normalizzata in **entrambi** i punti:

- Python: `title_key()` in `scripts/update_schedule.py`;
- JavaScript: `titleToken()` in `scripts/normalize_schedule.mjs`.

`npm run data:normalize` unisce le schede già presenti e tiene come principale quella
con più spettacoli reali. Il test in `scripts/test_svelte.mjs` fallisce se in
`data/schedule.json` restano duplicati compatibili.

### Date delle sale e uscite italiane

`announcedDates` contiene le date comunicate dalla singola sala.
`releaseDateIT` è l'uscita o riedizione italiana e viene da MYmovies.
Sono informazioni diverse: non vanno fuse né usate come se fossero orari prenotabili.

### Prossimamente

La pagina `/prossimamente` non deve avere la barra Oggi / Stasera / Weekend.
Ha titolo e descrizione propri. Gli annunci delle sale e le uscite italiane restano distinti.
In caso di fonte fallita si conservano gli annunci precedenti; una lista vuota valida li sostituisce.

### Service worker

Se cambi `app.js`, `styles.css` o altri asset della shell, aggiorna la versione in `sw.js`
e i parametri `?v=...` in `index.html`, `src/routes/+page.svelte` e `src/routes/+layout.svelte`.
Altrimenti i browser continuano a servire la versione vecchia dalla cache.

### Dati locali vecchi

`npm run build` locale **non** scarica i dati pubblicati: fuori da Vercel usa la copia nel
repository. Per riprodurre la produzione:

```powershell
$env:FP_PULL_PUBLISHED = '1'
npm run data:pull
npm run data:normalize
Remove-Item Env:FP_PULL_PUBLISHED
```

Ricordati che questo sovrascrive `data/schedule.json` con i dati online.

### SEO e anteprime

- L'origine canonica è in `src/lib/server/site.ts` (`FP_SITE_URL`, default Vercel).
  Non scrivere URL assoluti a mano nelle pagine.
- I metadati passano da `src/lib/Seo.svelte`: title, description, canonical, Open Graph,
  Twitter Card e `max-image-preview:large`.
- Le preview Vercel e `/legacy/` devono restare `noindex`.
- Non inventare voti, prezzi, disponibilità, recensioni o profili social.
- Non creare pagine quasi identiche per parole chiave: i contenuti locali devono essere utili.
- Google sceglie autonomamente nome del sito, snippet e canonical: non inseguire ogni
  variazione con cambi continui di metadati. Le attività Search Console sono manuali.

## Deploy e verifica

### Cambio dominio

L'origine pubblica è una sola: `siteOrigin` in `src/lib/server/site.ts`, che legge
`FP_SITE_URL`. Per passare a un dominio nuovo:

1. aggiungere il dominio su Vercel (Settings → Domains) e configurare il CNAME;
2. impostare `FP_SITE_URL=https://<dominio>` nelle variabili d'ambiente di Vercel;
3. ridispiegare: canonical, sitemap, JSON-LD e immagini social seguono da soli;
4. aggiungere la proprietà in Search Console, inviare la sitemap e chiedere l'indicizzazione;
5. tenere il vecchio `*.vercel.app` in redirect 301, così i link condivisi non si rompono.

La favicon è `/favicon.ico` (16/32/48 px, generata da `npm run icons:build`) più
`/icon.svg` e `/icons/icon-192.png`. Sui sottodomini di host condivisi Google può
mostrare nome e icona dell'host: non è un problema di meta tag, si risolve col dominio.

### Comandi

```powershell
git push origin main
gh api repos/danieleavolio/fuori-programma-cosenza/commits/<sha>/status `
  --jq '{state,statuses:[.statuses[]|{context,state,target_url}]}'
node scripts/test_seo.mjs https://fuori-programma-cosenza.vercel.app
node scripts/test_catalog_browser.mjs https://fuori-programma-cosenza.vercel.app
```

Il messaggio `Cannot update this protected ref` è normale: il push passa comunque.
Dopo il deploy verificare anche che la programmazione pubblicata sia stata normalizzata
(nessuna card vuota o duplicata).

## Skill utili (OpenCode)

Queste skill esistono solo nell'ambiente OpenCode; altrove ignorale.

- **windows-shell**: caricala quando un comando contiene quote, `$`, backtick, JSON,
  newline o testo non ASCII. Meglio scrivere un file `.ps1`/`.py` che litigare con
  l'escaping di PowerShell 5.1.
- **browser**: per controlli visivi e console. Richiede l'app desktop collegata; se non
  c'è, usare Chrome headless con `--headless=new --screenshot`.
- **report**: solo per segnalare bug di OpenCode, non per bug del sito.
- **opencode-ops**: per configurazione, plugin o log di OpenCode, non per il codice del sito.
- **humanizer**: solo se serve rifinire testi pubblici, senza cambiare i fatti.

## Definition of done

- `npm run check` e `npm run build` senza errori.
- `npm run test:preview -- --browser` superato.
- Per modifiche ai dati: `python scripts/test_resilience.py` e, se toccano i metadati,
  `python scripts/test_enrichment.py`.
- Per modifiche a griglia, locandine o layout: `node scripts/test_catalog_browser.mjs`.
- Dopo il deploy: `test_seo` e `test_catalog_browser` anche sull'URL pubblico.
- Nel riepilogo finale indicare file cambiati e verifiche concrete, non “test ok” generici.
