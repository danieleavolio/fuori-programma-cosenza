"""Non sovrascrivere dati pubblicati più recenti durante un deploy del codice."""

from movie_metadata import ROOT, enrich_schedule, read_json, write_json
from update_schedule import load_previous


def main():
    local = read_json(ROOT / "data/schedule.json", {})
    latest = load_previous() or local
    if not latest.get("movies") or not latest.get("venues"):
        raise SystemExit("Programmazione mancante: deploy interrotto")
    try:
        enrich_schedule(latest, local)
    except Exception as error:
        print(f"Metadati non aggiornati: {error}. Gli orari restano disponibili.")
    write_json(ROOT / "data/schedule.json", latest)
    print(f"Programmazione di partenza: {latest.get('updatedAt')}")


if __name__ == "__main__":
    main()
