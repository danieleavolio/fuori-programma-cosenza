# Fuori programma

Web app statica per confrontare la programmazione dei cinema di Cosenza e Rende.

## Avvio locale

Apri la cartella con un server statico, per esempio:

```powershell
python -m http.server 8000
```

Poi visita `http://localhost:8000`. L’app legge i dati da `data/schedule.json`.

## Aggiornamento dati

`python scripts/update_schedule.py` legge la pagina pubblica di Andromeda River e aggiorna il file JSON. GitHub Actions aggiorna e ripubblica il sito tre volte al giorno. Gli orari restano linkati alla pagina di acquisto del cinema.

Le pagine ufficiali del Citrigno, del Garden e di Unical Cinema non sono state identificate con certezza in questa prima configurazione: il sito non mostra orari inventati e li segnala come fonti da collegare. Per attivare anche questi cinema va aggiunto un adattatore per la loro fonte ufficiale.

## Pubblicazione

Il sito è composto da file statici e può essere pubblicato con GitHub Pages. Il workflow `pages.yml` distribuisce il contenuto del repository.
