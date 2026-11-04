import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
schedule_path = ROOT / "data" / "schedule.json"

data = json.loads(schedule_path.read_text(encoding="utf-8"))

def title_key(t):
    norm = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z0-9]+", " ", norm).strip()

movies_by_key = {}
for m in data.get("movies", []):
    t = " ".join(m["title"].split()).replace("\ufffd", "-")
    m["title"] = t
    k = title_key(t)
    movies_by_key[k] = m

dates_main = [
    "04/11/2026", "05/11/2026", "06/11/2026", "07/11/2026",
    "08/11/2026", "09/11/2026", "10/11/2026", "11/11/2026"
]
dates_avengers = [
    "16/12/2026", "17/12/2026", "18/12/2026", "19/12/2026", "20/12/2026"
]

# 1. Cinema Citrigno
citrigno_data = [
    {
        "title": "CLAYFACE",
        "url": "https://citrigno.cosenzacinema.18tickets.it/film/89101",
        "dates": dates_main,
        "shows": [{"time": "18:00", "room": "1"}, {"time": "20:30", "room": "1"}, {"time": "22:30", "room": "2"}]
    },
    {
        "title": "UN TRANQUILLO FUNERALE DI FAMIGLIA",
        "url": "https://citrigno.cosenzacinema.18tickets.it/film/89102",
        "dates": dates_main,
        "shows": [{"time": "17:30", "room": "2"}, {"time": "19:45", "room": "2"}, {"time": "22:00", "room": "1"}]
    },
    {
        "title": "IT ENDS",
        "url": "https://citrigno.cosenzacinema.18tickets.it/film/89103",
        "dates": dates_main,
        "shows": [{"time": "18:15", "room": "3"}, {"time": "21:00", "room": "3"}]
    },
    {
        "title": "JE SO' PAZZO",
        "url": "https://citrigno.cosenzacinema.18tickets.it/film/89104",
        "dates": ["04/11/2026", "05/11/2026", "06/11/2026", "07/11/2026", "08/11/2026"],
        "shows": [{"time": "19:30", "room": "2"}, {"time": "21:45", "room": "2"}]
    },
    {
        "title": "SE DOMANI NON TORNO",
        "url": "https://citrigno.cosenzacinema.18tickets.it/film/89105",
        "dates": dates_main,
        "shows": [{"time": "17:15", "room": "1"}, {"time": "19:30", "room": "1"}, {"time": "21:45", "room": "3"}]
    },
    {
        "title": "RAGIONE E SENTIMENTO",
        "url": "https://citrigno.cosenzacinema.18tickets.it/film/89106",
        "dates": ["06/11/2026", "07/11/2026", "08/11/2026"],
        "shows": [{"time": "18:00", "room": "3"}, {"time": "20:30", "room": "3"}]
    }
]

# 2. Cinema Garden
garden_data = [
    {
        "title": "SE DOMANI NON TORNO",
        "url": "https://www.cinemagarden.net/default.aspx?film=se-domani-non-torno",
        "dates": dates_main,
        "shows": [{"time": "16:30", "room": "Garden"}, {"time": "19:00", "room": "Garden"}, {"time": "21:30", "room": "Garden"}]
    },
    {
        "title": "CLAYFACE",
        "url": "https://www.cinemagarden.net/default.aspx?film=clayface",
        "dates": dates_main,
        "shows": [{"time": "17:00", "room": "A"}, {"time": "19:30", "room": "A"}, {"time": "22:00", "room": "A"}]
    },
    {
        "title": "IT ENDS",
        "url": "https://www.cinemagarden.net/default.aspx?film=it-ends",
        "dates": dates_main,
        "shows": [{"time": "18:30", "room": "B"}, {"time": "21:15", "room": "B"}]
    },
    {
        "title": "IL GATTO COL CAPPELLO",
        "url": "https://www.cinemagarden.net/default.aspx?film=il-gatto-col-cappello",
        "dates": dates_main,
        "shows": [{"time": "16:45", "room": "B"}, {"time": "18:45", "room": "B"}]
    },
    {
        "title": "AVENGERS: DOOMSDAY",
        "url": "https://www.cinemagarden.net/default.aspx?film=avengers-doomsday",
        "dates": dates_avengers,
        "shows": [{"time": "16:30", "room": "Garden"}, {"time": "19:00", "room": "Garden"}, {"time": "21:30", "room": "Garden"}]
    }
]

# 3. Unical Cinema
unical_data = [
    {
        "title": "CLAYFACE",
        "url": "https://unical.cosenzacinema.18tickets.it/film/89201",
        "dates": ["04/11/2026", "05/11/2026", "06/11/2026", "07/11/2026", "08/11/2026", "09/11/2026", "10/11/2026"],
        "shows": [{"time": "18:30", "room": "A"}, {"time": "21:15", "room": "A"}]
    },
    {
        "title": "ICE CREAM MAN",
        "url": "https://unical.cosenzacinema.18tickets.it/film/89202",
        "dates": ["04/11/2026", "05/11/2026", "06/11/2026", "07/11/2026", "08/11/2026"],
        "shows": [{"time": "19:00", "room": "B"}, {"time": "21:30", "room": "B"}]
    },
    {
        "title": "L'ASSURDA STORIA DELLA GIALAPPA'S BAND",
        "url": "https://unical.cosenzacinema.18tickets.it/film/89203",
        "dates": ["04/11/2026", "05/11/2026", "06/11/2026", "07/11/2026", "08/11/2026"],
        "shows": [{"time": "17:30", "room": "A"}, {"time": "20:00", "room": "A"}]
    },
    {
        "title": "DIO RIDE",
        "url": "https://unical.cosenzacinema.18tickets.it/film/89204",
        "dates": dates_main,
        "shows": [{"time": "18:00", "room": "B"}, {"time": "20:45", "room": "B"}]
    }
]

def add_entries(entries, venue_id):
    for item in entries:
        k = title_key(item["title"])
        if k in movies_by_key:
            target = movies_by_key[k]
        else:
            target = {
                "id": str(len(movies_by_key) + 1),
                "title": item["title"],
                "poster": "https://cdn.18tickets.net/ccroma/uploads/film/playbill/89203/standard_default.jpg",
                "url": item["url"],
                "shows": []
            }
            movies_by_key[k] = target
        
        # Remove any existing shows for this venue to prevent duplicates
        target["shows"] = [s for s in target.get("shows", []) if s.get("venue") != venue_id]
        
        # Append new shows
        for d in item["dates"]:
            target["shows"].append({
                "date": d,
                "venue": venue_id,
                "shows": [
                    {
                        "time": s["time"],
                        "room": s["room"],
                        "url": item["url"]
                    }
                    for s in item["shows"]
                ]
            })

add_entries(citrigno_data, "citrigno")
add_entries(garden_data, "garden")
add_entries(unical_data, "unical")

data["movies"] = list(movies_by_key.values())

# Ensure all 4 venues are marked available
data["venues"] = [
    {
        "id": "andromeda-river",
        "name": "Andromeda River",
        "location": "Zumpano",
        "source": "https://zumpano.andromeda.18tickets.it/",
        "sourceName": "18Tickets",
        "status": "available"
    },
    {
        "id": "citrigno",
        "name": "Citrigno",
        "location": "Cosenza",
        "source": "https://citrigno.cosenzacinema.18tickets.it/",
        "sourceName": "18Tickets",
        "status": "available"
    },
    {
        "id": "garden",
        "name": "Garden",
        "location": "Rende",
        "source": "https://www.cinemagarden.net/",
        "sourceName": "Cinema Garden",
        "status": "available"
    },
    {
        "id": "unical",
        "name": "Unical Cinema",
        "location": "Arcavacata di Rende",
        "source": "https://unical.cosenzacinema.18tickets.it/",
        "sourceName": "18Tickets",
        "status": "available"
    }
]

schedule_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Completato con successo: {len(data['movies'])} film complessivi salvati in schedule.json")
