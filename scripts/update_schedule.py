from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
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
        "id": "cinema-teatro-italia",
        "name": "Cinema Teatro Italia A. Tieri",
        "location": "Cosenza",
        "url": "https://cinemateatroitalia.cosenzacinema.18tickets.it/",
        "kind": "18tickets",
        "source_name": "18Tickets",
    },
    {
        "id": "unical",
        "name": "Unical Cinema",
        "location": "Arcavacata di Rende",
        "url": "https://unical.cosenzacinema.18tickets.it/",
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
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36 (FuoriProgramma/1.0)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
}


def fetch(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=25) as response:
        payload = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    html = payload.decode(charset, errors="replace")
    if "\ufffd" in html:
        html = payload.decode("cp1252", errors="replace")
    return html


class SynopsisParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_plot = False
        self.plot_depth = 0
        self.seen_plot = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "div" and attributes.get("id") == "plotPanel" and not self.seen_plot:
            self.in_plot = True
            self.plot_depth = 1
        elif self.in_plot and tag == "div":
            self.plot_depth += 1
        elif self.in_plot and tag == "br":
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self.in_plot and tag == "div":
            self.plot_depth -= 1
            if self.plot_depth == 0:
                self.in_plot = False
                self.seen_plot = True

    def handle_data(self, data: str) -> None:
        if self.in_plot:
            self.parts.append(data)


class MovieMetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_option = False
        self.in_label = False
        self.label_parts: list[str] = []
        self.value_parts: list[str] = []
        self.metadata: dict[str, str | list[str]] = {
            "genres": [],
            "director": "",
            "year": "",
        }

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "p" and "movie__option" in (attributes.get("class") or "").split():
            self.in_option = True
            self.label_parts = []
            self.value_parts = []
        elif self.in_option and tag == "strong":
            self.in_label = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "strong":
            self.in_label = False
        elif tag == "p" and self.in_option:
            label = " ".join("".join(self.label_parts).split()).rstrip(":").casefold()
            value = " ".join("".join(self.value_parts).split())
            if label in {"genre", "genres", "genere", "generi"}:
                self.metadata["genres"] = [
                    item.strip() for item in re.split(r"[,;]", value) if item.strip()
                ]
            elif label in {"director", "directors", "regia", "regista"}:
                self.metadata["director"] = value
            elif label in {"year", "anno"} and re.fullmatch(r"\d{4}", value):
                self.metadata["year"] = value
            self.in_option = False

    def handle_data(self, data: str) -> None:
        if self.in_option:
            (self.label_parts if self.in_label else self.value_parts).append(data)


def get_movie_details(url: str) -> dict:
    try:
        html = fetch(url)
        parser = SynopsisParser()
        metadata_parser = MovieMetadataParser()
        parser.feed(html)
        metadata_parser.feed(html)
    except Exception as error:
        print(f"Dettagli film non recuperati da {url}: {error}")
        return {"synopsis": "", "genres": [], "director": "", "year": ""}
    return {
        "synopsis": " ".join(" ".join(parser.parts).split()),
        **metadata_parser.metadata,
    }


def clean_title_for_display(raw: str) -> tuple[str, str]:
    """Returns (cleaned_title, duration) without labels or trailing tags."""
    title = re.sub(r"<[^>]+>", "", raw)
    title = (
        title.replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("–", "-")
        .replace("—", "-")
    )
    title = " ".join(title.split()).strip()

    # Extract duration like (1H45') or ( 2H45')
    duration = ""
    dur_m = re.search(r"\(\s*(\d+H\d*['’]?)\s*\)", title, re.I)
    if dur_m:
        duration = dur_m.group(1).replace("'", "m").replace("’", "m").replace("H", "h ")
        title = title[: dur_m.start()] + title[dur_m.end() :]

    # Clean English subtitle in parens (e.g. (THE CAT IN THE HAT))
    title = re.sub(r"\(THE CAT IN THE HAT\)", "", title, flags=re.I)
    # Clean announcement suffixes
    title = re.sub(r"\s*-\s*DAL\b.*$", "", title, flags=re.I)
    title = re.sub(r"\s*[–—-]\s*25th\s+anniversary.*$", "", title, flags=re.I)
    title = " ".join(title.split()).strip()
    return title, duration


def title_key(title: str) -> str:
    """Produces a clean normalized key for deduplicating across multiple venues."""
    t = title
    t = re.sub(r"\(THE CAT IN THE HAT\)", "", t, flags=re.I)
    t = re.sub(r"\(.*?\)", "", t)
    t = re.sub(r"[–—\-]", " ", t)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


class TicketsParser(HTMLParser):
    """Accurately parses 18tickets venues (Andromeda, Citrigno, Unical)."""

    def __init__(self, base_url: str = "") -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.movies: list[dict] = []
        self.current_movie: dict | None = None
        self.in_movie_preview = False
        self.in_heading = False
        self.in_film_label = False
        self.in_schedule = False
        self.capture_showtime_a = False
        self.show_url = ""
        self.show_text_parts: list[str] = []
        self.capture_heading_text: list[str] = []
        self.current_date: str | None = None
        self.current_shows_for_date: list[dict] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        classes = (a.get("class") or "").split()

        if tag == "div" and "movie--preview" in classes:
            self.finish_movie()
            self.in_movie_preview = True
            self.current_movie = {
                "title": "",
                "poster": "",
                "url": self.base_url,
                "duration": "",
                "tags": [],
                "shows": [],
            }

        if not self.in_movie_preview or not self.current_movie:
            return

        # Heading tag containing title
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6") or "page-heading" in classes:
            if not self.current_movie["title"]:
                self.in_heading = True
                self.capture_heading_text = []

        # Tag labels like V.M.18, 14+, 18+, V.O. SOTT.
        if tag == "div" and any(
            c in classes for c in ("film-label", "film-label-slider", "small-label")
        ):
            self.in_film_label = True

        # Poster image
        if tag == "img" and any(
            c in classes for c in ("img-thumbnail", "poster", "img-fluid")
        ):
            src = a.get("src") or a.get("data-src") or ""
            if src and not self.current_movie["poster"]:
                self.current_movie["poster"] = urljoin(self.base_url, src)
            alt = (a.get("alt") or "").strip()
            if alt and not self.current_movie["title"]:
                clean_t, dur = clean_title_for_display(alt)
                self.current_movie["title"] = clean_t
                if dur and not self.current_movie["duration"]:
                    self.current_movie["duration"] = dur

        # Movie detail URL
        if (
            tag == "a"
            and "movie__title" in classes
            and not self.current_movie.get("url_set")
        ):
            href = a.get("href", "")
            if href:
                self.current_movie["url"] = urljoin(self.base_url, href)
                self.current_movie["url_set"] = True

        # Schedule section
        if tag == "div" and "schedule-section-show" in classes:
            self.in_schedule = True

        # Showtime link
        if tag == "a" and a.get("data-time") and self.in_schedule:
            self.capture_showtime_a = True
            href = a.get("href", "")
            self.show_url = (
                urljoin(self.base_url, href) if href else self.current_movie["url"]
            )
            self.show_text_parts = []

    def handle_endtag(self, tag: str) -> None:
        if not self.in_movie_preview or not self.current_movie:
            return

        if self.in_heading and (
            tag in ("h1", "h2", "h3", "h4", "h5", "h6") or tag == "div"
        ):
            raw_title = " ".join("".join(self.capture_heading_text).split())
            if raw_title and not self.current_movie["title"]:
                clean_t, dur = clean_title_for_display(raw_title)
                self.current_movie["title"] = clean_t
                if dur and not self.current_movie["duration"]:
                    self.current_movie["duration"] = dur
            self.in_heading = False

        if tag == "div" and self.in_film_label:
            self.in_film_label = False

        if self.capture_showtime_a and tag == "a":
            show_raw = " ".join("".join(self.show_text_parts).split())
            time_m = re.search(r"\b(\d{1,2}:\d{2})\b", show_raw)
            room_m = re.search(r"Sala\s*(\w+)", show_raw, re.I)
            if time_m and self.current_date:
                self.current_shows_for_date.append(
                    {
                        "time": time_m.group(1),
                        "room": f"Sala {room_m.group(1)}" if room_m else "",
                        "url": self.show_url or self.current_movie["url"],
                    }
                )
            self.capture_showtime_a = False

    def handle_data(self, data: str) -> None:
        if not self.in_movie_preview or not self.current_movie:
            return

        if self.in_heading and not self.in_film_label:
            self.capture_heading_text.append(data)

        if self.in_film_label:
            clean_tag = data.strip()
            if clean_tag and clean_tag not in self.current_movie["tags"]:
                self.current_movie["tags"].append(clean_tag)

        if self.capture_showtime_a:
            self.show_text_parts.append(data)

        if self.in_schedule:
            match = re.search(r"\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b", data)
            if match:
                date_str = f"{match.group(1)}/{match.group(2)}/{match.group(3)}"
                if date_str != self.current_date:
                    self.finish_date()
                    self.current_date = date_str

    def finish_date(self) -> None:
        if self.current_date and self.current_shows_for_date and self.current_movie:
            self.current_movie["shows"].append(
                {
                    "date": self.current_date,
                    "shows": self.current_shows_for_date,
                }
            )
        self.current_shows_for_date = []

    def finish_movie(self) -> None:
        if self.current_movie:
            self.finish_date()
            if self.current_movie["title"] and self.current_movie["shows"]:
                self.movies.append(self.current_movie)
        self.current_movie = None
        self.current_date = None
        self.current_shows_for_date = []
        self.in_movie_preview = False
        self.in_schedule = False


def parse_garden_multi_days(
    base_url: str = "https://www.cinemagarden.net/",
) -> list[dict]:
    """Accurately parses Cinema Garden across available program dates."""
    try:
        home_html = fetch(base_url)
    except Exception as e:
        print(f"[Garden] Errore di rete su home {base_url}: {e}")
        return []

    date_links = re.findall(r'href=["\']\?data=(\d{2}-\d{2}-\d{4})["\']', home_html)
    date_links = list(dict.fromkeys(date_links))[:7]
    if not date_links:
        date_links = [datetime.now().strftime("%d-%m-%Y")]

    movies_map: dict[str, dict] = {}

    for d_str in date_links:
        day_formatted = d_str.replace("-", "/")
        day_url = f"{base_url}?data={d_str}"
        try:
            day_html = fetch(day_url)
        except Exception as e:
            raise RuntimeError(f"[Garden] Errore di rete su {day_url}: {e}") from e

        blocks = re.findall(
            r'<div[^>]*class=["\'][^"\']*inner-film[^"\']*["\'].*?(?=<div[^>]*class=["\'][^"\']*inner-film|\Z)',
            day_html,
            re.S,
        )

        for b in blocks:
            title_m = re.search(
                r'<span[^>]*itemprop=["\']name["\'][^>]*>(.*?)</span>', b, re.S
            )
            if not title_m:
                continue
            raw_title = title_m.group(1).strip()
            clean_t, dur = clean_title_for_display(raw_title)

            poster_m = re.search(
                r'<img[^>]*itemprop=["\']image["\'][^>]*src=["\']([^"\']+)["\']', b
            )
            if not poster_m:
                poster_m = re.search(r'<img[^>]*src=["\']([^"\']+)["\']', b)
            poster_url = poster_m.group(1).strip() if poster_m else ""
            if poster_url and not poster_url.startswith("http"):
                poster_url = urljoin(base_url, poster_url)

            ticket_m = re.search(
                r'href=["\'](https?://[^"\']*anyticket[^"\']*)["\']', b
            )
            ticket_url = ticket_m.group(1).strip() if ticket_m else base_url

            orari_raw = re.findall(
                r'<div class=[\'"]unOrario[\'"]>(.*?)</div>', b, re.S
            )
            shows_list = []
            for o in orari_raw:
                spans = re.findall(r"<span>(.*?)</span>", o)
                sala = ""
                time_str = ""
                for s in spans:
                    s_clean = s.strip()
                    if re.match(r"^\d{1,2}:\d{2}$", s_clean):
                        time_str = s_clean
                    elif len(s_clean) > 0:
                        sala = s_clean
                if time_str:
                    shows_list.append(
                        {
                            "time": time_str,
                            "room": sala,
                            "url": ticket_url,
                        }
                    )

            date_for_shows = day_formatted
            if "DAL 16 DICEMBRE" in raw_title.upper():
                date_for_shows = "16/12/2026"

            k = title_key(clean_t)
            if k not in movies_map:
                movies_map[k] = {
                    "title": clean_t,
                    "poster": poster_url,
                    "url": ticket_url,
                    "duration": dur,
                    "shows": {},
                }

            if date_for_shows not in movies_map[k]["shows"]:
                movies_map[k]["shows"][date_for_shows] = []

            # Deduplicate by time and room
            existing = {
                (s["time"], s["room"]) for s in movies_map[k]["shows"][date_for_shows]
            }
            for s in shows_list:
                sig = (s["time"], s["room"])
                if sig not in existing:
                    existing.add(sig)
                    movies_map[k]["shows"][date_for_shows].append(s)

    output_movies = []
    for m in movies_map.values():
        shows_list = []
        for d, s_entries in sorted(m["shows"].items()):
            if s_entries:
                shows_list.append(
                    {
                        "date": d,
                        "shows": sorted(s_entries, key=lambda x: x["time"]),
                    }
                )
        if shows_list:
            output_movies.append(
                {
                    "title": m["title"],
                    "poster": m["poster"],
                    "url": m["url"],
                    "duration": m["duration"],
                    "shows": shows_list,
                }
            )
    return output_movies


def parse_source(source: dict) -> list[dict]:
    if source["kind"] == "garden":
        movies = parse_garden_multi_days(source["url"])
        if not movies:
            raise RuntimeError(
                f"[{source['name']}] Nessun film o spettacolo valido trovato."
            )
        return movies

    try:
        html = fetch(source["url"])
    except Exception as e:
        raise RuntimeError(
            f"[{source['name']}] Errore di rete su {source['url']}: {e}"
        ) from e

    parser = TicketsParser(base_url=source["url"])
    try:
        parser.feed(html)
        parser.finish_movie()
    except Exception as e:
        raise RuntimeError(f"[{source['name']}] Errore parsing HTML: {e}") from e

    if not parser.movies:
        raise RuntimeError(
            f"[{source['name']}] Nessun film o spettacolo valido trovato."
        )
    return parser.movies


def main() -> None:
    venue_movies = [(source, parse_source(source)) for source in SOURCES]
    schedule_file = ROOT / "data" / "schedule.json"

    combined: dict[str, dict] = {}
    venue_counts: dict[str, int] = {}

    for source, movies in venue_movies:
        venue_counts[source["id"]] = len(movies)
        for movie in movies:
            t_clean, dur = clean_title_for_display(movie["title"])
            key = title_key(t_clean)
            if key not in combined:
                combined[key] = {
                    "id": str(len(combined) + 1),
                    "title": t_clean,
                    "poster": movie.get("poster", ""),
                    "url": movie.get("url", source["url"]),
                    "duration": dur or movie.get("duration", ""),
                    "tags": list(movie.get("tags", [])),
                    "genres": [],
                    "director": "",
                    "year": "",
                    "shows": [],
                }
            target = combined[key]
            if not target.get("poster") and movie.get("poster"):
                target["poster"] = movie["poster"]
            if not target.get("duration") and (dur or movie.get("duration")):
                target["duration"] = dur or movie.get("duration")
            for tag in movie.get("tags", []):
                if tag not in target["tags"]:
                    target["tags"].append(tag)
            for genre in movie.get("genres", []):
                if genre not in target["genres"]:
                    target["genres"].append(genre)
            for field in ("director", "year"):
                if not target[field] and movie.get(field):
                    target[field] = movie[field]
            for show in movie["shows"]:
                target["shows"].append({**show, "venue": source["id"]})

    movies_output = list(combined.values())
    for movie in movies_output:
        movie.update(get_movie_details(movie["url"]))

    venues_output = [
        {
            "id": source["id"],
            "name": source["name"],
            "location": source["location"],
            "source": source["url"],
            "sourceName": source["source_name"],
            "status": "available"
            if venue_counts.get(source["id"], 0) > 0
            else "unavailable",
        }
        for source in SOURCES
    ]

    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "venues": venues_output,
        "movies": movies_output,
    }
    temporary_file = schedule_file.with_suffix(".json.tmp")
    temporary_file.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary_file.replace(schedule_file)
    counts = ", ".join(
        f"{source['name']}: {venue_counts.get(source['id'], 0)} film"
        for source in SOURCES
    )
    print(f"Aggiornata programmazione con successo: {counts}.")


if __name__ == "__main__":
    main()
