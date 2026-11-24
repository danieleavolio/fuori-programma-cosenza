# Fuori programma

Web app per confrontare la programmazione dei cinema di Cosenza e Rende in un'unica vista.

- **Sito pubblico (principale):** <https://fuoriprogramma.dpdns.org/> — SvelteKit su Vercel. Il vecchio indirizzo <https://fuori-programma-cosenza.vercel.app/> rimanda qui con un redirect 301.
- **GitHub Pages** (<https://danieleavolio.github.io/fuori-programma-cosenza/>) è il backend statico: pubblica `data/schedule.json` e i feed calendario `.ics` che Vercel e gli abbonamenti leggono. La copia della vecchia app lì presente punta a Vercel come canonical.

Istruzioni operative per chi sviluppa (anche agenti): [AGENTS.md](AGENTS.md). SEO: [SEO.md](SEO.md).

## Cinema supportati

- **Andromeda River** (Zumpano) — `https://zumpano.andromeda.18tickets.it/`
- **Cinema Citrigno** (Cosenza) — `https://citrigno.cosenzacinema.18tickets.it/`
- **Cinema Teatro Italia A. Tieri** (Cosenza) — `https://cinemateatroitalia.cosenzacinema.18tickets.it/`
- **Cinema Garden** (Rende) — `https://www.cinemagarden.net/`
- **Unical Cinema** (Arcavacata di Rende) — `https://unical.cosenzacinema.18tickets.it/`

## Avvio locale

```powershell
npm ci
npm run dev          # http://127.0.0.1:5173
```

I dati vengono da `data/schedule.json` del repository. La vecchia app statica resta servibile anche da sola (`python scripts/build_calendars.py` e poi `python -m http.server 8000`), ma lo sviluppo avviene su SvelteKit.

## Aggiornamento dati

`python scripts/update_schedule.py` interroga tutte le fonti ufficiali dei cinema e aggiorna `data/schedule.json`. GitHub Actions aggiorna e ripubblica il sito ogni quattro ore.

Il WAF di AWS davanti alle sale 18tickets risponde ai runner GitHub con una challenge anti-bot in JavaScript invece della pagina: per questo lo scraper usa **Chrome headless** (già presente sui runner, avviato da `scripts/browser_fetch.mjs`) quando la richiesta diretta viene bloccata. Da una rete normale la richiesta diretta funziona e il browser non viene usato.

Lo scraper è pensato per non perdere mai la programmazione:

- ritenta su errori transitori (429, 5xx, rete) con attese crescenti;
- ogni sala è isolata: se una fonte non risponde le altre vengono pubblicate lo stesso e per la sala saltante si tiene l'ultima programmazione nota;
- se una fonte ha pubblicato meno giorni del solito, i giorni futuri già noti vengono ripristinati (solo per i film ancora in cartellone);
- le date annunciate da Citrigno Group (`cosenzacinema.it`) sono trattate come fallback e non fanno cadere l'aggiornamento;
- i film che finiscono vengono eliminati, le date passate non vengono pubblicate.

Lo stato delle fonti finisce dentro `data/schedule.json`: `available` (aggiornata ora), `stale` (ultima programmazione nota) o `unavailable` (nessun dato). Eventuali problemi della singola fonte sono indicati nella sua card cinema, senza avvisi generici di programmazione parzialmente aggiornata.

I test di resilenza si eseguono con:

```
python scripts/test_resilience.py
```

Gli orari rimangono collegati direttamente alle pagine di acquisto del rispettivo cinema.

### Token del workflow

Il deploy pubblica sempre i dati aggiornati. Per salvare la programmazione anche nel repository il workflow usa il secret `SCHEDULE_TOKEN` (un token con permesso di scrittura su questo repository): senza il secret il sito si aggiorna lo stesso, ma `data/schedule.json` nel repository resta fermo all'ultimo commit.

## Interfaccia

Le viste **Per Film** e **Per Giorno** hanno ciascuna una modalità *griglia* e *lista*: il contenuto delle card è identico, cambia solo la disposizione (locandina in alto o a sinistra). In griglia la locandina mantiene proporzioni fisse anche a card aperta, quindi non si gonfia a tutta pagina.

La griglia usa due colonne su telefono/tablet e tre da 960 px. Le card chiuse condividono gli stessi spazi e la stessa altezza, **senza scorrimento interno**. Tre comandi a icona (trailer, condividi e salva) rimangono sempre visibili, con aree di tocco di almeno 44 × 44 px anche a 320 px. La locandina e **Vedi sale e orari** aprono lo stesso pannello: prima si sceglie il cinema, poi l'orario e la relativa biglietteria. Trama, cast, generi completi e valutazioni dettagliate sono nella scheda aperta.

L'ordine predefinito è **Ultime uscite** in Per Film e **Prossimo spettacolo** in Per Giorno. Sono disponibili anche Ultime aggiunte, Più votati e Titolo A–Z; l'ordinamento è ricordato separatamente per vista. Uscite e riedizioni future seguono i film già usciti. I voti sono ponderati con 20 valutazioni a priori a 3/5, per non premiare un 5/5 basato su pochissime persone. Date e voti mancanti non vengono inventati.

Le scorciatoie **Oggi**, **Stasera** (dalle 18:00) e **Weekend** filtrano gli spettacoli ancora da iniziare. Il weekend comprende venerdì, sabato e domenica correnti o successivi, senza saltare alla settimana dopo se è già domenica. **I miei cinema** consente di scegliere più sale e ricordarle sul dispositivo; l'applicazione del filtro è esplicita. Ricerca, genere, cinema e ordinamento sono comuni alle due viste.

Gli orari mostrano la fine indicativa solo se la durata è nota, escluse pubblicità e intervallo. V.O., sottotitoli e 3D sono indicati soltanto quando dichiarati per quello spettacolo dalla sala. “In programma fino a…” descrive le date pubblicate, non presume che sia l'ultima occasione di vedere il film.

Test UI con Chrome/Chromium e Node 22+, senza dipendenze npm:

```powershell
node scripts/test_ui.mjs http://127.0.0.1:8000/
```

Il test verifica griglia/lista, otto larghezze da 320 a 1440 px, entrambi i temi, altezza delle card e dei comandi, assenza di scorrimento e comandi tagliati, apertura e focus, menu dei biglietti, ordinamenti, filtri, preferenze, calendario multi-cinema (anche 320 × 600 px) e ricaricamento offline. `--quick` limita le larghezze a 390 e 1280 px; `--screenshots <cartella>` salva le schermate. Se Chrome non è nel percorso standard, impostare `CHROME_BIN`.

Nella vista **Per Giorno**, quando il giorno scelto è oggi, gli spettacoli già iniziati sono nascosti: restano recuperabili con il toggle che li conta, e in quel caso compaiono attenuati con l'orario barrato.

La sezione **Cinema** ha una card per sala con illustrazione vettoriale, indirizzo, telefono, collegamento a Google Maps, caratteristiche e i film in programma oggi. I dati editoriali delle sale stanno in `data/venues-info.json`.

I film salvati sono confrontati a ogni aggiornamento della programmazione: se compaiono nuovi orari la home mostra un avviso con il conteggio e un pulsante per aprire i salvati. Lo stato del confronto è in `localStorage`.

### Calendario in abbonamento

**Calendario → Segui i tuoi cinema** permette di selezionare più sale e aggiungere un unico calendario aggiornabile a Google Calendar, Apple Calendario o Outlook, oppure copiarne il link. Con cinque cinema, `scripts/build_calendars.py` genera le 31 selezioni possibili in `calendars/` (non versionata; generata a ogni deploy). `all.ics` comprende tutte le sale; gli altri nomi contengono gli ID ordinati e separati da `_`.

I feed contengono sala, indirizzo e link ai biglietti, fuso Europe/Rome, UID stabili, versioni degli eventi e cancellazioni esplicite. Sono trasparenti (non bloccano l'agenda) e **senza promemoria automatici per ogni proiezione**. Lo storico in `data/calendar-state.json` conserva 30 giorni e viene recuperato anche dall'ultimo deploy, qualora il bot non abbia potuto fare push.

Google richiede l'aggiunta iniziale dal web su computer: nell'interfaccia sono disponibili istruzioni e link da copiare. L'effettiva sincronizzazione e la gestione di `webcal:` dipendono dall'app installata. Per cambiare selezione bisogna sostituire l'abbonamento precedente, non aggiungerlo nuovamente lasciando entrambi attivi.

**Preferisci una copia da importare?** conserva l'esportazione locale `.ics` per i cinema scelti, i film salvati o un giorno, con promemoria facoltativo. È una copia non sincronizzata. I salvati restano sul dispositivo: non vengono presentati come un abbonamento personalizzato. Dal menu di un orario si può aggiungere il singolo appuntamento.

## Dati dei film

`scripts/update_schedule.py` scarica la scheda di ogni film dalle sale 18tickets e ne ricava trama, generi, regia, anno, lingua, cast, durata e trailer YouTube, senza usare API key. I campi vengono conservati nel tempo e riletti a ogni aggiornamento, così restano disponibili anche quando una scheda non viene riscaricata.

`scripts/movie_metadata.py` arricchisce i dati con voto complessivo MYmovies su 5, critica, pubblico, numero di valutazioni/recensioni quando pubblicato e data di uscita o riedizione italiana. L'identità è verificata con titolo, anno e regista (incluse iniziali e marcatori di riedizione). La fonte e la data di verifica accompagnano i voti: nessuna media fra siti o confusione tra critica e pubblico.

La cache `data/movie-metadata.json` limita la verifica a una volta al giorno e a 42 richieste per esecuzione; dopo errori si attende almeno sei ore, conservando il dato precedente. Un problema dei metadati non blocca gli orari. `data/movie-history.json` conserva la prima comparsa, inizialmente ricostruita dai commit disponibili, anche se un film esce e rientra in programmazione.

```powershell
python scripts/movie_metadata.py
python scripts/test_enrichment.py
python scripts/test_resilience.py
node --check app.js
node --check sw.js
```

I test Python dei metadati e dei calendari sono deterministici, senza rete o dipendenze aggiuntive, e coprono abbinamenti errati, dati mancanti, cache, indisponibilità, 31 selezioni, UID, modifiche, cancellazioni e ripristino degli eventi. Non sono configurati build o linter di framework.

## Maratona (più film di fila)

`/maratona` aiuta a capire quali film si possono vedere uno dopo l'altro nello stesso giorno. Si sceglie un giorno e fino a cinque film; la pagina cerca tutte le sequenze di spettacoli compatibili e mostra prima quelle comode, poi quelle con meno attesa.

- La fine di uno spettacolo è `inizio + durata del film`, più i minuti di pubblicità e trailer se l'utente li conta (0, 10, 15 o 20; predefinito 0). Senza durata pubblicata si usano 120 minuti e lo si dice.
- Fra due sale diverse si aggiunge lo spostamento (predefinito 15 minuti, selezionabile); nella stessa sala no. Un margine inferiore a 10 minuti è segnalato come «stretto».
- Se non ci stanno tutti i film scelti, si mostrano le combinazioni con il numero massimo possibile.
- Oggi contano solo gli spettacoli non ancora iniziati. Ogni orario porta alla biglietteria della sala.
- Lo stato è nell'URL (`?giorno=AAAA-MM-GG&film=<slug>&viaggio=15&pubblicita=0`), quindi il piano si può condividere; il calcolo avviene nel browser senza richieste al server. Funziona anche senza JavaScript tramite il pulsante «Calcola».

La logica è in `src/lib/marathon.ts` (modulo puro, condiviso fra SSR e browser); i dati del giorno li prepara `src/routes/maratona/+page.server.ts`.

## Offline e installazione

Il sito è una PWA: `manifest.webmanifest` e `sw.js` mettono in cache la shell e i dati (`data/schedule.json`, `data/venues-info.json`), quindi l'app si apre e resta consultabile anche senza rete. La versione della cache va aggiornata in `sw.js` a ogni modifica di file della shell o dei dati. Da Chrome o Safari si può aggiungere alla schermata Home; le scorciatoie del manifest aprono direttamente la programmazione (`?view=schedule`) o i film salvati (`?view=favorites`).

## Pubblicazione

Il flusso è: **bot GitHub → GitHub Pages (dati) → Vercel (sito)**.

1. `.github/workflows/update-schedule.yml` ogni quattro ore aggiorna orari, metadati e calendari, pubblica l'artifact su GitHub Pages (anche se il push del bot non è consentito) e chiama il deploy hook di Vercel.
2. `.github/workflows/pages.yml` verifica il codice e ripubblica su Pages conservando la programmazione più recente (`scripts/prepare_release.py`). I due workflow condividono la stessa coda.
3. La build Vercel (`npm run build`) scarica i dati appena pubblicati su Pages (`data:pull`), li normalizza e genera locandine, icone e immagini social prima di `vite build`.

Nessun task Windows o API key è necessario.

## SvelteKit su Vercel

L'applicazione SvelteKit usa rendering server-side per home, pagine film, cinema e programmazione di oggi/stasera/weekend e per `/prossimamente`; espone `robots.txt`, `sitemap.xml` (con le locandine come `image:image`), canonical, Open Graph, percorsi di navigazione strutturati e dati strutturati. Le viste di programmazione sono collegate tra loro da `/programmazione/oggi`, `/programmazione/stasera`, `/programmazione/weekend` e `/prossimamente`. La PWA completa, con preferiti locali, filtri e calendari multi-cinema, viene copiata durante la build in `/legacy/`.

`/programmazione/stasera` elenca solo gli spettacoli di oggi dalle 20 in poi. Oggi, Stasera, Weekend e Prossimamente condividono card con locandina e selettore griglia/lista. Gli spettacoli sono raggruppati per film e giorno.

`/prossimamente`, raggiungibile dalla barra principale anche su mobile, mostra gli annunci ufficiali divisi per cinema (`comingSoon`), con fonte e link alla scheda: `/coming_soon` delle quattro sale 18Tickets e la sezione Prossimamente del Garden. Le date pubblicate dalle sale sono separate da `releaseDateIT`, la data italiana. Gli annunci non creano spettacoli o eventi calendario. Se una fonte fallisce si conserva la sua lista precedente; una lista vuota valida la sostituisce. I titoli dei poster Garden abbreviati sono normalizzati nello scraper. Le uscite italiane future restano in una sezione distinta.

Verifica browser delle quattro pagine, griglia/lista, caricamento locandine e larghezze 320/390/1280 px (server locale attivo):

```powershell
node scripts/test_catalog_browser.mjs http://127.0.0.1:5173
```

Per lo sviluppo locale:

```powershell
npm ci
npm run dev
npm run check
npm run test:svelte
npm run build
npm run test:preview -- --browser
```

Il progetto Vercel usa il preset SvelteKit e Node.js 22; `@sveltejs/adapter-auto` seleziona Vercel durante il deploy. Le preview Vercel rispondono con `robots.txt` che blocca l'indicizzazione. Per un dominio personale vedere «Cambio dominio» in [AGENTS.md](AGENTS.md).

La build include nell'app legacy (`/legacy/`) la programmazione scaricata. Se il secret `SCHEDULE_TOKEN` non permette al bot di salvare `data/schedule.json` nel repository, il sito resta comunque aggiornato perché Vercel legge i dati pubblicati su Pages.

Le immagini Open Graph sono generate da `scripts/make_og.mjs` (fase `og:build`, prima di `vite build`): home, viste temporali, Prossimamente, Calendario, cinque cinema e schede film hanno immagini 1200×630 dedicate. Se una locandina non risponde si conserva una card film con titolo e brand. Il manifest versiona gli URL in base al contenuto per rinnovare le anteprime social. Canonical, sitemap e metadati usano il dominio pubblico unico, configurabile con `FP_SITE_URL`; preview e ingresso legacy non devono essere indicizzati. Procedura di verifica e attività Search Console in [SEO.md](SEO.md).

Le schede evento offrono Google Calendar tramite il suo editor precompilato e un iCalendar `.ics` individuale servito dal sito. La nuova pagina `/calendario` permette di scegliere più cinema anche senza JavaScript e distingue abbonamenti da appuntamenti singoli; i link di abbonamento puntano ai feed aggiornati di GitHub Pages, non a copie generate dalla preview. La copia legacy rimane disponibile sotto `/legacy/calendars/`.

Il pulsante calendario della home e di `/calendario` scarica il file `.ics` dei cinema selezionati: su iPhone apre l'importazione nel calendario di sistema, su Android e desktop salva il file. L'abbonamento Google tramite URL continua a richiedere il web desktop. Aggiungerlo direttamente a un account Google da mobile richiede un'integrazione Google Calendar API e OAuth verificata; non si simula con un link e non è attivata senza credenziali/configurazione OAuth.

`npm run test:preview -- --browser` avvia una preview di produzione temporanea sulla porta 4387, verifica HTML SSR, sitemap, selezioni calendario, date e UID iCalendar, pagine mancanti e layout su quattro larghezze da 320 a 1280 px. Il controllo browser richiede Chrome/Chromium (`CHROME_BIN` se non è nel percorso standard). Il workflow `.github/workflows/svelte-preview.yml` esegue questi controlli separatamente dal deploy Pages; non pubblica né modifica il sito attuale.
