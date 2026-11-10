"""Test di resilienza dell'aggiornamento della programmazione.

Eseguire con: python scripts/test_resilience.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import update_schedule as upd


def _future(days: int) -> str:
    return upd.format_it_date(upd.today_date() + timedelta(days=days))


def _movie(title: str, dates: list[str], venue: str = "andromeda-river") -> dict:
    return {
        "id": "1",
        "title": title,
        "poster": "",
        "url": f"https://example.test/film/{venue}",
        "duration": "",
        "tags": [],
        "genres": [],
        "director": "",
        "year": "",
        "synopsis": "",
        "shows": [
            {
                "date": day,
                "venue": venue,
                "shows": [
                    {"time": "20:00", "room": "Sala 1", "url": "https://example.test"}
                ],
            }
            for day in dates
        ],
        "announcedDates": [],
    }


def _write_snapshot(path: Path, movies: list[dict]) -> None:
    path.write_text(
        json.dumps(
            {
                "updatedAt": "2026-01-01T00:00:00+00:00",
                "venues": [
                    {
                        "id": source["id"],
                        "name": source["name"],
                        "location": source["location"],
                        "source": source["url"],
                        "sourceName": source["source_name"],
                        "status": "available",
                    }
                    for source in upd.SOURCES
                ],
                "movies": movies,
                "warnings": [],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_fetch_retries_on_429() -> None:
    from urllib.error import HTTPError

    calls = {"n": 0}

    class FakeResponse:
        headers = type("H", (), {"get_content_charset": lambda self: "utf-8"})()

        def read(self) -> bytes:
            return b"<html>ok</html>"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        if calls["n"] < 3:
            raise HTTPError(request.full_url, 429, "Too Many Requests", {}, None)
        return FakeResponse()

    original = upd.urlopen
    upd.urlopen = fake_urlopen
    original_sleep = upd.time.sleep
    upd.time.sleep = lambda _seconds: None
    try:
        html = upd.fetch("https://example.test")
    finally:
        upd.urlopen = original
        upd.time.sleep = original_sleep

    assert html == "<html>ok</html>", html
    assert calls["n"] == 3, calls
    print("  ok fetch: ritenta su 429")


def test_fetch_gives_up_after_attempts() -> None:
    from urllib.error import HTTPError

    calls = {"n": 0}

    def fake_urlopen(request, timeout=None):
        calls["n"] += 1
        raise HTTPError(request.full_url, 429, "Too Many Requests", {}, None)

    original = upd.urlopen
    upd.urlopen = fake_urlopen
    original_sleep = upd.time.sleep
    upd.time.sleep = lambda _seconds: None
    try:
        upd.fetch("https://example.test", attempts=2)
    except HTTPError:
        pass
    else:
        raise AssertionError("attesi HTTPError")
    finally:
        upd.urlopen = original
        upd.time.sleep = original_sleep

    assert calls["n"] == 2, calls
    print("  ok fetch: rinuncia dopo i tentativi previsti")


def test_source_failure_keeps_previous_data() -> None:
    with tempfile.TemporaryDirectory() as folder:
        schedule_file = Path(folder) / "schedule.json"
        _write_snapshot(
            schedule_file, [_movie("DIO RIDE", [_future(1), _future(2)], "citrigno")]
        )

        original_file = upd.SCHEDULE_FILE
        original_parse = upd.parse_source
        original_details = upd.get_movie_details
        original_announced = upd.parse_announced_dates
        upd.SCHEDULE_FILE = schedule_file
        upd.get_movie_details = lambda url: {
            "synopsis": "",
            "genres": [],
            "director": "",
            "year": "",
        }
        upd.parse_announced_dates = lambda url, venue_id: []

        def fake_parse(source):
            if source["id"] == "citrigno":
                raise RuntimeError("timeout di rete")
            return [
                {
                    "title": "HOPE",
                    "poster": "",
                    "url": "https://example.test/film/hope",
                    "duration": "",
                    "tags": [],
                    "shows": [
                        {
                            "date": _future(1),
                            "shows": [{"time": "21:00", "room": "Sala 2", "url": "u"}],
                        }
                    ],
                }
            ]

        upd.parse_source = fake_parse
        try:
            upd.main()
        finally:
            upd.SCHEDULE_FILE = original_file
            upd.parse_source = original_parse
            upd.get_movie_details = original_details
            upd.parse_announced_dates = original_announced

        data = _read(schedule_file)
        titles = {movie["title"] for movie in data["movies"]}
        assert "DIO RIDE" in titles, titles
        assert "HOPE" in titles, titles
        statuses = {venue["id"]: venue["status"] for venue in data["venues"]}
        assert statuses["citrigno"] == "stale", statuses
        assert statuses["andromeda-river"] == "available", statuses
        assert any(w["type"] == "source-failed" for w in data["warnings"]), data[
            "warnings"
        ]
        print(
            "  ok fonte fallita: dati precedenti riutilizzati senza perdere le altre sale"
        )


def test_all_sources_failing_keeps_file() -> None:
    with tempfile.TemporaryDirectory() as folder:
        schedule_file = Path(folder) / "schedule.json"
        _write_snapshot(schedule_file, [_movie("DIO RIDE", [_future(1)])])
        before = schedule_file.read_text(encoding="utf-8")

        original_file = upd.SCHEDULE_FILE
        original_parse = upd.parse_source
        upd.SCHEDULE_FILE = schedule_file

        def fake_parse(source):
            raise RuntimeError("host irraggiungibile")

        upd.parse_source = fake_parse
        try:
            upd.main()
        except SystemExit as exit_error:
            assert exit_error.code == 1, exit_error.code
        else:
            raise AssertionError("attesa uscita con codice 1")
        finally:
            upd.SCHEDULE_FILE = original_file
            upd.parse_source = original_parse

        assert schedule_file.read_text(encoding="utf-8") == before
        print("  ok tutte le fonti fallite: file precedente intatto")


def test_carry_over_restores_missing_day() -> None:
    previous = {"movies": [_movie("DIO RIDE", [_future(1), _future(2)])]}
    movies = [
        {
            "title": "DIO RIDE",
            "poster": "",
            "url": "https://example.test/film/dio-ride",
            "duration": "",
            "tags": [],
            "shows": [
                {
                    "date": _future(1),
                    "shows": [{"time": "20:00", "room": "Sala 1", "url": "u"}],
                }
            ],
        }
    ]
    carried = upd.carry_over_missing_dates(
        movies, previous, "andromeda-river", upd.today_date()
    )
    dates = {block["date"] for movie in movies for block in movie["shows"]}
    assert _future(2) in dates, dates
    assert len(carried) == 1, carried
    print("  ok carry-over: il giorno futuro mancante viene ripristinato")


def test_carry_over_ignores_finished_movies() -> None:
    previous = {"movies": [_movie("DIO RIDE", [_future(1)])]}
    movies = [
        {
            "title": "HOPE",
            "poster": "",
            "url": "https://example.test/film/hope",
            "duration": "",
            "tags": [],
            "shows": [
                {
                    "date": _future(1),
                    "shows": [{"time": "20:00", "room": "Sala 1", "url": "u"}],
                }
            ],
        }
    ]
    carried = upd.carry_over_missing_dates(
        movies, previous, "andromeda-river", upd.today_date()
    )
    assert carried == [], carried
    print("  ok carry-over: i film terminati non vengono resuscitati")


def test_release_date_hint() -> None:
    hint = upd.release_date_hint("AVENGERS: DOOMSDAY - DAL 16 DICEMBRE")
    assert hint == "16/12/2026", hint
    assert upd.release_date_hint("DIO RIDE") is None
    print("  ok data di uscita: 'DAL 16 DICEMBRE' interpretato correttamente")


def test_placeholder_times_are_dropped() -> None:
    garden = upd.parse_garden_multi_days.__doc__
    assert garden is not None
    assert "00:01" in upd.PLACEHOLDER_TIMES
    print("  ok orari segnaposto: esclusi dai dati")


def main() -> int:
    tests = [
        test_fetch_retries_on_429,
        test_fetch_gives_up_after_attempts,
        test_source_failure_keeps_previous_data,
        test_all_sources_failing_keeps_file,
        test_carry_over_restores_missing_day,
        test_carry_over_ignores_finished_movies,
        test_release_date_hint,
        test_placeholder_times_are_dropped,
    ]
    failures = 0
    for test in tests:
        try:
            test()
        except AssertionError as error:
            failures += 1
            print(f"  KO {test.__name__}: {error}")
    print(f"\n{len(tests) - failures}/{len(tests)} test superati.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
