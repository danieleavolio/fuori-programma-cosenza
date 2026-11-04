# Fuori programma

Web app statica per confrontare la programmazione dei cinema di Cosenza e Rende in un'unica vista.

## Cinema supportati

- **Andromeda River** (Zumpano) — `https://zumpano.andromeda.18tickets.it/`
- **Cinema Citrigno** (Cosenza) — `https://citrigno.cosenzacinema.18tickets.it/`
- **Cinema Garden** (Rende) — `https://www.cinemagarden.net/`
- **Unical Cinema** (Arcavacata di Rende) — `https://unical.cosenzacinema.18tickets.it/`

## Avvio locale

Apri la cartella con un server statico, per esempio:

```powershell
python -m http.server 8000
```

Poi visita `http://localhost:8000`. L’app legge i dati da `data/schedule.json`.

## Aggiornamento dati

`python scripts/update_schedule.py` interroga le fonti ufficiali dei cinema e aggiorna `data/schedule.json`. GitHub Actions aggiorna e ripubblica il sito automaticamente tre volte al giorno. Gli orari rimangono collegati direttamente alle pagine di acquisto del rispettivo cinema.

## Pubblicazione

Il sito è composto da file statici e viene pubblicato tramite GitHub Pages. Il workflow `.github/workflows/pages.yml` aggiorna i dati ed esegue il deploy automatico del repository.
