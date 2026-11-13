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

Lo stato delle fonti finisce dentro `data/schedule.json`: `available` (aggiornata ora), `stale` (ultima programmazione nota) o `unavailable` (nessun dato). Il sito mostra un avviso quando la programmazione è vecchia o parziale.

I test di resilenza si eseguono con:

```
python scripts/test_resilience.py
```

Gli orari rimangono collegati direttamente alle pagine di acquisto del rispettivo cinema.

### Token del workflow

Il deploy pubblica sempre i dati aggiornati. Per salvare la programmazione anche nel repository il workflow usa il secret `SCHEDULE_TOKEN` (un token con permesso di scrittura su questo repository): senza il secret il sito si aggiorna lo stesso, ma `data/schedule.json` nel repository resta fermo all'ultimo commit.

## Interfaccia

Le viste **Per Film** e **Per Giorno** hanno ciascuna una modalità *griglia* e *lista*: il contenuto delle card è identico, cambia solo la disposizione (locandina in alto o a sinistra). In griglia la locandina mantiene proporzioni fisse anche a card aperta, quindi non si gonfia a tutta pagina.

La griglia usa due colonne su telefono/tablet e tre da 960 px. Le card chiuse condividono gli stessi spazi e la stessa altezza. Durata, generi e barra delle azioni scorrono orizzontalmente (anche con le frecce da tastiera); trailer, condividi e salva hanno tutti un'area di tocco alta 44 px. La locandina e **Vedi sale e orari** aprono lo stesso pannello in entrambe le viste: prima si sceglie il cinema, poi l'orario e la relativa biglietteria. Trama completa e cast sono consultabili senza occupare lo spazio degli orari.

Test UI con Chrome/Chromium e Node 22+, senza dipendenze npm:

```powershell
node scripts/test_ui.mjs http://127.0.0.1:8000/
```

Il test verifica griglia/lista, otto larghezze da 320 a 1440 px, entrambi i temi, altezza delle card e dei comandi, overflow, apertura e focus, menu dei biglietti, calendario e ricaricamento offline. `--quick` limita le larghezze a 390 e 1280 px; `--screenshots <cartella>` salva le schermate. Se Chrome non è nel percorso standard, impostare `CHROME_BIN`.

Nella vista **Per Giorno**, quando il giorno scelto è oggi, gli spettacoli già iniziati sono nascosti: restano recuperabili con il toggle che li conta, e in quel caso compaiono attenuati con l'orario barrato.

La sezione **Cinema** ha una card per sala con illustrazione vettoriale, indirizzo, telefono, collegamento a Google Maps, caratteristiche e i film in programma oggi. I dati editoriali delle sale stanno in `data/venues-info.json`.

I film salvati sono confrontati a ogni aggiornamento della programmazione: se compaiono nuovi orari la home mostra un avviso con il conteggio e un pulsante per aprire i salvati. Lo stato del confronto è in `localStorage`.

Il pulsante **Calendario** esporta un file `.ics` con gli spettacoli scelti (film salvati, una sala o un giorno), completo di sala, indirizzo, link ai biglietti e promemoria 45 minuti prima. Il file è generato nel browser, senza servizi esterni.

## Dati dei film

`scripts/update_schedule.py` scarica la scheda di ogni film dalle sale 18tickets e ne ricava trama, generi, regia, anno, lingua, cast, durata e trailer YouTube, senza usare API key. I campi vengono conservati nel tempo e riletti a ogni aggiornamento, così restano disponibili anche quando una scheda non viene riscaricata.

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

Il sito è composto da file statici e viene pubblicato tramite GitHub Pages. Il workflow `.github/workflows/pages.yml` aggiorna i dati ed esegue il deploy automatico del repository.

I dati aggiornati vengono pubblicati dal deploy, che carica l'intera cartella come artifact: non serve che il file `data/schedule.json` venga committato su `main` (le regole del repository richiedono comunque una pull request per scrivere su `main`). Per ripristinare un giorno mancante il scraper usa come base la programmazione già pubblicata sul sito, che è sempre più aggiornata del file nel repository.
