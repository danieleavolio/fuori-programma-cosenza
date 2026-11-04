from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]

SOURCES = [
    {
        "id": "andromeda-river",
        "name": "Andromeda River",
        "location": "Zumpano",
        "url": "https://zumpano.andromeda.18tickets.it/",
        "kind": "18tickets",
        "source_name": "18Tickets",
    },
    {
        "id": "citrigno",
        "name": "Citrigno",
        "location": "Cosenza",
        "url": "https://citrigno.cosenzacinema.18tickets.it/",
        "kind": "18tickets",
        "source_name": "18Tickets",
    },
    {
        "id": "garden",
        "name": "Garden",
        "location": "Rende",
        "url": "https://www.cinemagarden.net/",
        "kind": "garden",
        "source_name": "Cinema Garden",
    },
    {
        "id": "unical",
        "name": "Unical Cinema",
        "location": "Arcavacata di Rende",
        "url": "https://unical.cosenzacinema.18tickets.it/",
        "kind": "18tickets",
        "source_name": "18Tickets",
    },
]


class TicketsParser(HTMLParser):
    def __init__(self, base_url: str = "") -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.movies: list[dict] = []
        self.movie: dict | None = None
        self.schedule: dict | None = None
        self.day: dict | None = None
        self.movie_depth = 0
        self.schedule_depth = 0
        self.date_cell_depth = 0
        self.capture_title = False
        self.capture_date_cell = False
        self.capture_show = False
        self.title_parts: list[str] = []
        self.date_parts: list[str] = []
        self.show_parts: list[str] = []
        self.show_url = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        classes = (a.get("class") or "").split()

        if tag == "div" and "movie--preview" in classes:
            self.movie = {"title": "", "poster": "", "url": self.base_url, "shows": []}
            self.movie_depth = 1
        elif self.movie and tag == "div":
            self.movie_depth += 1

        if self.movie and tag == "a" and "movie__title" in classes:
            self.capture_title = True
            self.title_parts = []
            href = a.get("href", "")
            if href:
                self.movie["url"] = urljoin(self.base_url, href)

        if self.movie and tag == "img" and any(c in classes for c in ("img-thumbnail", "poster")):
            src = a.get("src") or a.get("data-src") or ""
            if src and not self.movie.get("poster"):
                self.movie["poster"] = urljoin(self.base_url, src)

        if self.movie and tag == "div" and "schedule-section-show" in classes:
            self.schedule = {"shows": []}
            self.schedule_depth = 1
        elif self.schedule and tag == "div":
            self.schedule_depth += 1

        if self.schedule and tag == "div" and any(c in classes for c in ("col-sm-4", "schedule-day", "col-xs-12")):
            self.finish_day()
            self.day = {"date": "", "shows": []}
            self.date_cell_depth = 1
            self.capture_date_cell = True
            self.date_parts = []
        elif self.capture_date_cell and tag == "div":
            self.date_cell_depth += 1

        if self.day and tag == "a" and (a.get("data-time") or "showtime" in classes):
            self.capture_show = True
            self.show_parts = [a.get("data-time") or ""]
            href = a.get("href", "")
            self.show_url = urljoin(self.base_url, href) if href else ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.capture_title:
            if self.movie:
                title = " ".join(" ".join(self.title_parts).split())
                if title:
                    self.movie["title"] = title
            self.capture_title = False

        if tag == "a" and self.capture_show and self.day:
            raw = " ".join(self.show_parts).strip()
            time_match = re.search(r"\b(\d{1,2}:\d{2})\b", raw)
            room_match = re.search(r"Sala\s*(\w+)", raw, re.I)
            if time_match:
                self.day["shows"].append(
                    {
                        "time": time_match.group(1),
                        "room": room_match.group(1) if room_match else "",
                        "url": self.show_url or (self.movie["url"] if self.movie else ""),
                    }
                )
            self.capture_show = False

        if tag == "div" and self.capture_date_cell:
            self.date_cell_depth -= 1
            if self.date_cell_depth == 0:
                match = re.search(r"\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b", " ".join(self.date_parts))
                if self.day and match:
                    self.day["date"] = f"{match.group(1)}/{match.group(2)}/{match.group(3)}"
                self.capture_date_cell = False

        if tag == "div" and self.schedule:
            self.schedule_depth -= 1
            if self.schedule_depth == 0:
                self.finish_day()
                if self.movie:
                    self.movie["shows"].extend(self.schedule["shows"])
                self.schedule = None

        if tag == "div" and self.movie:
            self.movie_depth -= 1
            if self.movie_depth == 0:
                if self.movie["title"] and self.movie["shows"]:
                    self.movies.append(self.movie)
                self.movie = None

    def handle_data(self, data: str) -> None:
        if self.capture_title:
            self.title_parts.append(data)
        if self.capture_show:
            self.show_parts.append(data)
        if self.capture_date_cell:
            self.date_parts.append(data)

    def finish_day(self) -> None:
        if self.day and self.day.get("date") and self.day["shows"] and self.schedule:
            self.schedule["shows"].append(self.day)
        self.day = None


class GardenParser(HTMLParser):
    def __init__(self, base_url: str = "") -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.movies: list[dict] = []
        self.movie: dict | None = None
        self.movie_depth = 0
        self.capture_title = False
        self.capture_show = False
        self.show_depth = 0
        self.title_parts: list[str] = []
        self.show_parts: list[str] = []
        self.show_url = ""
        self.date = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        classes = (a.get("class") or "").split()

        if tag == "link" and a.get("rel") == "canonical":
            href = a.get("href", "")
            query_date = parse_qs(urlparse(href).query).get("data", [""])[0]
            match = re.search(r"(\d{2})[-/](\d{2})[-/](\d{4})", query_date)
            if match:
                self.date = f"{match.group(1)}/{match.group(2)}/{match.group(3)}"

        if tag == "div" and any(c in classes for c in ("single-film-box", "scheda-film", "box-film")):
            self.movie = {"title": "", "poster": "", "url": self.base_url, "shows": []}
            self.movie_depth = 1
        elif self.movie and tag == "div":
            self.movie_depth += 1

        if self.movie and tag in ("span", "h2", "h3", "h4", "a") and (a.get("itemprop") == "name" or "titolo" in classes):
            self.capture_title = True
            self.title_parts = []
            if tag == "a" and a.get("href"):
                self.movie["url"] = urljoin(self.base_url, a["href"])

        if self.movie and tag == "a" and any(c in classes for c in ("button-acquisto", "btn-acquisto", "acquista")):
            href = a.get("href", "")
            if href:
                self.movie["url"] = urljoin(self.base_url, href)

        if self.movie and tag in ("div", "span", "a") and any(c in classes for c in ("unOrario", "orario", "show-time")):
            self.capture_show = True
            self.show_depth = 1
            self.show_parts = []
            href = a.get("href", "")
            self.show_url = urljoin(self.base_url, href) if href else ""
        elif self.capture_show and tag == "div":
            self.show_depth += 1

        if self.movie and tag == "img" and (a.get("itemprop") == "image" or "locandina" in classes):
            src = a.get("src") or a.get("data-src") or ""
            if src and not self.movie.get("poster"):
                self.movie["poster"] = urljoin(self.base_url, src)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("span", "h2", "h3", "h4", "a") and self.capture_title:
            title = " ".join(" ".join(self.title_parts).split())
            if title and self.movie:
                title = re.sub(r"\s+-\s+DAL\b.*$", "", title, flags=re.I)
                self.movie["title"] = title
            self.capture_title = False

        if self.capture_show and (tag in ("div", "span", "a")):
            self.show_depth -= 1
            if self.show_depth <= 0:
                text = " ".join(" ".join(self.show_parts).split())
                time_m = re.search(r"\b(\d{1,2}:\d{2})\b", text)
                room_m = re.search(r"Sala\s*(\w+)", text, re.I)
                show_date = self.date or datetime.now().strftime("%d/%m/%Y")
                if self.movie and time_m:
                    day_shows = None
                    for day in self.movie["shows"]:
                        if day.get("date") == show_date:
                            day_shows = day
                            break
                    if not day_shows:
                        day_shows = {"date": show_date, "shows": []}
                        self.movie["shows"].append(day_shows)
                    day_shows["shows"].append(
                        {
                            "time": time_m.group(1),
                            "room": room_m.group(1) if room_m else "",
                            "url": self.show_url or self.movie["url"],
                        }
                    )
                self.capture_show = False

        if tag == "div" and self.movie:
            self.movie_depth -= 1
            if self.movie_depth == 0:
                if self.movie["title"] and self.movie["shows"]:
                    self.movies.append(self.movie)
                self.movie = None

    def handle_data(self, data: str) -> None:
        if self.capture_title:
            self.title_parts.append(data)
        if self.capture_show:
            self.show_parts.append(data)


def fetch(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36 (FuoriProgramma/1.0)"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_source(source: dict) -> list[dict]:
    try:
        html = fetch(source["url"])
    except Exception as e:
        print(f"[{source['name']}] Errore di rete su {source['url']}: {e}")
        return []

    parser_cls = {"18tickets": TicketsParser, "garden": GardenParser}.get(source["kind"], TicketsParser)
    parser = parser_cls(base_url=source["url"])
    try:
        parser.feed(html)
    except Exception as e:
        print(f"[{source['name']}] Errore parsing HTML: {e}")
        return []

    if not parser.movies:
        print(f"[{source['name']}] Nessun film in programmazione trovato.")
        return []

    movies = []
    for movie in parser.movies:
        title = " ".join(movie["title"].split())
        duration = re.search(r"\((\d+H\d+['’]?)\)", title)
        if duration:
            movie["duration"] = duration.group(1).replace("'", "’")
            title = title[: duration.start()].strip()
        movie["title"] = title.strip()
        movie["shows"] = [
            show for show in movie["shows"] if show.get("date") and show.get("shows")
        ]
        movie["venue"] = source["id"]
        movie["source"] = source["url"]
        if movie["shows"]:
            movies.append(movie)
    return movies


def title_key(title: str) -> str:
    normalized = (
        unicodedata.normalize("NFKD", title)
        .encode("ascii", "ignore")
        .decode()
        .casefold()
    )
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


def main() -> None:
    venue_movies = [(source, parse_source(source)) for source in SOURCES]
    schedule_file = ROOT / "data" / "schedule.json"
    previous_data = {}
    if schedule_file.exists():
        try:
            previous_data = json.loads(schedule_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    combined: dict[str, dict] = {}
    venue_counts: dict[str, int] = {}

    for source, movies in venue_movies:
        venue_counts[source["id"]] = len(movies)
        for movie in movies:
            key = title_key(movie["title"])
            if key not in combined:
                combined[key] = {
                    "id": str(len(combined) + 1),
                    "title": movie["title"],
                    "poster": movie.get("poster", ""),
                    "url": movie.get("url", source["url"]),
                    "duration": movie.get("duration", ""),
                    "shows": [],
                }
            target = combined[key]
            if not target.get("poster") and movie.get("poster"):
                target["poster"] = movie["poster"]
            if not target.get("duration") and movie.get("duration"):
                target["duration"] = movie["duration"]
            for show in movie["shows"]:
                target["shows"].append({**show, "venue": source["id"]})

    total_found = sum(len(movies) for _, movies in venue_movies)
    if total_found == 0 and previous_data.get("movies"):
        print("Attenzione: nessun film scaricato da nessuna fonte. I dati precedenti vengono mantenuti.")
        movies_output = previous_data["movies"]
    else:
        movies_output = list(combined.values())

    venues_output = [
        {
            "id": source["id"],
            "name": source["name"],
            "location": source["location"],
            "source": source["url"],
            "sourceName": source["source_name"],
            "status": "available" if venue_counts.get(source["id"], 0) > 0 else "unavailable",
        }
        for source in SOURCES
    ]

    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "venues": venues_output,
        "movies": movies_output,
    }
    schedule_file.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    counts = ", ".join(
        f"{source['name']}: {venue_counts.get(source['id'], 0)} film" for source in SOURCES
    )
    print(f"Aggiornata programmazione: {counts}.")


if __name__ == "__main__":
    main()
