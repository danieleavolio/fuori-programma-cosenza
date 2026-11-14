"""Metadati pubblici MYmovies, isolati dalle fonti degli orari. Solo stdlib."""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.mymovies.it"


def key(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).casefold()
    return re.sub(
        r"[^a-z0-9]", "", "".join(c for c in value if not unicodedata.combining(c))
    )


def identity(movie: dict) -> str:
    return f"{key(movie.get('title', ''))}:{movie.get('year') or ''}"


def movie_title(value: str) -> str:
    return re.sub(
        r"\s*\((?:ried|riedizione|restaurato)\.?\)\s*$", "", value, flags=re.I
    ).strip()


def same_person(target: str, source: str) -> bool:
    if key(target) == key(source):
        return True
    abbreviated = re.fullmatch(r"\s*([A-Za-z])\.\s+(.+?)\s*", target)
    parts = source.split(maxsplit=1)
    return bool(
        abbreviated
        and len(parts) == 2
        and key(abbreviated[1]) == key(parts[0][:1])
        and key(abbreviated[2]) == key(parts[1])
    )


def read_json(path: Path, default: dict) -> dict:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        return result if isinstance(result, dict) else default
    except (OSError, ValueError):
        return default


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def film_url(url: str) -> str:
    parsed = urlparse(urljoin(BASE, unescape(url)))
    if parsed.hostname != "www.mymovies.it" or not re.fullmatch(
        r"/film/\d{4}/[^/]+/", parsed.path
    ):
        return ""
    return BASE + parsed.path


def number(value, maximum: float) -> float | None:
    try:
        value = float(str(value).replace(",", "."))
        return value if math.isfinite(value) and 0 < value <= maximum else None
    except (TypeError, ValueError):
        return None


def text(html: str) -> str:
    return " ".join(unescape(re.sub(r"<[^>]*>", " ", html)).split())


class MovieLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a":
            self.current = [film_url(attrs.get("href", "")), attrs.get("title", "")]
        elif tag == "img" and self.current:
            self.current[1] += " " + attrs.get("alt", "")

    def handle_data(self, data):
        if self.current:
            self.current[1] += " " + data

    def handle_endtag(self, tag):
        if tag == "a" and self.current:
            if self.current[0]:
                self.links.append(tuple(self.current))
            self.current = None


def candidates(html: str, movie: dict) -> list[str]:
    parser = MovieLinks()
    parser.feed(html)
    title = key(movie_title(movie["title"]))
    result = []
    for url, label in parser.links:
        # La ricerca contiene anche consigli e pubblicità: non sono risultati.
        slug = key(url.split("/")[-2])
        if key(label) != title and slug != title:
            continue
        if movie.get("year") and f"/{movie['year']}/" not in url:
            continue
        if url not in result:
            result.append(url)
    return result[:3]


def json_movies(value):
    if isinstance(value, list):
        for item in value:
            yield from json_movies(item)
    elif isinstance(value, dict):
        types = value.get("@type", [])
        if types == "Movie" or (isinstance(types, list) and "Movie" in types):
            yield value
        if "@graph" in value:
            yield from json_movies(value["@graph"])


def parse_metadata(html: str, url: str, movie: dict) -> dict | None:
    url = film_url(url)
    if not url:
        return None
    for raw in re.findall(
        r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        try:
            records = list(json_movies(json.loads(raw)))
        except ValueError:
            continue
        for record in records:
            if key(movie_title(record.get("name", ""))) != key(
                movie_title(movie["title"])
            ):
                continue
            source_year = str(record.get("dateCreated", ""))[:4]
            if movie.get("year") and str(movie["year"]) != source_year:
                continue
            directors = record.get("director") or []
            if isinstance(directors, dict):
                directors = [directors]
            source_directors = [
                item.get("name", "") for item in directors if isinstance(item, dict)
            ]
            target_directors = [
                item.strip()
                for item in re.split(r"[,;]", movie.get("director", ""))
                if key(item)
            ]
            if target_directors and not any(
                same_person(a, b) for a in target_directors for b in source_directors
            ):
                continue
            if not movie.get("year") and not target_directors:
                continue
            result = {"source": "MYmovies", "url": url}
            rating = record.get("aggregateRating") or {}
            scale = number(rating.get("bestRating", 5), 100)
            score = number(rating.get("ratingValue"), scale or 5)
            if score and scale == 5:
                result["rating"] = score
                for source, field in [
                    ("ratingCount", "ratingCount"),
                    ("reviewCount", "reviewCount"),
                ]:
                    count = number(rating.get(source), 1_000_000_000)
                    if count is not None and count.is_integer():
                        result[field] = int(count)
            for label, field in [
                ("CRITICA", "criticsRating"),
                ("PUBBLICO", "audienceRating"),
            ]:
                match = re.search(rf">\s*{label}\s+(\d[.,]\d+)\s*<", html)
                score = number(match.group(1), 5) if match else None
                if score:
                    result[field] = score
            # Solo la sezione "Uscita cinema", mai upload del trailer o uscita DVD.
            release = re.search(
                r"Uscita(?:\s+cinema|</td>\s*<td>)(.{0,900}?)</(?:div|td)>",
                html,
                re.I | re.S,
            )
            if release:
                part = unescape(release.group(1))
                match = re.search(r"[?&]data=(\d{2}/\d{2}/\d{4})", part)
                if match:
                    try:
                        result["releaseDateIT"] = (
                            datetime.strptime(match.group(1), "%d/%m/%Y")
                            .date()
                            .isoformat()
                        )
                    except ValueError:
                        pass
            return result
    return None


class Fetcher:
    def __init__(self, budget=42):
        self.remaining = budget
        self.last = 0.0

    def __call__(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "www.mymovies.it":
            raise ValueError("Fonte metadati non consentita")
        if self.remaining <= 0:
            raise RuntimeError("Budget richieste metadati esaurito")
        self.remaining -= 1
        time.sleep(max(0, 0.8 - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        request = Request(
            url,
            headers={
                "User-Agent": "FuoriProgrammaCosenza/1.0 (cinema listings)",
                "Accept-Language": "it",
            },
        )
        with urlopen(request, timeout=15) as response:
            if urlparse(response.url).hostname != "www.mymovies.it":
                raise ValueError("Redirect metadati non consentito")
            return response.read(3_000_000).decode("utf-8", errors="replace")


def backfill_history(root: Path, history: dict) -> None:
    commits = subprocess.check_output(
        ["git", "log", "--reverse", "--format=%H", "--", "data/schedule.json"],
        cwd=root,
        text=True,
    ).splitlines()
    for commit in commits:
        try:
            data = json.loads(
                subprocess.check_output(
                    ["git", "show", f"{commit}:data/schedule.json"], cwd=root
                )
            )
            stamp = data["updatedAt"]
            datetime.fromisoformat(stamp)
        except (ValueError, KeyError, subprocess.CalledProcessError):
            continue
        for movie in data.get("movies", []):
            token = key(movie.get("title", ""))
            if token and stamp < history.get(token, "9999"):
                history[token] = stamp


def enrich_schedule(
    data: dict,
    previous: dict | None = None,
    *,
    directory: Path | None = None,
    fetcher=None,
    now: datetime | None = None,
    force=False,
) -> dict:
    directory = directory or ROOT / "data"
    cache_file = directory / "movie-metadata.json"
    history_file = directory / "movie-history.json"
    cache = read_json(cache_file, {})
    history = read_json(history_file, {})
    now = now or datetime.now(timezone.utc)
    stamp = now.isoformat()
    fetcher = fetcher or Fetcher()
    previous_movies = {
        key(m.get("title", "")): m for m in (previous or {}).get("movies", [])
    }
    for movie in data.get("movies", []):
        token = key(movie["title"])
        old = previous_movies.get(token, {})
        first_seen = (
            history.get(token)
            or old.get("firstSeenAt")
            or ((previous or {}).get("updatedAt") if old else None)
            or data.get("updatedAt")
            or stamp
        )
        history[token] = first_seen
        movie["firstSeenAt"] = first_seen
        entry = cache.get(identity(movie), {})
        metadata = (
            entry.get("data") or old.get("external") or movie.get("external") or {}
        )
        try:
            retry_at = datetime.fromisoformat(entry["retryAt"])
        except (KeyError, ValueError):
            retry_at = now - timedelta(days=1)
        if force or retry_at <= now:
            try:
                known_url = film_url(metadata.get("url", ""))
                urls = (
                    [known_url]
                    if known_url
                    else candidates(
                        fetcher(
                            BASE
                            + "/ricerca/avanzata/?"
                            + urlencode({"titolo": movie_title(movie["title"])})
                        ),
                        movie,
                    )
                )
                found = None
                for url in urls:
                    found = parse_metadata(fetcher(url), url, movie)
                    if found:
                        break
                if found:
                    metadata = {**found, "checkedAt": stamp}
                entry = {
                    "data": metadata,
                    "retryAt": (now + timedelta(days=1)).isoformat(),
                }
            except Exception as error:
                print(f"  Metadati non aggiornati per {movie['title']}: {error}")
                entry = {
                    "data": metadata,
                    "retryAt": (now + timedelta(hours=6)).isoformat(),
                }
        cache[identity(movie)] = entry
        if metadata:
            movie["external"] = metadata
            if metadata.get("releaseDateIT"):
                movie["releaseDateIT"] = metadata["releaseDateIT"]
        print(
            f"  {movie['title']}: "
            + (
                f"MYmovies {metadata['rating']}/5"
                if metadata.get("rating")
                else "voto non disponibile"
            )
        )
    write_json(cache_file, cache)
    write_json(history_file, history)
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backfill", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--refresh-missing", action="store_true")
    args = parser.parse_args()
    if args.refresh_missing:
        cache = read_json(ROOT / "data/movie-metadata.json", {})
        for entry in cache.values():
            if not entry.get("data"):
                entry.pop("retryAt", None)
        write_json(ROOT / "data/movie-metadata.json", cache)
    if args.backfill:
        history = read_json(ROOT / "data/movie-history.json", {})
        backfill_history(ROOT, history)
        write_json(ROOT / "data/movie-history.json", history)
    schedule = read_json(ROOT / "data/schedule.json", {})
    if not schedule.get("movies"):
        raise SystemExit("Programmazione mancante")
    enrich_schedule(schedule, force=args.force)
    write_json(ROOT / "data/schedule.json", schedule)
