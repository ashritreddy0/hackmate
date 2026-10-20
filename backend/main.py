
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, urlunparse
import hashlib
import ipaddress
import socket
import os
import secrets

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlalchemy import (
    create_engine, String, Date, Text, select, Integer, UniqueConstraint
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, sessionmaker, Session
)

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{BASE_DIR / 'hackmate.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


class Hackathon(Base):
    __tablename__ = "hackathons"

    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    title: Mapped[str] = mapped_column(String(250), index=True)
    organizer: Mapped[str] = mapped_column(String(250))
    format: Mapped[str] = mapped_column(String(100), default="Unknown")
    location: Mapped[str] = mapped_column(String(250), default="Unknown")
    category: Mapped[str] = mapped_column(String(150), default="General")
    level: Mapped[str] = mapped_column(String(100), default="All levels")
    eligibility: Mapped[str] = mapped_column(
        Text, default="Check official rules"
    )
    description: Mapped[str] = mapped_column(Text, default="")
    platform: Mapped[str] = mapped_column(String(150), default="Unknown")
    event_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    platform_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registration_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    event_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    event_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    verification: Mapped[str] = mapped_column(
        String(100), default="Needs verification"
    )
    verified_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_sample: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(50), default="Open")


class DiscoveryCandidate(Base):
    __tablename__ = "discovery_candidates"
    __table_args__ = (
        UniqueConstraint("source_url", name="uq_discovery_source_url"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(250))
    source_url: Mapped[str] = mapped_column(Text)
    source_domain: Mapped[str] = mapped_column(String(250), default="")
    snippet: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[str] = mapped_column(
        String(50), default="Pending review", index=True
    )
    discovered_on: Mapped[date] = mapped_column(Date, default=date.today)
    review_note: Mapped[str] = mapped_column(Text, default="")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class HackathonInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=250)
    organizer: str = Field(min_length=1, max_length=250)
    format: str = "Unknown"
    location: str = "Unknown"
    category: str = "General"
    level: str = "All levels"
    eligibility: str = "Check official rules"
    description: str = ""
    platform: str = "Unknown"
    event_url: Optional[HttpUrl] = None
    platform_url: Optional[HttpUrl] = None
    registration_url: Optional[HttpUrl] = None
    deadline: Optional[date] = None
    event_start: Optional[date] = None
    event_end: Optional[date] = None
    verification: str = "Needs verification"
    verified_on: Optional[date] = None
    is_sample: bool = False
    status: str = "Open"


class HackathonPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=250)
    organizer: Optional[str] = Field(default=None, min_length=1, max_length=250)
    format: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    eligibility: Optional[str] = None
    description: Optional[str] = None
    platform: Optional[str] = None
    event_url: Optional[HttpUrl] = None
    platform_url: Optional[HttpUrl] = None
    registration_url: Optional[HttpUrl] = None
    deadline: Optional[date] = None
    event_start: Optional[date] = None
    event_end: Optional[date] = None
    verification: Optional[str] = None
    verified_on: Optional[date] = None
    is_sample: Optional[bool] = None
    status: Optional[str] = None


class HackathonOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    title: str
    organizer: str
    format: str
    location: str
    category: str
    level: str
    eligibility: str
    description: str
    platform: str
    event_url: Optional[str]
    platform_url: Optional[str]
    registration_url: Optional[str]
    deadline: Optional[date]
    event_start: Optional[date]
    event_end: Optional[date]
    verification: str
    verified_on: Optional[date]
    is_sample: bool
    status: str


class DiscoveryCandidateOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_url: str
    source_domain: str
    snippet: str
    review_status: str
    discovered_on: date
    review_note: str


def payload_to_db_values(payload: BaseModel, **options):
    values = payload.model_dump(**options)
    for field in ("event_url", "platform_url", "registration_url"):
        if values.get(field) is not None:
            values[field] = str(values[field])
    return values


app = FastAPI(
    title="HackMate API",
    description="Hackathon discovery, extraction and management API.",
    version="3.0.0",
)

from ai_importer import router as ai_importer_router
from discovery_service import discover_candidates

app.include_router(ai_importer_router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://hackmate-cdh2orm02-secondmoon.vercel.app",
        "https://hackmate-flame.vercel.app",
        "https://hackmate-pgvzekdnj-secondmoon.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic(auto_error=False)

def require_admin(credentials: Optional[HTTPBasicCredentials] = Depends(security)):
    expected_user = os.getenv("ADMIN_USERNAME", "")
    expected_password = os.getenv("ADMIN_PASSWORD", "")
    if not expected_user or not expected_password:
        raise HTTPException(503, "Admin credentials are not configured on the server.")
    username = credentials.username if credentials else ""
    password = credentials.password if credentials else ""
    if not (
        secrets.compare_digest(username, expected_user)
        and secrets.compare_digest(password, expected_password)
    ):
        raise HTTPException(
            401,
            "Admin login required or credentials are incorrect.",
            headers={"WWW-Authenticate": "Basic"},
        )
    return True


ALLOWED_STATUSES = {
    "Open", "Needs verification", "Closed", "Cancelled"
}
ALLOWED_REVIEW_STATUSES = {"Pending review", "Approved", "Rejected"}


@app.get("/")
def home():
    return {"message": "HackMate API is running!", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "healthy", "database": "connected"}


@app.get("/api/hackathons", response_model=list[HackathonOutput])
def list_hackathons(db: Session = Depends(get_db)):
    return db.scalars(select(Hackathon).order_by(Hackathon.title)).all()


@app.get("/api/hackathons/{event_id}", response_model=HackathonOutput)
def get_hackathon(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Hackathon, event_id)
    if event is None:
        raise HTTPException(404, "Hackathon not found")
    return event


@app.post("/api/hackathons", response_model=HackathonOutput, status_code=201)
def create_hackathon(payload: HackathonInput, db: Session = Depends(get_db)):
    if db.get(Hackathon, payload.event_id):
        raise HTTPException(409, "This event ID already exists")

    values = payload_to_db_values(payload)
    if values["status"] not in ALLOWED_STATUSES:
        raise HTTPException(422, "Invalid event status")

    event = Hackathon(**values)
    db.add(event)
    try:
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise
    return event


@app.put("/api/hackathons/{event_id}", response_model=HackathonOutput)
def update_hackathon(
    event_id: str, payload: HackathonInput, db: Session = Depends(get_db)
):
    event = db.get(Hackathon, event_id)
    if event is None:
        raise HTTPException(404, "Hackathon not found")

    values = payload_to_db_values(payload)
    values["event_id"] = event_id
    if values["status"] not in ALLOWED_STATUSES:
        raise HTTPException(422, "Invalid event status")

    for key, value in values.items():
        setattr(event, key, value)

    try:
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise
    return event


@app.patch("/api/hackathons/{event_id}", response_model=HackathonOutput)
def patch_hackathon(
    event_id: str, payload: HackathonPatch, db: Session = Depends(get_db)
):
    event = db.get(Hackathon, event_id)
    if event is None:
        raise HTTPException(404, "Hackathon not found")

    values = payload_to_db_values(payload, exclude_unset=True)
    if "status" in values and values["status"] not in ALLOWED_STATUSES:
        raise HTTPException(422, "Invalid event status")

    for key, value in values.items():
        setattr(event, key, value)

    try:
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise
    return event


@app.delete("/api/hackathons/{event_id}")
def delete_hackathon(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Hackathon, event_id)
    if event is None:
        raise HTTPException(404, "Hackathon not found")
    db.delete(event)
    db.commit()
    return {"message": "Hackathon deleted", "event_id": event_id}


# ---------------- Discovery queue ----------------

def canonical_url(value: str) -> str:
    parsed = urlparse(value.strip())
    return urlunparse((
        parsed.scheme.lower(),
        parsed.netloc.lower(),
        parsed.path.rstrip("/") or "/",
        "",
        parsed.query,
        "",
    ))


def is_public_http_url(value: str) -> bool:
    """Basic SSRF guard: reject non-web and private/local IP destinations."""
    try:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        host = parsed.hostname.lower()
        if host in {"localhost", "localhost.localdomain"}:
            return False
        addresses = socket.getaddrinfo(host, None)
        return bool(addresses) and all(
            not ipaddress.ip_address(info[4][0]).is_private
            and not ipaddress.ip_address(info[4][0]).is_loopback
            and not ipaddress.ip_address(info[4][0]).is_link_local
            and not ipaddress.ip_address(info[4][0]).is_reserved
            for info in addresses
        )
    except (ValueError, OSError):
        return False


async def extract_candidate(source_url: str, snippet: str) -> dict:
    """
    Reuse the existing AI extraction endpoint, then validate the returned
    shape and normalize fields before writing to the database.
    """
    if not is_public_http_url(source_url):
        raise HTTPException(422, "Candidate URL is not a public HTTP/HTTPS URL.")

    # Calling the extraction function directly avoids making an HTTP request
    # back into our own FastAPI server.
    from ai_importer import ImportRequest, extract_hackathon

    result = await extract_hackathon(ImportRequest(url=source_url))
    data = result.get("hackathon")

    if not isinstance(data, dict):
        raise HTTPException(502, "AI did not return hackathon details.")

    title = str(data.get("title") or "").strip()
    parsed_source = urlparse(source_url)
    host = (parsed_source.hostname or "").lower().removeprefix("www.")
    path = parsed_source.path.strip("/").lower()
    # Broad platform homepages/directories are not individual hackathon events.
    generic_platform_hosts = {
        "mlh.io", "devpost.com", "unstop.com", "devfolio.co",
        "hackerearth.com", "hack2skill.com", "hackathon.com",
    }
    if host in generic_platform_hosts and (not path or path in {"hackathons", "events", "competitions"}):
        raise HTTPException(422, "This is a general platform or directory, not one specific hackathon. Reject it and scan for individual event pages.")
    if len(title) < 4:
        raise HTTPException(422, "The page did not provide a usable hackathon title. It remains pending; reject this result or verify the event page manually.")

    def text_field(key, fallback, limit=2000):
        value = data.get(key)
        if value is None or not str(value).strip():
            return fallback
        return str(value).strip()[:limit]

    def date_field(key):
        value = data.get(key)
        if not value:
            return None
        try:
            # Database columns store calendar dates.
            return date.fromisoformat(str(value)[:10])
        except (ValueError, TypeError):
            return None

    domain = urlparse(source_url).hostname or "Unknown"
    official_event_url = data.get("event_url") or source_url
    registration_url = data.get("registration_url")

    # Only retain well-formed HTTP(S) URLs from the extracted response.
    def safe_link(value):
        if not value:
            return None
        try:
            parsed = urlparse(str(value))
            if parsed.scheme in {"http", "https"} and parsed.hostname:
                return str(value)[:2000]
        except ValueError:
            pass
        return None

    official_event_url = safe_link(official_event_url) or source_url
    registration_url = safe_link(registration_url)

    deadline = date_field("deadline")
    event_start = date_field("event_start")
    event_end = date_field("event_end")

    if deadline and event_start and event_end and event_start > event_end:
        event_start, event_end = None, None

    return {
        "title": title[:250],
        "organizer": text_field("organizer", "Needs verification", 250),
        "format": text_field("format", "Unknown", 100),
        "location": text_field("location", "Unknown", 250),
        "category": text_field("category", "General", 150),
        "level": text_field("level", "All levels", 100),
        "eligibility": text_field(
            "eligibility", "Check the official rules", 4000
        ),
        "description": text_field(
            "description", f"Discovery snippet: {snippet}", 8000
        ),
        "platform": text_field("platform", domain, 150),
        "event_url": official_event_url,
        "platform_url": source_url,
        "registration_url": registration_url,
        "deadline": deadline,
        "event_start": event_start,
        "event_end": event_end,
    }


@app.post("/api/admin/discovery/scan", dependencies=[Depends(require_admin)])
async def scan_for_hackathons(db: Session = Depends(get_db)):
    try:
        result = await discover_candidates()
    except Exception as exc:
        raise HTTPException(502, f"Discovery search failed: {type(exc).__name__}: {str(exc)[:500]}") from exc

    added = 0
    duplicates = 0

    try:
        for item in result.get("candidates", []):
            source_url = str(item.get("source_url") or "").strip()
            title = str(item.get("title") or "").strip()
            if not source_url or not title:
                continue

            normalized = canonical_url(source_url)
            existing_candidate = db.scalars(select(DiscoveryCandidate)).all()
            if any(canonical_url(c.source_url) == normalized for c in existing_candidate):
                duplicates += 1
                continue

            existing_event = db.scalars(select(Hackathon)).all()
            existing_urls = {
                canonical_url(u)
                for e in existing_event
                for u in (e.event_url, e.registration_url, e.platform_url)
                if u
            }
            if normalized in existing_urls:
                duplicates += 1
                continue

            domain = item.get("source_domain") or urlparse(source_url).hostname or ""
            db.add(DiscoveryCandidate(
                title=title[:250],
                source_url=source_url,
                source_domain=domain[:250],
                snippet=str(item.get("snippet") or "")[:5000],
                review_status="Pending review",
                review_note="AI extraction and official details will be checked on approval.",
            ))
            added += 1

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, f"Could not save scan results: {type(exc).__name__}") from exc

    return {
        "message": "Discovery scan completed. Candidates require review.",
        "searched_on": result.get("searched_on"),
        "queries_run": result.get("search_queries", 0),
        "search_failures": result.get("failed_queries", 0),
        "candidates_found": result.get("candidate_count", 0),
        "new_candidates_saved": added,
        "duplicates_skipped": duplicates,
        "review_required": True,
    }


@app.get(
    "/api/admin/discovery/queue",
    response_model=list[DiscoveryCandidateOutput],
    dependencies=[Depends(require_admin)],
)
def get_discovery_queue(
    review_status: str = "Pending review",
    db: Session = Depends(get_db),
):
    if review_status not in ALLOWED_REVIEW_STATUSES:
        raise HTTPException(422, "Invalid review status")

    return db.scalars(
        select(DiscoveryCandidate)
        .where(DiscoveryCandidate.review_status == review_status)
        .order_by(DiscoveryCandidate.discovered_on.desc())
    ).all()


@app.post("/api/admin/discovery/{candidate_id}/approve", dependencies=[Depends(require_admin)])
async def approve_discovery_candidate(
    candidate_id: int, db: Session = Depends(get_db)
):
    candidate = db.get(DiscoveryCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    if candidate.review_status != "Pending review":
        raise HTTPException(409, "This candidate has already been reviewed")

    source_url = candidate.source_url

    # Do not publish a candidate that duplicates an existing event.
    existing_events = db.scalars(select(Hackathon)).all()
    candidate_urls = {
        canonical_url(u)
        for e in existing_events
        for u in (e.event_url, e.registration_url, e.platform_url)
        if u
    }
    if canonical_url(source_url) in candidate_urls:
        candidate.review_status = "Rejected"
        candidate.review_note = "Duplicate of an existing event."
        db.commit()
        raise HTTPException(409, "This event already exists in HackMate.")

    # Keep the candidate pending if the official page cannot be extracted.
    try:
        details = await extract_candidate(source_url, candidate.snippet)
    except HTTPException as exc:
        candidate.review_note = (
            f"Extraction failed ({exc.status_code}). "
            "Candidate remains pending; check the official page manually."
        )
        db.commit()
        raise HTTPException(
            status_code=exc.status_code,
            detail=f"{exc.detail} Candidate remains pending review.",
        ) from exc

    event_id = "discovery-" + hashlib.sha256(
        canonical_url(source_url).encode("utf-8")
    ).hexdigest()[:24]

    if db.get(Hackathon, event_id):
        raise HTTPException(409, "An event with this ID already exists.")

    today = date.today()
    deadline = details["deadline"]
    start = details["event_start"]

    # Never label expired events as open.
    status = "Needs verification"
    if deadline and deadline < today:
        status = "Closed"

    event = Hackathon(
        event_id=event_id,
        **details,
        verification="Needs verification",
        verified_on=None,
        is_sample=False,
        status=status,
    )

    try:
        db.add(event)
        candidate.review_status = "Approved"
        candidate.title = details["title"]
        candidate.review_note = (
            "AI extracted event details. Verify official dates, eligibility, "
            "registration availability, and organizer before marking verified."
        )
        db.commit()
        db.refresh(event)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            500, f"Could not publish extracted event: {type(exc).__name__}"
        ) from exc

    return {
        "message": "Event details extracted and added for verification.",
        "event_id": event.event_id,
        "title": event.title,
        "status": event.status,
        "verification": event.verification,
        "deadline": event.deadline,
        "event_start": event.event_start,
        "registration_url": event.registration_url,
    }


@app.post("/api/admin/discovery/{candidate_id}/reject", dependencies=[Depends(require_admin)])
def reject_discovery_candidate(
    candidate_id: int, db: Session = Depends(get_db)
):
    candidate = db.get(DiscoveryCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    if candidate.review_status != "Pending review":
        raise HTTPException(409, "This candidate has already been reviewed")

    candidate.review_status = "Rejected"
    candidate.review_note = "Rejected by admin."
    db.commit()
    return {"message": "Candidate rejected.", "candidate_id": candidate.id}
