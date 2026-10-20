
import asyncio
import re
import xml.etree.ElementTree as ET
from datetime import date
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import httpx
from bs4 import BeautifulSoup


SEARCH_QUERIES = [
    "upcoming hackathons India registration open 2026",
    "India student hackathon 2026 registration",
    "college hackathon India 2026 register",
    "university hackathon India upcoming",
    "engineering college hackathon India 2026",
    "online global hackathons upcoming 2026",
    "online coding hackathon register now 2026",
    "AI machine learning hackathon India 2026",
    "cloud AWS Azure hackathon India 2026",
    "cybersecurity hackathon India 2026",
    "web3 blockchain hackathon India 2026",
    "hardware robotics IoT hackathon India 2026",
    "women in tech student hackathon India 2026",
    "beginner friendly hackathon India students",
    "hackathon Bengaluru Karnataka 2026",
    "hackathon Hyderabad Telangana 2026",
    "hackathon Chennai Tamil Nadu 2026",
    "hackathon Mumbai Pune Maharashtra 2026",
    "hackathon Delhi NCR 2026",
    "hackathon Vijayawada Andhra Pradesh 2026",
    "hackathon Visakhapatnam Andhra Pradesh 2026",
    "hackathon Kerala Kochi Thiruvananthapuram 2026",
    "hackathon Kolkata West Bengal 2026",
    "hackathon Ahmedabad Gujarat 2026",
    "hackathon Jaipur Rajasthan 2026",
    "hackathon Lucknow Uttar Pradesh 2026",
    "hackathon Bhubaneswar Odisha 2026",
    "site:unstop.com hackathon India 2026",
    "site:devfolio.co hackathon India 2026",
    "site:devpost.com hackathon India 2026",
    "site:mlh.io hackathon 2026",
    "site:hack2skill.com hackathon India 2026",
    "site:hackerearth.com/challenges hackathon 2026",
    "site:lu.ma hackathon India 2026"
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
    """Search two independent public result feeds and merge valid event leads."""
    results = []
    errors = []

    # Provider 1: DuckDuckGo HTML results.
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
        body_lower = response.text.lower()
        challenge_markers = (
            "anomaly-modal", "bots use duckduckgo", "select all squares",
            "captcha", "unfortunately, bots",
        )
        if any(marker in body_lower for marker in challenge_markers):
            raise RuntimeError("DuckDuckGo returned an anti-bot challenge")

        soup = BeautifulSoup(response.text, "html.parser")
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
            snippet = snippet_node.get_text(" ", strip=True) if snippet_node else ""
            if url and is_relevant_domain(url) and looks_like_hackathon(title, url, snippet):
                results.append({
                    "title": title, "source_url": url, "snippet": snippet,
                    "source_domain": urlparse(url).hostname,
                    "status": "Needs verification", "review_required": True,
                })
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        errors.append(f"DuckDuckGo: {exc}")

    # Provider 2: Bing RSS is a separate result format and often works when
    # HTML search pages are challenged. It is a fallback, not a guarantee.
    try:
        response = await client.get(
            "https://www.bing.com/search",
            params={"format": "rss", "q": query},
            headers={"User-Agent": "Mozilla/5.0 (compatible; HackMateBot/1.0)"},
        )
        response.raise_for_status()
        root = ET.fromstring(response.content)
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            url = clean_url((item.findtext("link") or "").strip())
            snippet = BeautifulSoup(item.findtext("description") or "", "html.parser").get_text(" ", strip=True)
            if url and is_relevant_domain(url) and looks_like_hackathon(title, url, snippet):
                results.append({
                    "title": title, "source_url": url, "snippet": snippet,
                    "source_domain": urlparse(url).hostname,
                    "status": "Needs verification", "review_required": True,
                })
    except (httpx.HTTPError, ET.ParseError, RuntimeError, ValueError) as exc:
        errors.append(f"Bing RSS: {exc}")

    if not results and len(errors) == 2:
        raise RuntimeError("All search providers failed: " + " | ".join(errors))
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
            "All discovery queries failed across DuckDuckGo and Bing RSS. Check outbound network access or configure a supported search API."
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
