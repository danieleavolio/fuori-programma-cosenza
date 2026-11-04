from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RIVER_URL = "https://zumpano.andromeda.18tickets.it/"


class ScheduleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.movies: list[dict] = []
        self.movie: dict | None = None
        self.schedule: dict | None = None
        self.day: dict | None = None
        self.capture_title = False
        self.capture_schedule_text = False
        self.capture_show = False
        self.movie_depth = 0
        self.schedule_depth = 0
        self.day_depth = 0
        self.date_cell_depth = 0
        self.capture_date_cell = False
        self.text_parts: list[str] = []
        self.show_parts: list[str] = []
        self.schedule_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "div" and "movie--preview" in classes:
            self.movie = {"title": "", "poster": "", "url": "", "shows": []}
            self.movie_depth = 1
        elif self.movie and tag == "div":
            self.movie_depth += 1
        elif self.movie and tag == "a" and "movie__title" in classes:
            self.capture_title = True
            self.movie["url"] = a.get("href", "")
        elif self.movie and tag == "img" and "img-thumbnail" in classes:
            self.movie["poster"] = a.get("src", "")
        if self.movie and tag == "div" and "schedule-section-show" in classes:
            self.schedule = {"date": "", "shows": []}
            self.capture_schedule_text = True
            self.schedule_parts = []
            self.schedule_depth = 1
        elif self.schedule and tag == "div":
            self.schedule_depth += 1
        if self.schedule and tag == "div" and "col-sm-4" in classes:
            self.finish_day()
            self.day = {"date": "", "shows": []}
            self.date_cell_depth = 1
            self.capture_date_cell = True
            self.day_parts = []
        elif self.capture_date_cell and tag == "div":
            self.date_cell_depth += 1
        if self.day and tag == "a" and a.get("data-time"):
            self.capture_show = True
            self.show_parts = []
            self.show_parts.append(a["data-time"])

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.capture_title:
            self.capture_title = False
        if tag == "a" and self.capture_show and self.day:
            raw = " ".join(self.show_parts)
            match = re.search(r"(\d{1,2}:\d{2})\s*(?:Sala\s*(\w+))?", raw, re.I)
            if match:
                self.day["shows"].append(
                    {"time": match.group(1), "room": match.group(2) or ""}
                )
            self.capture_show = False
        if tag == "div" and self.capture_date_cell:
            self.date_cell_depth -= 1
            if self.date_cell_depth == 0:
                text = " ".join(" ".join(self.day_parts).split())
                date_match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
                if self.day is not None:
                    self.day["date"] = date_match.group(1) if date_match else ""
                self.capture_date_cell = False
        if tag == "div" and self.schedule and self.capture_schedule_text:
            self.schedule_depth -= 1
        if tag == "div" and self.schedule and self.schedule_depth == 0:
            text = " ".join(" ".join(self.schedule_parts).split())
            date_match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
            self.schedule["date"] = date_match.group(1) if date_match else ""
            if self.movie is not None:
                self.finish_day()
                self.movie["shows"].extend(self.schedule["shows"])
            self.schedule = None
            self.capture_schedule_text = False
        if tag == "div" and self.movie:
            self.movie_depth -= 1
            if self.movie_depth == 0:
                if self.movie["title"] and self.movie["shows"]:
                    self.movies.append(self.movie)
                self.movie = None

    def handle_data(self, data: str) -> None:
        if self.capture_title and self.movie:
            self.movie["title"] += data
        if self.capture_show:
            self.show_parts.append(data)
        if self.capture_date_cell and self.day:
            self.day_parts.append(data)

    def finish_day(self) -> None:
        if self.day and self.day.get("date") and self.day["shows"] and self.schedule:
            self.schedule["shows"].append(self.day)
        self.day = None


def main() -> None:
    request = Request(
        RIVER_URL, headers={"User-Agent": "FuoriProgramma/1.0 (+https://github.com)"}
    )
    with urlopen(request, timeout=30) as response:
        html = response.read().decode("utf-8", errors="replace")

    parser = ScheduleParser()
    parser.feed(html)
    movies = []
    seen = set()
    for movie in parser.movies:
        title = " ".join(movie["title"].split())
        key = (title.casefold(), movie["url"])
        if not title or key in seen:
            continue
        seen.add(key)
        duration = re.search(r"\((\d+H\d+['’]?)\)", title)
        if duration:
            movie["duration"] = duration.group(1).replace("'", "’")
            movie["title"] = title[: duration.start()].strip()
        movie["id"] = str(len(movies) + 1)
        movie["venue"] = "andromeda-river"
        movie["shows"] = [s for s in movie["shows"] if s["date"]]
        movies.append(movie)

    if not movies:
        raise RuntimeError(
            "La pagina del cinema è stata raggiunta ma non sono stati trovati film: dati non aggiornati."
        )

    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": RIVER_URL,
        "venues": [
            {
                "id": "andromeda-river",
                "name": "Andromeda River",
                "location": "Zumpano",
                "source": RIVER_URL,
                "status": "available",
            },
            {
                "id": "citrigno",
                "name": "Citrigno",
                "location": "Cosenza",
                "source": None,
                "status": "unavailable",
            },
            {
                "id": "garden",
                "name": "Garden",
                "location": "Rende",
                "source": None,
                "status": "unavailable",
            },
            {
                "id": "unical",
                "name": "Unical Cinema",
                "location": "Arcavacata di Rende",
                "source": None,
                "status": "unavailable",
            },
        ],
        "movies": movies,
    }
    (ROOT / "data" / "schedule.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Aggiornati {len(movies)} film da Andromeda River.")


if __name__ == "__main__":
    main()
