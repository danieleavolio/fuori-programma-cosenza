"""Feed iCalendar statici: una sottoscrizione per ogni selezione di cinema."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import urlopen

from movie_metadata import read_json, write_json
from update_schedule import rome_now

ROOT = Path(__file__).resolve().parents[1]
VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Rome",
    "X-LIC-LOCATION:Europe/Rome",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
]


def escape(value) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace("\r", "")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def fold(line: str) -> str:
    parts, current, size = [], "", 0
    for char in line:
        length = len(char.encode("utf-8"))
        if size + length > 75:
            parts.append(current)
            current, size = " ", 1
        current += char
        size += length
    return "\r\n".join([*parts, current])


def duration(raw: str) -> int:
    hours = re.search(r"(\d+)\s*h", raw or "", re.I)
    minutes = re.search(r"(\d+)\s*(?:m|['’])", raw or "", re.I)
    return int(hours[1] if hours else 0) * 60 + int(minutes[1] if minutes else 0)


def stamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def safe_url(url: str) -> str:
    return (
        url if isinstance(url, str) and re.match(r"^https?://[^\s\r\n]+$", url) else ""
    )


def event_records(data: dict, info: dict) -> dict:
    venues = {v["id"]: v for v in data.get("venues", [])}
    records = {}
    for movie in data.get("movies", []):
        for group in movie.get("shows", []):
            venue = venues.get(group.get("venue"))
            if not venue:
                continue
            address = info.get(venue["id"], {})
            location = ", ".join(
                filter(
                    None,
                    [
                        address.get("address"),
                        address.get("city") or venue.get("location"),
                    ],
                )
            )
            for show in group.get("shows", []):
                try:
                    start = datetime.strptime(
                        f"{group['date']} {show['time']}", "%d/%m/%Y %H:%M"
                    )
                except (ValueError, KeyError):
                    continue
                room = str(show.get("room") or "")
                seed = "|".join(
                    [
                        movie["title"].casefold(),
                        venue["id"],
                        start.isoformat(),
                        room.casefold(),
                    ]
                )
                uid = (
                    hashlib.sha256(seed.encode()).hexdigest()[:32]
                    + "@fuori-programma-cosenza"
                )
                records[uid] = {
                    "title": movie["title"],
                    "venueId": venue["id"],
                    "venue": venue["name"],
                    "start": start.isoformat(),
                    "room": room,
                    "location": location,
                    "minutes": duration(movie.get("duration", "")),
                    "url": safe_url(
                        show.get("url")
                        or movie.get("venueUrls", {}).get(venue["id"])
                        or movie.get("url", "")
                    ),
                    "status": "CONFIRMED",
                }
    return records


def reconcile(records: dict, previous: dict, now: datetime) -> dict:
    cutoff = (now.replace(tzinfo=None) - timedelta(days=30)).isoformat()
    current = now.replace(tzinfo=None).isoformat()
    result = {}
    timestamp = stamp(now)
    for uid, record in records.items():
        if record["start"] < cutoff:
            continue
        old = previous.get(uid, {})
        unchanged = all(old.get(k) == v for k, v in record.items())
        result[uid] = {
            **record,
            "sequence": old.get("sequence", 0) + (0 if unchanged or not old else 1),
            "modified": old.get("modified", timestamp) if unchanged else timestamp,
        }
    for uid, old in previous.items():
        if uid in result or old.get("start", "") < cutoff:
            continue
        retained = dict(old)
        # Gli eventi passati restano nello storico; solo quelli futuri spariti
        # dalla programmazione vengono cancellati esplicitamente.
        if retained["start"] >= current and retained.get("status") != "CANCELLED":
            retained.update(
                status="CANCELLED",
                modified=timestamp,
                sequence=retained.get("sequence", 0) + 1,
            )
        result[uid] = retained
    return result


def calendar_document(records: dict, venues: list[dict]) -> str:
    selected = {v["id"] for v in venues}
    name = "Fuori programma — " + (
        "Tutti i cinema" if len(venues) == 5 else ", ".join(v["name"] for v in venues)
    )
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Fuori Programma Cosenza//Cinema//IT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape(name)}",
        "X-WR-TIMEZONE:Europe/Rome",
        "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
        "X-PUBLISHED-TTL:PT4H",
        *VTIMEZONE,
    ]
    for uid, event in sorted(
        records.items(), key=lambda item: (item[1]["start"], item[0])
    ):
        if event["venueId"] not in selected:
            continue
        start = datetime.fromisoformat(event["start"])
        room = event["room"]
        room = (
            room if room.lower().startswith("sala") else f"Sala {room}" if room else ""
        )
        description = "\n".join(
            filter(
                None,
                [
                    f"Film: {event['title']}",
                    f"Cinema: {event['venue']}",
                    room,
                    f"Durata: {event['minutes']} minuti; fine indicativa, esclusi pubblicità e intervallo."
                    if event["minutes"]
                    else "Durata non disponibile.",
                    f"Biglietti: {event['url']}" if event["url"] else "",
                    "Gli orari possono cambiare: verifica sempre la biglietteria del cinema.",
                ],
            )
        )
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{event['modified']}",
                f"LAST-MODIFIED:{event['modified']}",
                f"SEQUENCE:{event['sequence']}",
                f"DTSTART;TZID=Europe/Rome:{start.strftime('%Y%m%dT%H%M%S')}",
            ]
        )
        if event["minutes"]:
            # Minuti effettivi, anche attraverso il cambio dell'ora legale.
            lines.append(f"DURATION:PT{event['minutes']}M")
        lines.extend(
            [
                f"SUMMARY:{escape(event['title'] + ' — ' + event['venue'])}",
                f"LOCATION:{escape(', '.join(filter(None, [event['venue'], room, event['location']])))}",
                f"DESCRIPTION:{escape(description)}",
                *([f"URL:{event['url']}"] if event["url"] else []),
                "CATEGORIES:Cinema",
                "TRANSP:TRANSPARENT",
                f"STATUS:{event['status']}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(map(fold, lines)) + "\r\n"


def build(data: dict, info: dict, *, output: Path, state_file: Path, now=None) -> dict:
    now = now or rome_now()
    state = reconcile(event_records(data, info), read_json(state_file, {}), now)
    venues = sorted(data["venues"], key=lambda v: v["id"])
    if (
        not venues
        or len(venues) > 8
        or any(not re.fullmatch(r"[a-z0-9-]+", v["id"]) for v in venues)
    ):
        raise ValueError("Elenco cinema non valido per i feed")
    output.mkdir(parents=True, exist_ok=True)
    feeds = []
    for size in range(1, len(venues) + 1):
        for combo in itertools.combinations(venues, size):
            ids = [v["id"] for v in combo]
            filename = "all.ics" if size == len(venues) else "_".join(ids) + ".ics"
            (output / filename).write_bytes(
                calendar_document(state, list(combo)).encode("utf-8")
            )
            feeds.append({"venues": ids, "file": filename})
    write_json(output / "index.json", {"feeds": feeds})
    write_json(state_file, state)
    return {"feeds": len(feeds), "events": len(state)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--published", action="store_true")
    args = parser.parse_args()
    if args.published:
        # Il bot potrebbe non avere potuto fare push: il deploy precedente resta
        # la fonte più recente per UID, modifiche e cancellazioni già pubblicate.
        try:
            with urlopen(
                "https://danieleavolio.github.io/fuori-programma-cosenza/data/calendar-state.json",
                timeout=12,
            ) as response:
                published = json.loads(response.read(5_000_000))
            state_file = ROOT / "data/calendar-state.json"
            local = read_json(state_file, {})
            for uid, event in published.items():
                if isinstance(event, dict) and event.get("modified", "") > local.get(
                    uid, {}
                ).get("modified", ""):
                    local[uid] = event
            write_json(state_file, local)
        except Exception as error:
            print(f"Storico calendario pubblicato non recuperato: {error}")
    result = build(
        read_json(ROOT / "data/schedule.json", {}),
        read_json(ROOT / "data/venues-info.json", {}),
        output=ROOT / "calendars",
        state_file=ROOT / "data/calendar-state.json",
    )
    print(json.dumps(result))
