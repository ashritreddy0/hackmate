
import json
import sys
from pathlib import Path

from sqlalchemy import select

from main import Hackathon, SessionLocal

# Existing React data file
PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = PROJECT_DIR / "src" / "assets" / "data" / "hackathons.js"


def load_events():
    """
    Reads the existing JavaScript data array.
    For a reliable import, use the JSON-compatible array
    copied into hackathons.json as described below.
    """
    json_file = PROJECT_DIR / "src" / "assets" / "data" / "hackathons.json"

    if not json_file.exists():
        print(f"Data file not found: {json_file}")
        print("Create hackathons.json from your existing hackathons.js first.")
        sys.exit(1)

    with json_file.open("r", encoding="utf-8") as file:
        return json.load(file)


FIELD_MAP = {
    "id": "event_id",
    "title": "title",
    "organizer": "organizer",
    "format": "format",
    "location": "location",
    "category": "category",
    "level": "level",
    "eligibility": "eligibility",
    "description": "description",
    "platform": "platform",
    "eventUrl": "event_url",
    "platformUrl": "platform_url",
    "registrationUrl": "registration_url",
    "deadline": "deadline",
    "eventStart": "event_start",
    "eventEnd": "event_end",
    "verification": "verification",
    "verifiedOn": "verified_on",
    "isSample": "is_sample",
}


def main():
    events = load_events()
    imported = 0
    skipped = 0

    with SessionLocal() as db:
        for item in events:
            event_id = str(item.get("id", "")).strip()
            title = str(item.get("title", "")).strip()
            organizer = str(item.get("organizer", "")).strip()

            if not event_id or not title or not organizer:
                print(f"Skipping invalid event: {item.get('title', '(untitled)')}")
                skipped += 1
                continue

            existing = db.get(Hackathon, event_id)
            if existing:
                print(f"Already exists: {title}")
                skipped += 1
                continue

            values = {}
            for source, target in FIELD_MAP.items():
                if source in item:
                    values[target] = item[source]

            values["event_id"] = event_id
            values["title"] = title
            values["organizer"] = organizer

            # Dates must use ISO format: YYYY-MM-DD.
            for key in ("deadline", "event_start", "event_end", "verified_on"):
                if values.get(key) in ("", None):
                    values[key] = None

            values.setdefault("status", "Open")

            db.add(Hackathon(**values))
            imported += 1

        db.commit()

    print(f"\nImport complete. Added: {imported}; skipped: {skipped}.")


if __name__ == "__main__":
    main()
