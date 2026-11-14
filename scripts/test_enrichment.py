"""python scripts/test_enrichment.py — nessuna rete o dipendenza esterna."""

import json
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path

from movie_metadata import candidates, enrich_schedule, parse_metadata, read_json
from build_calendars import build, event_records, fold, reconcile

MOVIE = {"title": "Kontinental '25", "year": "2025", "director": "Radu Jude"}
URL = "https://www.mymovies.it/film/2025/kontinental-25/"
RECORD = {
    "@type": "Movie",
    "name": MOVIE["title"],
    "dateCreated": "2025",
    "director": [{"name": "Radu Jude"}],
    "aggregateRating": {
        "bestRating": "5",
        "ratingValue": "3.61",
        "ratingCount": "22",
        "reviewCount": "15",
    },
}


def page(record=RECORD):
    return (
        '<script type="application/ld+json">'
        + json.dumps({"@graph": [record]})
        + '</script><div>CRITICA 3,83</div><div>PUBBLICO 3,00</div><div>Uscita cinema <a href="?data=25/06/2026">25 giugno</a></div>'
    )


class MetadataTests(unittest.TestCase):
    def test_real_fields_and_italian_release(self):
        result = parse_metadata(page(), URL, MOVIE)
        self.assertEqual(result["rating"], 3.61)
        self.assertEqual(result["ratingCount"], 22)
        self.assertEqual(result["criticsRating"], 3.83)
        self.assertEqual(result["audienceRating"], 3)
        self.assertEqual(result["releaseDateIT"], "2026-06-25")

    def test_wrong_film_year_director_host(self):
        for changes in [
            {"title": "Altro"},
            {"year": "2026"},
            {"director": "Altro Regista"},
        ]:
            self.assertIsNone(parse_metadata(page(), URL, {**MOVIE, **changes}))
        self.assertIsNone(
            parse_metadata(
                page(), "https://evil.example/film/2025/kontinental-25/", MOVIE
            )
        )
        self.assertIsNone(parse_metadata(page(), URL, {"title": MOVIE["title"]}))

    def test_initials_and_rereleases(self):
        self.assertIsNotNone(
            parse_metadata(page(), URL, {**MOVIE, "director": "R. Jude"})
        )
        self.assertIsNone(parse_metadata(page(), URL, {**MOVIE, "director": "X. Jude"}))
        self.assertIsNotNone(
            parse_metadata(page(), URL, {**MOVIE, "title": MOVIE["title"] + " (RIED.)"})
        )

    def test_invalid_and_absent_votes(self):
        for rating in [
            {},
            {"ratingValue": "0"},
            {"ratingValue": "NaN"},
            {"ratingValue": "6"},
            {"bestRating": "10", "ratingValue": "8"},
        ]:
            result = parse_metadata(
                page({**RECORD, "aggregateRating": rating}), URL, MOVIE
            )
            self.assertNotIn("rating", result)
        self.assertIsNone(
            parse_metadata('<script type="application/ld+json">{</script>', URL, MOVIE)
        )

    def test_search_ignores_recommendations_and_subpages(self):
        html = f'<a href="{URL}">{MOVIE["title"]}</a><a href="{URL}cast/">cast</a><a href="/film/2026/hope/">Hope</a>'
        self.assertEqual(candidates(html, MOVIE), [URL])

    def test_cache_and_outage_preserve_values_and_history(self):
        now = datetime(2026, 11, 13, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            calls = []

            def fetch(url):
                calls.append(url)
                return (
                    f'<a href="{URL}">{MOVIE["title"]}</a>'
                    if "avanzata" in url
                    else page()
                )

            data = {"updatedAt": now.isoformat(), "movies": [dict(MOVIE)]}
            enrich_schedule(data, directory=folder, fetcher=fetch, now=now)
            self.assertEqual(len(calls), 2)
            enrich_schedule(data, directory=folder, fetcher=fetch, now=now)
            self.assertEqual(len(calls), 2)

            def offline(url):
                raise OSError("offline")

            enrich_schedule(
                data, directory=folder, fetcher=offline, now=now + timedelta(days=2)
            )
            self.assertEqual(data["movies"][0]["external"]["rating"], 3.61)
            self.assertEqual(data["movies"][0]["firstSeenAt"], now.isoformat())


class CalendarTests(unittest.TestCase):
    def fixture(self):
        return {
            "venues": [{"id": f"cinema-{i}", "name": f"Cinema {i}"} for i in range(5)],
            "movies": [
                {
                    "title": "Film è, sì; \nProva",
                    "duration": "2h 10m",
                    "url": "https://example.test/ticket",
                    "shows": [
                        {
                            "venue": f"cinema-{i}",
                            "date": "29/03/2027",
                            "shows": [{"time": "23:30", "room": "1"}],
                        }
                        for i in range(5)
                    ],
                }
            ],
        }

    def test_all_31_selections_and_folding(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            result = build(
                self.fixture(),
                {},
                output=folder / "feeds",
                state_file=folder / "state.json",
                now=datetime(2027, 3, 28, tzinfo=timezone.utc),
            )
            self.assertEqual(result, {"feeds": 31, "events": 5})
            document = (folder / "feeds/all.ics").read_bytes().decode()
            self.assertEqual(document.count("BEGIN:VEVENT"), 5)
            self.assertIn("DURATION:PT130M", document)
            self.assertIn("TRANSP:TRANSPARENT", document)
            self.assertNotIn("VALARM", document)
            self.assertTrue(
                all(len(line.encode()) <= 75 for line in document.split("\r\n"))
            )
            subset = (folder / "feeds/cinema-0_cinema-2.ics").read_text(
                encoding="utf-8"
            )
            self.assertEqual(subset.count("BEGIN:VEVENT"), 2)
            self.assertIn("Film è\\, sì\\; \\nProva", document.replace("\r\n ", ""))
            self.assertEqual(fold("à" * 100).replace("\r\n ", ""), "à" * 100)
            index = json.loads(
                (folder / "feeds/index.json").read_text(encoding="utf-8")
            )
            for feed in index["feeds"]:
                content = (folder / "feeds" / feed["file"]).read_text(encoding="utf-8")
                self.assertEqual(content.count("BEGIN:VEVENT"), len(feed["venues"]))

    def test_stable_ids_modifications_and_cancellations(self):
        records = event_records(self.fixture(), {})
        now = datetime(2027, 3, 28, tzinfo=timezone.utc)
        first = reconcile(records, {}, now)
        self.assertEqual(reconcile(records, first, now + timedelta(hours=4)), first)
        removed = next(iter(records))
        records.pop(removed)
        cancelled = reconcile(records, first, now + timedelta(hours=4))
        self.assertEqual(cancelled[removed]["status"], "CANCELLED")
        self.assertEqual(cancelled[removed]["sequence"], 1)
        self.assertEqual(
            reconcile(records, cancelled, now + timedelta(hours=8)), cancelled
        )
        changed = next(iter(records))
        records[changed]["url"] = "https://example.test/new"
        updated = reconcile(records, cancelled, now + timedelta(hours=8))
        self.assertEqual(updated[changed]["sequence"], 1)
        restored = reconcile(
            event_records(self.fixture(), {}), cancelled, now + timedelta(hours=8)
        )
        self.assertEqual(restored[removed]["sequence"], 2)
        self.assertEqual(restored[removed]["status"], "CONFIRMED")

    def test_unknown_duration_does_not_invent_end(self):
        data = self.fixture()
        data["movies"][0]["duration"] = ""
        self.assertTrue(
            all(e["minutes"] == 0 for e in event_records(data, {}).values())
        )


class ScheduleIntegrationTests(unittest.TestCase):
    def test_metadata_failure_does_not_block_schedule(self):
        import update_schedule as upd

        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "schedule.json"
            movie = {
                "title": "TEST FILM",
                "url": "https://example.test/info",
                "tags": [],
                "shows": [
                    {
                        "date": upd.format_it_date(
                            upd.today_date() + timedelta(days=1)
                        ),
                        "shows": [{"time": "20:00", "room": "Sala 1"}],
                    }
                ],
            }
            with (
                patch.object(upd, "SCHEDULE_FILE", target),
                patch.object(upd, "load_previous", return_value={}),
                patch.object(upd, "parse_source", side_effect=lambda source: [movie]),
                patch.object(upd, "parse_announced_dates", return_value=[]),
                patch.object(
                    upd,
                    "enrich_schedule",
                    side_effect=OSError("fonte metadati non disponibile"),
                ),
            ):
                upd.main()
            result = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(len(result["venues"]), 5)
            self.assertEqual(
                sum(len(group["shows"]) for group in result["movies"][0]["shows"]), 5
            )

    def test_only_declared_show_formats(self):
        from update_schedule import declared_show_details

        self.assertEqual(declared_show_details("20:30 Sala 1 Italiano"), {})
        self.assertEqual(
            declared_show_details("20:30 Sala 1 3D V.O. sottotitoli"),
            {"format": "3D", "version": "OV", "subtitles": True},
        )


if __name__ == "__main__":
    unittest.main()
