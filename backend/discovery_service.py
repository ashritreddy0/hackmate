
import asyncio
import re
from datetime import date
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import httpx
from bs4 import BeautifulSoup


SEARCH_QUERIES = [
    'upcoming hackathons India registration open',
    'India student hackathon 2026 registration',
    'online global hackathons upcoming',
    'online coding hackathon register now',
    'university hackathon India upcoming',
    'AI machine learning hackathon online',
    'Devpost upcoming hackathons',
    'MLH hackathons upcoming',
]

SEARCH_URL = "https://html.duckduckgo.com/html/"

ALLOWED_DOMAINS = {
    "devpost.com",
    "mlh.io",
    "unstop.com",
    "hackerearth.com",
    "hack2skill.com",
    "devfolio.co",
    "hackathon.com",
    "eventbrite.com",
    "lu.ma",
    "f6s.com",
    "challenge.gov",
}

BLOCKED_DOMAINS = {
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "youtu.be",
    "x.com",
    "twitter.com",
    "reddit.com",
    "google.com",
    "duckduckgo.com",
    "wikipedia.org",
}


def clean_url(url: str) -> str:
    """Normalize a result URL and unwrap DuckDuckGo redirect links."""
    if not url:
        return ""

    url = url.strip()

    if url.startswith("//"):
        url = "https:" + url

    parsed = urlparse(url)

    if "duckduckgo.com" in parsed.netloc:
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        if target:
            url = unquote(target)

    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        return ""

    if not parsed.hostname:
        return ""

    host = parsed.hostname.lower().removeprefix("www.")

    if any(
        host == blocked or host.endswith("." + blocked)
        for blocked in BLOCKED_DOMAINS
    ):
        return ""

    # Remove tracking parameters and URL fragments.
    return parsed._replace(
        netloc=host,
        fragment="",
    ).geturl().rstrip("/")


def is_relevant_domain(url: str) -> bool:
    """Prefer known event platforms without excluding other legitimate sites."""
    host = urlparse(url).hostname or ""
    host = host.lower().removeprefix("www.")

    if any(
        host == blocked or host.endswith("." + blocked)
        for blocked in BLOCKED_DOMAINS
    ):
        return False

    # Search results may lead to university or company event pages too.
    return "." in host


def looks_like_hackathon(title: str, url: str, snippet: str) -> bool:
    text = f"{title} {url} {snippet}".lower()

    keywords = (
        "hackathon",
        "hack-a-thon",
        "hack a thon",
        "coding challenge",
        "buildathon",
        "innovation challenge",
    )

    return any(keyword in text for keyword in keywords)


def looks_expired(title: str, snippet: str) -> bool:
    text = f"{title} {snippet}".lower()

    expired_phrases = (
        "registration closed",
        "event has ended",
        "event ended",
        "past event",
        "results announced",
        "winners announced",
    )

    return any(phrase in text for phrase in expired_phrases)


async def search_one_query(
    client: httpx.AsyncClient,
    query: str,
) -> list[dict]:
    """Collect candidate event pages from one search query."""
    try:
        response = await client.get(
            SEARCH_URL,
            params={"q": query},
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 Chrome/130 Safari/537.36"
                )
            },
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Search request failed for query {query!r}: {exc}") from exc

    body_lower = response.text.lower()
    # DuckDuckGo can return a successful HTTP response containing an anti-bot
    # page instead of results. Count that as a failed query, not a false zero.
    challenge_markers = (
        "anomaly-modal", "bots use duckduckgo", "select all squares",
        "captcha", "unfortunately, bots",
    )
    if any(marker in body_lower for marker in challenge_markers):
        raise RuntimeError(f"Search provider returned an anti-bot challenge for query {query!r}")

    soup = BeautifulSoup(response.text, "html.parser")
    results = []

    for result in soup.select(".result, .web-result, [data-testid='result'], article"):
        link = (
            result.select_one(".result__a")
            or result.select_one("a[data-testid='result-title-a']")
            or result.select_one("a[href]")
        )
        snippet_node = (
            result.select_one(".result__snippet")
            or result.select_one("[data-testid='result-snippet']")
            or result.select_one(".snippet")
            or result.select_one("p")
        )

        if not link:
            continue

        title = link.get_text(" ", strip=True)
        url = clean_url(link.get("href", ""))
        snippet = (
            snippet_node.get_text(" ", strip=True)
            if snippet_node
            else ""
        )

        if not url or not is_relevant_domain(url):
            continue

        if not looks_like_hackathon(title, url, snippet):
            continue

        results.append(
            {
                "title": title,
                "source_url": url,
                "snippet": snippet,
                "source_domain": urlparse(url).hostname,
                "status": "Needs verification",
                "review_required": True,
            }
        )

    return results


async def discover_candidates() -> dict:
    """
    Search for potential hackathon listings.

    This function only discovers candidate links. It does not publish
    events or claim that their dates and registration status are verified.
    """
    today = date.today().isoformat()

    timeout = httpx.Timeout(20.0, connect=10.0)
    limits = httpx.Limits(
        max_connections=5,
        max_keepalive_connections=5,
    )

    async with httpx.AsyncClient(
        timeout=timeout,
        limits=limits,
        follow_redirects=True,
    ) as client:
        batches = await asyncio.gather(
            *[
                search_one_query(client, query)
                for query in SEARCH_QUERIES
            ],
            return_exceptions=True,
        )

    unique = {}
    failed_queries = 0

    for batch in batches:
        if isinstance(batch, Exception):
            failed_queries += 1
            continue

        for candidate in batch:
            url = candidate["source_url"]
            key = url.lower()

            if key not in unique:
                unique[key] = candidate
            else:
                # Preserve extra evidence from a second search result.
                existing = unique[key]
                if not existing["snippet"] and candidate["snippet"]:
                    existing["snippet"] = candidate["snippet"]

    candidates = list(unique.values())

    # Do not report a successful empty scan when every search provider query
    # failed (e.g. an anti-bot challenge or network outage).
    if failed_queries == len(SEARCH_QUERIES):
        raise RuntimeError(
            "All discovery searches failed. The search provider may be blocking "
            "automated requests; try again later or configure a supported search API."
        )

    # Known event platforms are useful leads, but other legitimate
    # university/company pages remain eligible for admin review.
    for candidate in candidates:
        host = candidate["source_domain"] or ""
        host = host.lower().removeprefix("www.")
        candidate["known_event_platform"] = any(
            host == domain or host.endswith("." + domain)
            for domain in ALLOWED_DOMAINS
        )
        candidate["possibly_expired"] = looks_expired(
            candidate["title"],
            candidate["snippet"],
        )

    candidates.sort(
        key=lambda item: (
            item["possibly_expired"],
            not item["known_event_platform"],
            item["title"].lower(),
        )
    )

    return {
        "searched_on": today,
        "search_queries": len(SEARCH_QUERIES),
        "candidate_count": len(candidates),
        "failed_queries": failed_queries,
        "review_required": True,
        "candidates": candidates,
    }
