from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SCHEDULE_FILE = ROOT / "data" / "schedule.json"

# L'ultima programmazione pubblicata: e' la base per ripristinare i giorni
# mancanti, perche' il repository non riceve i commit automatici (le regole
# del repository richiedono una pull request per scrivere su main).
PUBLISHED_SCHEDULE_URL = (
    "https://danieleavolio.github.io/fuori-programma-cosenza/data/schedule.json"
)

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

ANNOUNCED_SCHEDULES = {
    "cinema-teatro-italia": "https://cosenzacinema.it/programmazione-cinema-italia-tieri/",
    "unical": "https://cosenzacinema.it/programmazione-sale-unical/",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36 (FuoriProgramma/1.0)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "close",
}

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
FETCH_ATTEMPTS = 4
DETAIL_DELAY = 1.5
WAF_MARKERS = (
    "awsWafCookieDomainList",
    "gokuProps",
    "aws-waf-token",
    "cf-chl",
    "challenge-platform",
    "cf-2fa-verify",
    "Just a moment",
)
BROWSER_SCRIPT = ROOT / "scripts" / "browser_fetch.mjs"
BROWSER_DELAY = 2.0
# Gateway pubblici: quando la fonte diretta e il browser vengono respinti
# (per esempio dai runner GitHub, bloccati dal WAF di AWS).
PROXY_GATEWAYS = [
    ("cors.lol", "https://api.cors.lol/?url={url}"),
    ("corsfix", "https://proxy.corsfix.com/?{url}"),
    ("cors.workers.dev", "https://test.cors.workers.dev/?{url}"),
]
# Fonti che richiedono il browser: i runner GitHub ricevono una challenge
# anti-bot di AWS WAF che solo JavaScript puo' risolvere.
_BROWSER_HOSTS: set[str] = set()
MONTHS_IT = {
    "GENNAIO": 1,
    "FEBBRAIO": 2,
    "MARZO": 3,
    "APRILE": 4,
    "MAGGIO": 5,
    "GIUGNO": 6,
    "LUGLIO": 7,
    "AGOSTO": 8,
    "SETTEMBRE": 9,
    "OTTOBRE": 10,
    "NOVEMBRE": 11,
    "DICEMBRE": 12,
}
PLACEHOLDER_TIMES = {"00:00", "00:01"}


# --- Fuso orario Italia (con fallback se zoneinfo non è disponibile) ---
def _rome_timezone():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("Europe/Rome")
    except Exception:
        return None


def _last_sunday(year: int, month: int) -> datetime:
    day = 31
    while True:
        candidate = datetime(year, month, day)
        if candidate.weekday() == 6:
            return candidate
        day -= 1


def _rome_offset_hours(moment: datetime) -> int:
    start = _last_sunday(moment.year, 3).replace(hour=1, tzinfo=timezone.utc)
    end = _last_sunday(moment.year, 10).replace(hour=1, tzinfo=timezone.utc)
    return 2 if start <= moment < end else 1


def rome_now() -> datetime:
    zone = _rome_timezone()
    if zone is not None:
        return datetime.now(zone)
    now_utc = datetime.now(timezone.utc)
    return now_utc + timedelta(hours=_rome_offset_hours(now_utc))


def today_date() -> date:
    return rome_now().date()


def parse_it_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%d/%m/%Y").date()
    except ValueError:
        return None


def format_it_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


# --- Rete ---
def _retry_delay(
    attempt: int, retry_after: str | None = None, status: int = 0
) -> float:
    if retry_after:
        try:
            return min(60.0, float(retry_after))
        except ValueError:
            pass
    if status == 429:
        return min(60.0, 8.0 * attempt)
    return min(20.0, 2.0 * attempt + 1.0)


def is_waf_challenge(html: str) -> bool:
    """True se la fonte ha risposto con la challenge anti-bot di AWS WAF."""
    head = html.lstrip()[:200].lower()
    if not head.startswith("<"):
        # Risposte non-HTML (per esempio il JSON pubblicato) non sono challenge.
        return False
    return any(marker in html for marker in WAF_MARKERS)


def _host_of(url: str) -> str:
    return urlparse(url).netloc


class BrowserFetcher:
    """Scarica pagine con Chrome headless, risolvendo le challenge anti-bot.

    Un solo processo Chrome viene tenuto aperto e riusato per tutte le richieste.
    """

    def __init__(self) -> None:
        self.process = None
        self.node = shutil.which("node")

    def available(self) -> bool:
        return bool(self.node) and BROWSER_SCRIPT.exists()

    def _ensure(self):
        if self.process and self.process.poll() is None:
            return self.process
        if not self.available():
            raise RuntimeError("node o Chrome non disponibili")
        self.process = subprocess.Popen(
            [self.node, str(BROWSER_SCRIPT)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        return self.process

    def get(self, url: str, attempts: int = 1) -> str:
        process = self._ensure()
        for attempt in range(1, attempts + 1):
            process.stdin.write(url + "\n")
            process.stdin.flush()
            line = process.stdout.readline()
            if not line:
                raise RuntimeError("il browser non ha risposto")
            payload = json.loads(line)
            if payload.get("error"):
                raise RuntimeError(payload["error"])
            html = payload.get("html") or ""
            # Ritmo lento: il WAF penalizza le richieste troppo ravvicinate.
            time.sleep(BROWSER_DELAY)
            if is_waf_challenge(html):
                if attempt < attempts:
                    print("  il browser ha ancora la challenge, riprovo.")
                    time.sleep(4)
                    continue
                raise RuntimeError("il WAF ha respinto anche la richiesta dal browser")
            return html
        raise RuntimeError("il browser non ha restituito la pagina")

    def close(self) -> None:
        if self.process and self.process.poll() is None:
            try:
                self.process.stdin.write("__exit__\n")
                self.process.stdin.flush()
                self.process.wait(timeout=10)
            except Exception:
                self.process.kill()


_BROWSER = None
# Fonti che hanno respinto il browser: non si riprova, si usa l'ultima
# programmazione nota.
_BLOCKED_HOSTS: set[str] = set()


def browser_get(url: str) -> str:
    global _BROWSER
    host = _host_of(url)
    if host in _BLOCKED_HOSTS:
        raise RuntimeError(
            f"{host}: il browser e' stato respinto, nessun nuovo tentativo"
        )
    if _BROWSER is None:
        _BROWSER = BrowserFetcher()
    try:
        return _BROWSER.get(url)
    except RuntimeError as error:
        if "WAF" in str(error) or "challenge" in str(error).lower():
            _BLOCKED_HOSTS.add(host)
        raise


def fetch_via_proxy(url: str, timeout: int = 30):
    """Riprova attraverso un gateway pubblico."""
    gateways = list(PROXY_GATEWAYS)
    extra = os.environ.get("FP_PROXY_GATEWAYS", "").strip()
    if extra:
        # Formato: nome=template separati da virgola.
        configured = []
        for item in extra.split(","):
            if "=" in item:
                name, template = item.split("=", 1)
                configured.append((name.strip(), template.strip()))
        gateways = configured + gateways
    for name, template in gateways:
        try:
            html = fetch(
                template.format(url=url),
                attempts=1,
                timeout=timeout,
                allow_fallback=False,
            )
        except Exception as error:
            print(f"  Gateway {name} non disponibile: {error}")
            continue
        if is_waf_challenge(html):
            print(f"  Gateway {name}: il WAF blocca anche la richiesta mediata")
            continue
        print(f"  Gateway {name}: pagina recuperata ({len(html)} byte)")
        return html
    return None


def fetch(
    url: str,
    attempts: int = FETCH_ATTEMPTS,
    timeout: int = 25,
    headers=None,
    allow_fallback: bool = True,
) -> str:
    """Scarica una pagina: diretto con retry, poi gateway e browser."""
    last_error = None
    request_headers = dict(HEADERS)
    if headers:
        request_headers.update(headers)

    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, headers=request_headers)
            with urlopen(request, timeout=timeout) as response:
                payload = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
            html = payload.decode(charset, errors="replace")
            if "\ufffd" in html:
                html = payload.decode("cp1252", errors="replace")
            if allow_fallback and is_waf_challenge(html):
                print(f"  {url}: risposta anti-bot, provo un gateway.")
                proxied = fetch_via_proxy(url, timeout=timeout)
                if proxied is not None:
                    return proxied
                print(f"  {url}: riprovo con il browser.")
                _BROWSER_HOSTS.add(_host_of(url))
                return browser_get(url)
            return html
        except HTTPError as error:
            last_error = error
            if error.code not in RETRYABLE_STATUS or attempt == attempts:
                raise
            delay = _retry_delay(attempt, error.headers.get("Retry-After"), error.code)
            print(f"  HTTP {error.code} su {url}: riprovo tra {delay:.0f}s")
            time.sleep(delay)
        except (URLError, socket.timeout, TimeoutError, OSError) as error:
            last_error = error
            if attempt == attempts:
                raise
            delay = _retry_delay(attempt)
            print(f"  Errore di rete su {url} ({error}): riprovo tra {delay:.0f}s")
            time.sleep(delay)
    raise last_error if last_error else RuntimeError(f"Impossibile scaricare {url}")


def get_movie_details(url: str) -> dict:
    if not url:
        return {"synopsis": "", "genres": [], "director": "", "year": ""}
    try:
        html = fetch(url)
        parser = SynopsisParser()
        metadata_parser = MovieMetadataParser()
        parser.feed(html)
        metadata_parser.feed(html)
    except Exception as error:
        print(f"  Dettagli film non recuperati da {url}: {error}")
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


def release_date_hint(raw_title: str) -> str | None:
    """Legge annunci tipo 'DAL 16 DICEMBRE' e restituisce la data di uscita."""
    match = re.search(r"DAL\s+(\d{1,2})\s+([A-Z]{3,10})", raw_title.upper())
    if not match:
        return None
    day = int(match.group(1))
    month = MONTHS_IT.get(match.group(2))
    if not month:
        return None
    today = today_date()
    year = today.year
    if date(year, month, day) < today:
        year += 1
    return format_it_date(date(year, month, day))


def parse_announced_dates(url: str, venue_id: str) -> list[dict]:
    """Reads announced dates from Citrigno Group's official movie listing."""
    html = fetch(url)
    cards = re.split(r'(?=<div class="amy-movie-item row")', html)
    announced = []
    for card in cards:
        title_match = re.search(
            r'class="amy-movie-field-title"><a[^>]*>(.*?)</a>', card, re.S
        )
        if not title_match or 'class="timelist"' not in card:
            continue
        title = " ".join(re.sub(r"<[^>]+>", "", title_match.group(1)).split())
        detail_match = re.search(
            r'class="amy-movie-field-title"><a[^>]*href="([^"]+)"', card
        )
        detail_url = detail_match.group(1) if detail_match else url
        dates = re.findall(r'<option value="(\d{4}-\d{2}-\d{2})"', card)
        for date_value in dates:
            year, month, day = date_value.split("-")
            announced.append(
                {
                    "title": title,
                    "date": f"{day}/{month}/{year}",
                    "venue": venue_id,
                    "url": detail_url,
                }
            )
    if not announced:
        raise RuntimeError(f"Nessuna data annunciata valida trovata su {url}")
    return announced


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
        self.in_option = False
        self.in_option_label = False
        self.option_label_parts: list[str] = []
        self.option_value_parts: list[str] = []

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
                "genres": [],
                "director": "",
                "year": "",
                "shows": [],
            }

        if not self.in_movie_preview or not self.current_movie:
            return

        # Scheda tecnica nella pagina del cinema (Regia, Genere, Anno)
        if tag == "p" and "movie__option" in classes:
            self.in_option = True
            self.option_label_parts = []
            self.option_value_parts = []
        elif self.in_option and tag == "strong":
            self.in_option_label = True

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

        if tag == "strong":
            self.in_option_label = False

        if tag == "p" and self.in_option:
            label = (
                " ".join("".join(self.option_label_parts).split())
                .rstrip(":")
                .casefold()
            )
            value = " ".join("".join(self.option_value_parts).split())
            if label in {"genere", "generi", "genre", "genres"} and value:
                self.current_movie["genres"] = [
                    item.strip() for item in re.split(r"[,;]", value) if item.strip()
                ]
            elif label in {"regia", "regista", "director", "directors"} and value:
                self.current_movie["director"] = value
            elif label in {"anno", "year"} and re.fullmatch(r"\d{4}", value):
                self.current_movie["year"] = value
            self.in_option = False

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

        if self.in_option:
            (
                self.option_label_parts
                if self.in_option_label
                else self.option_value_parts
            ).append(data)
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
    # Pochi giorni: oltre, le pagine future contengono solo annunci e il
    # WAF penalizza le richieste inutili.
    date_links = list(dict.fromkeys(date_links))[:5]
    if not date_links:
        date_links = [today_date().strftime("%d-%m-%Y")]

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
                if time_str and time_str not in PLACEHOLDER_TIMES:
                    shows_list.append(
                        {
                            "time": time_str,
                            "room": sala,
                            "url": ticket_url,
                        }
                    )

            date_for_shows = day_formatted
            release_hint = release_date_hint(raw_title)
            if release_hint:
                date_for_shows = release_hint

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


def describe_page(html: str, with_preview: bool = False) -> str:
    """Riassunto breve della pagina ricevuta, per capire cosa ha risposto la fonte."""
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    title_text = " ".join(title.group(1).split())[:120] if title else "(nessun titolo)"
    summary = (
        f"{len(html)} byte, titolo '{title_text}', "
        f"movie--preview={html.count('movie--preview')}, "
        f"inner-film={html.count('inner-film')}, "
        f"time-select={html.count('time-select__place')}"
    )
    if with_preview:
        summary += " | inizio: " + " ".join(html[:400].split())
    return summary


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
        # L'anteprima resta nel log: nel JSON deve finire solo il riepilogo,
        # altrimenti i marcatori della challenge falserebbero i controlli.
        print(f"  Pagina ricevuta da {source['url']}: {describe_page(html, True)}")
        raise RuntimeError(
            f"[{source['name']}] Nessun film o spettacolo valido trovato. "
            f"Pagina ricevuta: {describe_page(html)}"
        )
    return parser.movies


# --- Gestione dati precedenti (ripresa in caso di fonte non raggiungibile) ---
def _schedule_timestamp(data: dict) -> float:
    raw = str(data.get("updatedAt") or "")
    try:
        return datetime.fromisoformat(raw).timestamp()
    except ValueError:
        return 0.0


def load_previous() -> dict:
    """Carica la programmazione nota piu' recente.

    Fonti: il file nel repository e l'ultima versione pubblicata sul sito.
    """
    candidates: list[dict] = []

    if SCHEDULE_FILE.exists():
        try:
            candidates.append(json.loads(SCHEDULE_FILE.read_text(encoding="utf-8")))
        except Exception:
            pass

    try:
        published = fetch(PUBLISHED_SCHEDULE_URL, attempts=2, timeout=20)
        candidates.append(json.loads(published))
    except Exception as error:
        print(f"  Programmazione pubblicata non raggiungibile: {error}")

    if not candidates:
        return {}
    return max(candidates, key=_schedule_timestamp)


def previous_movies_for_venue(previous: dict, venue_id: str, today: date) -> list[dict]:
    """Recupera i film già noti per una sala, limitando alle date non passate."""
    recovered: list[dict] = []
    for movie in previous.get("movies", []):
        blocks = []
        for block in movie.get("shows", []):
            if block.get("venue") != venue_id:
                continue
            day = parse_it_date(block.get("date"))
            if day is None or day < today:
                continue
            blocks.append(
                {"date": block["date"], "shows": list(block.get("shows", []))}
            )
        if not blocks:
            continue
        recovered.append(
            {
                "title": movie.get("title", ""),
                "poster": movie.get("poster", ""),
                "url": (movie.get("venueUrls") or {}).get(venue_id)
                or movie.get("url", ""),
                "duration": movie.get("duration", ""),
                "tags": list(movie.get("tags", [])),
                "genres": list(movie.get("genres", [])),
                "director": movie.get("director", ""),
                "year": movie.get("year", ""),
                "synopsis": movie.get("synopsis", ""),
                "shows": blocks,
            }
        )
    return recovered


def carry_over_missing_dates(
    movies: list[dict], previous: dict, venue_id: str, today: date
) -> list[dict]:
    """Ripristina i giorni futuri spariti da uno scraping incompleto.

    Un giorno viene ripristinato solo se il film è ancora in cartellone nella
    sala: evita di resuscitare film terminati o annullati.
    """
    fresh_keys = {title_key(movie["title"]) for movie in movies}
    fresh_dates: set[str] = set()
    for movie in movies:
        for block in movie.get("shows", []):
            fresh_dates.add(block["date"])

    carried: list[dict] = []
    for previous_movie in previous.get("movies", []):
        key = title_key(previous_movie.get("title", ""))
        if key not in fresh_keys:
            continue
        for block in previous_movie.get("shows", []):
            if block.get("venue") != venue_id:
                continue
            day = parse_it_date(block.get("date"))
            if day is None or day < today:
                continue
            if block["date"] in fresh_dates:
                continue
            for movie in movies:
                if title_key(movie["title"]) != key:
                    continue
                movie["shows"].append(
                    {"date": block["date"], "shows": list(block.get("shows", []))}
                )
                fresh_dates.add(block["date"])
                carried.append(
                    {
                        "venue": venue_id,
                        "date": block["date"],
                        "title": movie["title"],
                    }
                )
                break
    return carried


def main() -> None:
    today = today_date()
    previous = load_previous()
    warnings: list[dict] = []
    fresh_movies: dict[str, list[dict]] = {}
    failures: dict[str, str] = {}

    for source in SOURCES:
        venue_id = source["id"]
        print(f"[*] {source['name']}: recupero programmazione...")
        try:
            fresh_movies[venue_id] = parse_source(source)
        except Exception as error:
            failures[venue_id] = str(error)
            print(f"[!] {source['name']}: {error}")

    if not fresh_movies:
        print("[!] Nessuna fonte raggiungibile: i dati precedenti restano invariati.")
        for venue_id, message in failures.items():
            print(f"    - {venue_id}: {message}")
        raise SystemExit(1)

    venue_movies: list[tuple[dict, list[dict]]] = []
    for source in SOURCES:
        venue_id = source["id"]
        if venue_id in fresh_movies:
            movies = fresh_movies[venue_id]
            carried = carry_over_missing_dates(movies, previous, venue_id, today)
            for item in carried:
                print(
                    f"    - {source['name']}: ripristinato {item['date']} "
                    f"per '{item['title']}' dai dati precedenti"
                )
                warnings.append({"type": "carried-over", **item})
        else:
            movies = previous_movies_for_venue(previous, venue_id, today)
            message = failures.get(venue_id, "sconosciuto")
            print(f"[!] {source['name']}: dati precedenti riutilizzati ({message})")
            warnings.append(
                {
                    "type": "source-failed",
                    "venue": venue_id,
                    "message": message,
                }
            )
        venue_movies.append((source, movies))

    announced_dates: list[dict] = []
    for venue_id, url in ANNOUNCED_SCHEDULES.items():
        try:
            announced_dates.extend(parse_announced_dates(url, venue_id))
        except Exception as error:
            print(f"[!] Date annunciate non lette da {url}: {error}")
            warnings.append(
                {
                    "type": "announced-failed",
                    "venue": venue_id,
                    "message": str(error),
                }
            )

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
                    "venueUrls": {},
                    "genres": list(movie.get("genres", [])),
                    "director": movie.get("director", ""),
                    "year": movie.get("year", ""),
                    "synopsis": movie.get("synopsis", ""),
                    "shows": [],
                    "announcedDates": [],
                }
            target = combined[key]
            target["venueUrls"][source["id"]] = movie.get("url", source["url"])
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
            for field in ("director", "year", "synopsis"):
                if not target[field] and movie.get(field):
                    target[field] = movie[field]
            for show in movie["shows"]:
                target["shows"].append({**show, "venue": source["id"]})

    for item in announced_dates:
        key = title_key(item["title"])
        target = combined.get(key)
        if target is None:
            target = {
                "id": str(len(combined) + 1),
                "title": item["title"],
                "poster": "",
                "url": item["url"],
                "duration": "",
                "tags": [],
                "venueUrls": {},
                "genres": [],
                "director": "",
                "year": "",
                "shows": [],
                "announcedDates": [],
                "synopsis": "",
            }
            combined[key] = target
        entry = {"date": item["date"], "venue": item["venue"]}
        if entry not in target["announcedDates"]:
            target["announcedDates"].append(entry)

    movies_output = list(combined.values())
    previous_details = {
        title_key(movie.get("title", "")): movie for movie in previous.get("movies", [])
    }

    # Dettagli film: la sinossi richiede la scheda dedicata, con pausa per
    # non farsi limitare dalla biglietteria.
    for index, movie in enumerate(movies_output):
        if not movie.get("synopsis"):
            details = get_movie_details(movie["url"])
            if details.get("synopsis") and not movie.get("synopsis"):
                movie["synopsis"] = details["synopsis"]
            if details.get("genres") and not movie.get("genres"):
                movie["genres"] = details["genres"]
            if details.get("director") and not movie.get("director"):
                movie["director"] = details["director"]
            if details.get("year") and not movie.get("year"):
                movie["year"] = details["year"]
        if not movie.get("synopsis"):
            # Scheda non raggiungibile: si tengono i dettagli già noti.
            old = previous_details.get(title_key(movie["title"]))
            if old:
                for field in ("synopsis", "genres", "director", "year"):
                    if not movie.get(field) and old.get(field):
                        movie[field] = old[field]
        if index < len(movies_output) - 1:
            time.sleep(DETAIL_DELAY)

    # Le date passate non interessano più il visitatore.
    for movie in movies_output:
        movie["shows"] = [
            block
            for block in movie["shows"]
            if (parse_it_date(block["date"]) or today) >= today
        ]
        movie["announcedDates"] = [
            entry
            for entry in movie["announcedDates"]
            if (parse_it_date(entry["date"]) or today) >= today
        ]

    venues_output = []
    for source in SOURCES:
        venue_id = source["id"]
        if venue_id in fresh_movies:
            status = "available"
        elif venue_counts.get(venue_id, 0) > 0:
            status = "stale"
        else:
            status = "unavailable"
        venues_output.append(
            {
                "id": venue_id,
                "name": source["name"],
                "location": source["location"],
                "source": source["url"],
                "sourceName": source["source_name"],
                "status": status,
            }
        )

    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "venues": venues_output,
        "movies": movies_output,
        "warnings": warnings,
    }
    temporary_file = SCHEDULE_FILE.with_suffix(".json.tmp")
    temporary_file.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary_file.replace(SCHEDULE_FILE)
    counts = ", ".join(
        f"{source['name']}: {venue_counts.get(source['id'], 0)} film"
        for source in SOURCES
    )
    print(f"Aggiornata programmazione con successo: {counts}.")
    if warnings:
        print(f"Avvertenze: {len(warnings)}")


if __name__ == "__main__":
    main()
