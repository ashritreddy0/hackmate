"""Regression tests for HackMate discovery quality gates."""

import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

import main
from main import Hackathon


class DiscoveryQualityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        main.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(
            bind=self.engine, autoflush=False, expire_on_commit=False
        )
        self.db = self.Session()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def candidate(self, title, url):
        return {
            "title": title,
            "source_url": url,
            "snippet": "Student hackathon registration is open.",
            "source_domain": "devpost.com",
        }

    def details(self, title):
        return {
            "title": title,
            "organizer": "Example University",
            "format": "Online",
            "location": "Online",
            "category": "General",
            "level": "Students",
            "eligibility": "See official rules",
            "description": "A student hackathon with project building.",
            "platform": "Devpost",
            "event_url": "https://devpost.com/events/example",
            "platform_url": "https://devpost.com/events/example",
            "registration_url": None,
            "deadline": None,
            "event_start": None,
            "event_end": None,
        }

    def test_canonical_url_ignores_tracking_parameters(self):
        self.assertEqual(
            main.canonical_url(
                "https://www.devpost.com/events/demo?utm_source=search&fbclid=abc"
            ),
            "https://devpost.com/events/demo",
        )

    def test_title_normalization_detects_url_independent_duplicates(self):
        self.assertEqual(
            main.normalized_event_title("Smart India Hackathon 2026!"),
            main.normalized_event_title("smart-india hackathon 2026"),
        )

    async def test_extraction_failure_never_saves_error_as_event(self):
        with patch.object(
            main,
            "discover_candidates",
            new=AsyncMock(return_value={
                "candidates": [self.candidate(
                    "Smart India Hackathon",
                    "https://devpost.com/events/blocked-page",
                )],
                "searched_on": "2026-10-20",
                "search_queries": 1,
                "failed_queries": 0,
                "candidate_count": 1,
            }),
        ), patch.object(
            main,
            "extract_candidate",
            new=AsyncMock(side_effect=HTTPException(502, "page fetch failed")),
        ):
            result = await main.scan_for_hackathons(self.db)

        self.assertEqual(result["published_now"], 0)
        self.assertEqual(result["import_failures"], 1)
        self.assertEqual(list(self.db.scalars(select(Hackathon)).all()), [])

    async def test_same_event_title_at_different_urls_is_only_saved_once(self):
        candidates = [
            self.candidate("Smart India Hackathon 2026", "https://devpost.com/events/sih-a"),
            self.candidate("Smart India Hackathon 2026", "https://unstop.com/hackathons/sih-b"),
        ]
        with patch.object(
            main,
            "discover_candidates",
            new=AsyncMock(return_value={
                "candidates": candidates,
                "searched_on": "2026-10-20",
                "search_queries": 2,
                "failed_queries": 0,
                "candidate_count": 2,
            }),
        ), patch.object(
            main,
            "extract_candidate",
            new=AsyncMock(return_value=self.details("Smart India Hackathon 2026")),
        ):
            result = await main.scan_for_hackathons(self.db)

        saved = list(self.db.scalars(select(Hackathon)).all())
        self.assertEqual(len(saved), 1)
        self.assertEqual(result["published_now"], 1)
        self.assertEqual(result["duplicates_skipped"], 1)


if __name__ == "__main__":
    unittest.main()
