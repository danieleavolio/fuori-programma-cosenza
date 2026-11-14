# Fuori programma

Web app statica per confrontare la programmazione dei cinema di Cosenza e Rende in un'unica vista.

## Cinema supportati

- **Andromeda River** (Zumpano) — `https://zumpano.andromeda.18tickets.it/`
- **Cinema Citrigno** (Cosenza) — `https://citrigno.cosenzacinema.18tickets.it/`
- **Cinema Teatro Italia A. Tieri** (Cosenza) — `https://cinemateatroitalia.cosenzacinema.18tickets.it/`
- **Cinema Garden** (Rende) — `https://www.cinemagarden.net/`
- **Unical Cinema** (Arcavacata di Rende) — `https://unical.cosenzacinema.18tickets.it/`

## Avvio locale

Apri la cartella con un server statico, per esempio:

```powershell
python scripts/build_calendars.py
python -m http.server 8000
```

Poi visita `http://localhost:8000`. L’app legge i dati da `data/schedule.json`.

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

## Offline e installazione

Il sito è una PWA: `manifest.webmanifest` e `sw.js` mettono in cache la shell e i dati (`data/schedule.json`, `data/venues-info.json`), quindi l'app si apre e resta consultabile anche senza rete. La versione della cache va aggiornata in `sw.js` a ogni modifica di file della shell o dei dati. Da Chrome o Safari si può aggiungere alla schermata Home; le scorciatoie del manifest aprono direttamente la programmazione (`?view=schedule`) o i film salvati (`?view=favorites`).

## Headroom locale

Headroom comprime il contesto tra OpenCode e il provider, ma richiede un endpoint compatibile e la relativa chiave API. L'installazione locale usa `uv` e non modifica il PATH o la configurazione globale:

```powershell
$env:UV_TOOL_DIR = (Join-Path (Get-Location) 'tools\headroom\uv-tools')
$env:UV_TOOL_BIN_DIR = (Join-Path (Get-Location) 'tools\headroom\bin')
uv tool install --python 3.10 'headroom-ai[proxy]==0.42.0'
```

Il comando `headroom` è disponibile in `tools\headroom\bin`. Per attivare il proxy in OpenCode occorre prima scegliere il provider/upstream e impostare la sua chiave API nell'ambiente, senza salvarla nella repo. Guida: <https://docs.headroomlabs.ai/docs/opencode-deepseek>.

## Pubblicazione

Il sito è composto da file statici e viene pubblicato tramite GitHub Pages. Il workflow `.github/workflows/pages.yml` verifica il codice, conserva la programmazione pubblicata più recente tramite `scripts/prepare_release.py`, arricchisce i metadati e genera i feed prima del deploy.

Il workflow `.github/workflows/update-schedule.yml` aggiorna automaticamente gli orari ogni quattro ore, i metadati e i calendari e pubblica direttamente l'artifact anche se il push del bot non è consentito. I due workflow condividono la stessa coda di deploy. Nessun task Windows o API key è necessario.

## Preview SvelteKit e Vercel

La migrazione è affiancata alla PWA esistente: GitHub Pages e i suoi URL non vengono sostituiti. L'applicazione SvelteKit usa rendering server-side per home, pagine film, cinema e programmazione di oggi/stasera/weekend e per `/prossimamente`; espone `robots.txt`, `sitemap.xml` (con le locandine come `image:image`), canonical, Open Graph, percorsi di navigazione strutturati e dati strutturati. Le viste di programmazione sono collegate tra loro da `/programmazione/oggi`, `/programmazione/stasera`, `/programmazione/weekend` e `/prossimamente`. La PWA completa, con preferiti locali, filtri e calendari multi-cinema, viene copiata durante la build in `/legacy/`.

`/programmazione/stasera` elenca solo gli spettacoli di oggi dalle 20 in poi; `/prossimamente` legge `releaseDateIT` dalla programmazione e mostra le uscite con data italiana futura, con "domani"/"dopodomani" quando mancano uno o due giorni. Entrambe le pagine si aggiornano da sole a ogni scraping: nessun elenco manuale da mantenere.

Per lo sviluppo locale:

```powershell
npm ci
npm run dev
npm run check
npm run test:svelte
npm run build
npm run test:preview -- --browser
```

Importare questa repository in Vercel con preset SvelteKit e Node.js 22. `@sveltejs/adapter-auto` seleziona Vercel durante il deploy. Non cambiare il dominio attuale finché la preview e i flussi PWA/calendario non sono verificati; una preview Vercel risponde con `robots.txt` che blocca l'indicizzazione.

La build esegue `scripts/build_calendars.py` e include nell'app legacy l'ultima programmazione presente in `data/schedule.json`. Per mantenere aggiornato anche Vercel, collegare il repository GitHub al progetto Vercel (così i commit periodici del workflow creano deployment). Se il secret `SCHEDULE_TOKEN` non permette di salvare un aggiornamento nel repository, GitHub Pages pubblica ugualmente il dato acquisito nell'artifact, ma Vercel continuerà a leggere il JSON dell'ultimo commit: configurare un token di scrittura oppure un deploy hook con dati aggiornati prima di affidargli il dominio.

Le immagini Open Graph sono generate da `scripts/make_og.mjs` (fase `og:build`, prima di `vite build`): un'immagine 1200×630 brandizzata in `static/og/default.png` e, per ogni film con locandina raggiungibile, una versione con la locandina a destra e titolo a sinistra. I file per film sono in `.gitignore` e l'elenco dei riusciti finisce in `src/lib/og-manifest.json`; un film senza immagine ricade su quella di default, quindi un download fallito non rompe l'anteprima social.

Le schede evento offrono Google Calendar tramite il suo editor precompilato e un iCalendar `.ics` individuale servito dal sito. La nuova pagina `/calendario` permette di scegliere più cinema anche senza JavaScript e distingue abbonamenti da appuntamenti singoli; i link di abbonamento puntano ai feed aggiornati di GitHub Pages, non a copie generate dalla preview. La copia legacy rimane disponibile sotto `/legacy/calendars/`.

Il pulsante calendario della home e di `/calendario` scarica il file `.ics` dei cinema selezionati: su iPhone apre l'importazione nel calendario di sistema, su Android e desktop salva il file. L'abbonamento Google tramite URL continua a richiedere il web desktop. Aggiungerlo direttamente a un account Google da mobile richiede un'integrazione Google Calendar API e OAuth verificata; non si simula con un link e non è attivata senza credenziali/configurazione OAuth.

`npm run test:preview -- --browser` avvia una preview di produzione temporanea sulla porta 4387, verifica HTML SSR, sitemap, selezioni calendario, date e UID iCalendar, pagine mancanti e layout su quattro larghezze da 320 a 1280 px. Il controllo browser richiede Chrome/Chromium (`CHROME_BIN` se non è nel percorso standard). Il workflow `.github/workflows/svelte-preview.yml` esegue questi controlli separatamente dal deploy Pages; non pubblica né modifica il sito attuale.
