
import { useEffect, useMemo, useRef, useState } from "react";
import hackathons from "./assets/data/hackathons.js";
import HackathonCard from "./components/hackathoncard.jsx";
import "./App.css";

const API_URL = "https://hackmate-uzrm.onrender.com/api/hackathons";
const ADMIN_URL = "https://hackmate-uzrm.onrender.com/api/admin/discovery";

const SKILLS = [
  "Python", "Java", "C / C++", "Web Development", "AI / Machine Learning",
  "Cloud / DevOps", "UI / UX Design", "Cybersecurity",
  "Mobile Development", "Beginner — still learning",
];

const INTERESTS = [
  "AI / Machine Learning", "Web / App Development", "Cloud / DevOps",
  "Social Impact", "Cybersecurity", "Open Innovation", "Design",
  "Healthcare", "Education", "Sustainability",
];

const DEFAULT_PROFILE = {
  skills: [],
  interests: [],
  level: "Beginner",
  format: "Both",
  goal: "Learn new skills",
  location: "India",
};

function normalize(item) {
  return {
    ...item,
    id: item.id ?? item.event_id,
    eventUrl: item.eventUrl ?? item.event_url,
    platformUrl: item.platformUrl ?? item.platform_url,
    registrationUrl: item.registrationUrl ?? item.registration_url,
    eventStart: item.eventStart ?? item.event_start,
    eventEnd: item.eventEnd ?? item.event_end,
    verifiedOn: item.verifiedOn ?? item.verified_on,
    isSample: item.isSample ?? item.is_sample,
  };
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The application remains usable if browser storage is unavailable.
  }
}

function dateValue(value) {
  if (!value) return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function isFutureOrUnknown(value) {
  const date = dateValue(value);
  return !date || date >= new Date();
}

function eventDeadline(event) {
  return event.deadline || event.registration_deadline || null;
}

function eventStart(event) {
  return event.eventStart || event.event_start || event.start_date || null;
}

function eventStatus(event) {
  return String(event.managementStatus || event.status || "Needs verification");
}

function eventUrl(event) {
  return event.registrationUrl || event.registration_url ||
    event.eventUrl || event.event_url || event.platformUrl ||
    event.platform_url || "";
}

function isClosed(event) {
  const status = eventStatus(event).toLowerCase();
  const deadline = dateValue(eventDeadline(event));
  const start = dateValue(eventStart(event));

  return (
    ["closed", "cancelled", "expired", "completed"].some((word) =>
      status.includes(word)
    ) ||
    (deadline && deadline < new Date()) ||
    (!deadline && start && start < new Date())
  );
}

function matchScore(event, profile) {
  const searchable = [
    event.title,
    event.organizer,
    event.description,
    event.category,
    event.platform,
    event.eligibility,
    event.level,
    event.format,
    event.location,
  ].filter(Boolean).join(" ").toLowerCase();

  let score = 0;
  let possible = 0;
  const reasons = [];

  const skillMatches = profile.skills.filter((skill) => {
    if (skill === "Beginner — still learning") {
      return /beginner|student|all levels|novice|first.time/i.test(searchable);
    }
    const terms = skill.toLowerCase().split(/[ /]+/).filter(Boolean);
    return terms.some((term) => term.length > 2 && searchable.includes(term));
  });

  if (profile.skills.length) {
    possible += 35;
    score += 35 * (skillMatches.length / profile.skills.length);
    if (skillMatches.length) {
      reasons.push(`Matches ${skillMatches.slice(0, 3).join(", ")}`);
    }
  }

  const interestMatches = profile.interests.filter((interest) => {
    const terms = interest.toLowerCase().split(/[ /]+/).filter(Boolean);
    return terms.some((term) => term.length > 2 && searchable.includes(term));
  });

  if (profile.interests.length) {
    possible += 30;
    score += 30 * (interestMatches.length / profile.interests.length);
    if (interestMatches.length) {
      reasons.push(`Relevant to ${interestMatches.slice(0, 2).join(", ")}`);
    }
  }

  possible += 15;
  const level = String(event.level || event.eligibility || "").toLowerCase();
  if (
    profile.level === "Beginner"
      ? /beginner|student|all levels|novice|open to all/i.test(level) ||
        !level
      : profile.level === "Intermediate"
        ? /intermediate|all levels|student|open to all/i.test(level) || !level
        : /advanced|professional|all levels|open to all/i.test(level) || !level
  ) {
    score += 15;
    reasons.push(`Suitable for ${profile.level.toLowerCase()} experience`);
  }

  possible += 10;
  const format = String(event.format || "").toLowerCase();
  if (
    profile.format === "Both" ||
    !format ||
    (profile.format === "Online" && /online|virtual|remote|hybrid/i.test(format)) ||
    (profile.format === "Offline" && /offline|in.person|onsite|hybrid/i.test(format))
  ) {
    score += 10;
    reasons.push("Fits your preferred format");
  }

  possible += 10;
  const goalText = {
    "Learn new skills": /workshop|mentor|learn|beginner|training/i,
    "Build my portfolio": /project|build|prototype|showcase|demo/i,
    "Win prizes": /prize|award|winner|cash|competition/i,
    "Meet teammates": /team|network|community|collaborat/i,
    "Improve internship chances": /career|industry|recruit|internship|mentor/i,
  }[profile.goal] || "";

  if (!goalText || goalText.test(searchable)) {
    score += 10;
    reasons.push(`Supports your goal: ${profile.goal.toLowerCase()}`);
  }

  return {
    score: possible ? Math.round((score / possible) * 100) : 0,
    reasons: reasons.length ? reasons : ["A possible opportunity worth reviewing"],
  };
}

export default function App() {
  const [signalSeed, setSignalSeed] = useState(0);
  const [orbitAngle, setOrbitAngle] = useState(0);
  const [orbitTilt, setOrbitTilt] = useState(0);
  const [orbitScale, setOrbitScale] = useState(1);
  const mindsets = [
    { tag: "BRAIN HACK 01 · THE ZEIGARNIK EFFECT", title: "Your brain hates — an unfinished loop.", line: "A task feels less scary once it has a first step. Don’t plan the whole startup; write the one-sentence problem you want to solve.", prompt: "Take 20 seconds: describe a problem you’ve noticed.", action: "START SMALL", icon: "◔" },
    { tag: "BRAIN HACK 02 · THE CURIOSITY GAP", title: "A question beats — another tutorial.", line: "Curiosity gives you a reason to learn. Pick a problem you genuinely want answered, then let the tech stack follow.", prompt: "What annoys you enough to build a fix for it?", action: "GET CURIOUS", icon: "?" },
    { tag: "BRAIN HACK 03 · THE IKEA EFFECT", title: "You care more — when you make it.", line: "A rough prototype you built teaches you more than a perfect idea you keep polishing in your head. Make something you can show.", prompt: "Build the ugliest useful first version.", action: "MAKE A THING", icon: "↗" },
    { tag: "BRAIN HACK 04 · SOCIAL PROOF, BUT USEFUL", title: "Find your people. — Borrow their momentum.", line: "A teammate can turn “someday” into a calendar invite. You don’t need a huge network; one curious person is enough.", prompt: "Message one person: “Want to build something this weekend?”", action: "FIND A TEAM", icon: "⌘" },
    { tag: "BRAIN HACK 05 · THE FRESH-START EFFECT", title: "You can start — before you feel ready.", line: "Motivation often shows up after you begin, not before. Give yourself a tiny 10-minute start and stop when the timer ends if you want.", prompt: "Open a blank file. Give it ten minutes.", action: "BEGIN ANYWAY", icon: "⚡" },
  ];
  const [cursorMode, setCursorMode] = useState(() => {
    try { return localStorage.getItem("hackmate-cursor-mode") || "ambient"; } catch { return "ambient"; }
  });
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("hackmate-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const timer = window.setInterval(() => setSignalSeed((seed) => (seed + 1) % 5), 6500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.cursorMode = cursorMode;
    try { localStorage.setItem("hackmate-cursor-mode", cursorMode); } catch {}
  }, [cursorMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("hackmate-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return undefined;

    const root = document.documentElement;
    let frame = 0;
    const interactiveSelector = [
      ".hackathon-card", ".category-chip", ".value-strip-stat", ".guide-steps > div",
      ".primary-button", ".explore-button", ".nav-link", ".search-box",
      ".personalization select", ".personalization input", ".sort-control select",
      "button", "a", "input", "select", "textarea", "[role='button']"
    ].join(",");
    const updatePointer = (event) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--cursor-x", `${event.clientX}px`);
        root.style.setProperty("--cursor-y", `${event.clientY}px`);
        const onElement = Boolean(event.target?.closest?.(interactiveSelector));
        root.dataset.pointerOnElement = String(onElement);
        root.dataset.backgroundGlow = !onElement && cursorMode !== "off" ? "true" : "false";
      });
    };
    const onPointerDown = (event) => {
      if (event.target?.closest?.(interactiveSelector) || cursorMode !== "interactive") return;
      root.style.setProperty("--ripple-x", `${event.clientX}px`);
      root.style.setProperty("--ripple-y", `${event.clientY}px`);
      root.dataset.ripple = "false";
      requestAnimationFrame(() => { root.dataset.ripple = "true"; });
    };
    const clearPointer = () => {
      root.dataset.backgroundGlow = "false";
      root.dataset.pointerOnElement = "false";
    };
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerleave", clearPointer);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerleave", clearPointer);
      delete root.dataset.backgroundGlow;
      delete root.dataset.pointerOnElement;
      delete root.dataset.ripple;
      root.style.removeProperty("--ripple-x");
      root.style.removeProperty("--ripple-y");
      root.style.removeProperty("--cursor-x");
      root.style.removeProperty("--cursor-y");
    };
  }, [cursorMode]);

  const [activeTab, setActiveTab] = useState("Discover");
  const [events, setEvents] = useState(hackathons.map(normalize));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);
  const [category, setCategory] = useState("All");
  const [formatFilter, setFormatFilter] = useState("All");
  const [sortBy, setSortBy] = useState("deadline");

  const [saved, setSaved] = useState(() => readStorage("hackmate-saved", []));
  const [tracked, setTracked] = useState(() => readStorage("hackmate-tracked", []));
  const [statuses, setStatuses] = useState(() =>
    readStorage("hackmate-event-statuses", {})
  );
  const [edits, setEdits] = useState(() =>
    readStorage("hackmate-event-edits", {})
  );

  const [profile, setProfile] = useState(() =>
    readStorage("hackmate-profile", DEFAULT_PROFILE)
  );
  const [draftProfile, setDraftProfile] = useState(profile);
  const [showProfile, setShowProfile] = useState(true);
  const [recommendationsReady, setRecommendationsReady] = useState(false);

  const [queue, setQueue] = useState([]);
  const [reviewFilter, setReviewFilter] = useState("Pending review");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Unexpected API response");

       if (!cancelled) {
  setEvents(
    data.length > 0
      ? data.map(normalize)
      : hackathons.map(normalize)
  );
}
      } catch (err) {
        if (!cancelled) {
          setError(`Could not load hackathons from the backend: ${err.message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvents();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => saveStorage("hackmate-saved", saved), [saved]);
  useEffect(() => saveStorage("hackmate-tracked", tracked), [tracked]);
  useEffect(() => saveStorage("hackmate-event-statuses", statuses), [statuses]);
  useEffect(() => saveStorage("hackmate-event-edits", edits), [edits]);
  useEffect(() => saveStorage("hackmate-profile", profile), [profile]);
  useEffect(() => {
    function handleShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveTab("Discover");
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearch("");
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);


  const mergedEvents = useMemo(() => {
    const byId = new Map();

    for (const event of events) {
      const item = normalize(event);
      byId.set(String(item.id), {
        ...item,
        ...(edits[item.id] || {}),
        managementStatus: statuses[item.id] || item.status || "Needs verification",
      });
    }

    return [...byId.values()];
  }, [events, edits, statuses]);

  const categories = useMemo(
    () => ["All", ...new Set(mergedEvents.map((event) => event.category).filter(Boolean))],
    [mergedEvents]
  );

  const formats = useMemo(
    () => ["All", ...new Set(mergedEvents.map((event) => event.format).filter(Boolean))],
    [mergedEvents]
  );

  const recommendedEvents = useMemo(() => {
    return mergedEvents
      .filter((event) => !isClosed(event))
      .map((event) => ({ event, ...matchScore(event, profile) }))
      .sort((a, b) => b.score - a.score);
  }, [mergedEvents, profile]);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    let result = mergedEvents.filter((event) => {
      if (activeTab === "Saved" && !saved.includes(event.id)) return false;
      if (activeTab === "My List" && !tracked.includes(event.id)) return false;
      if (category !== "All" && event.category !== category) return false;
      if (formatFilter !== "All" && event.format !== formatFilter) return false;

      const searchable = [
        event.title, event.organizer, event.location, event.category,
        event.description, event.platform,
      ].filter(Boolean).join(" ").toLowerCase();

      return !query || searchable.includes(query);
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "name") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }

      const field = sortBy === "eventDate" ? eventStart : eventDeadline;
      const dateA = dateValue(field(a))?.getTime() ?? Infinity;
      const dateB = dateValue(field(b))?.getTime() ?? Infinity;
      return dateA - dateB;
    });

    return result;
  }, [mergedEvents, activeTab, saved, tracked, category, formatFilter, search, sortBy]);

  function toggleList(setter, id) {
    setter((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  async function updateEvent(id, changes) {
    const fieldMap = {
      eventStart: "event_start",
      eventEnd: "event_end",
      eventUrl: "event_url",
      registrationUrl: "registration_url",
    };

    const payload = {};
    for (const [key, value] of Object.entries(changes)) {
      payload[fieldMap[key] || key] =
        value === "" && ["deadline", "eventStart", "eventEnd"].includes(key)
          ? null
          : value;
    }

    const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.detail || `Save failed (${response.status})`);
    }

    const updated = normalize(result);
    setEvents((current) =>
      current.map((item) => String(item.id) === String(id) ? updated : item)
    );
    setEdits((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), ...changes },
    }));

    return updated;
  }

  function changeStatus(id, status) {
    setStatuses((current) => ({ ...current, [id]: status }));
    updateEvent(id, { status }).catch((err) => {
      setError(`Could not save status: ${err.message}`);
    });
  }

  function updateProfileField(field, value) {
    setDraftProfile((current) => ({ ...current, [field]: value }));
  }

  function toggleProfileChoice(field, value) {
    setDraftProfile((current) => {
      const list = current[field] || [];
      return {
        ...current,
        [field]: list.includes(value)
          ? list.filter((item) => item !== value)
          : [...list, value],
      };
    });
  }

  function saveProfile(event) {
    event.preventDefault();
    setProfile(draftProfile);
    setRecommendationsReady(true);
    setShowProfile(false);
  }

  async function loadQueue(status = reviewFilter) {
    setAdminLoading(true);
    setAdminError("");
    try {
      const response = await fetch(
        `${ADMIN_URL}/queue?review_status=${encodeURIComponent(status)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
      setQueue(Array.isArray(data) ? data : []);
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  }

  async function scanEvents() {
    setAdminLoading(true);
    setAdminError("");
    setAdminMessage("");
    try {
      const response = await fetch(`${ADMIN_URL}/scan`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
      setAdminMessage(data.message || "Scan completed.");
      await loadQueue(reviewFilter);
    } catch (err) {
      setAdminError(`Scan failed: ${err.message}`);
    } finally {
      setAdminLoading(false);
    }
  }

  async function reviewCandidate(candidate, action) {
    const id = candidate.id ?? candidate.candidate_id;
    setAdminLoading(true);
    setAdminError("");
    setAdminMessage("");
    try {
      const response = await fetch(
        `${ADMIN_URL}/${encodeURIComponent(id)}/${action}`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);

      setAdminMessage(
        data.message || (action === "approve" ? "Candidate approved." : "Candidate rejected.")
      );
      await loadQueue(reviewFilter);

      if (action === "approve") {
        const eventsResponse = await fetch(API_URL);
        if (eventsResponse.ok) {
          const latest = await eventsResponse.json();
          if (Array.isArray(latest)) setEvents(latest.map(normalize));
        }
      }
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "Admin Discovery") loadQueue(reviewFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reviewFilter]);

  const tabs = ["Discover", "Saved", "My List", "Admin Discovery"];

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="HackMate home" onClick={() => setActiveTab("Discover")}>
          <span className="brand-icon">H</span>
          <span>HackMate</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`nav-link ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
        <label className="cursor-mode-control" title="Choose how the background responds to your cursor">
          <span aria-hidden="true">✳</span>
          <select aria-label="Background interaction" value={cursorMode} onChange={(event) => setCursorMode(event.target.value)}>
            <option value="off">Glow off</option>
            <option value="ambient">Ambient</option>
            <option value="interactive">Play mode</option>
          </select>
        </label>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </header>

      {activeTab === "Admin Discovery" ? (
        <main className="admin-discovery">
          <span className="eyebrow">ADMIN TOOLS</span>
          <h1>Hackathon Discovery Queue</h1>
          <p>Review potential events before adding them to HackMate.</p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "22px 0" }}>
            <button className="primary-button" onClick={scanEvents} disabled={adminLoading}>
              {adminLoading ? "Working…" : "🔎 Scan for hackathons"}
            </button>

            <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}>
              <option>Pending review</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>

            <button onClick={() => loadQueue()} disabled={adminLoading}>Refresh queue</button>
          </div>

          {adminMessage && <p role="status">{adminMessage}</p>}
          {adminError && <p role="alert" style={{ color: "#b42318" }}>{adminError}</p>}

          {queue.map((candidate) => (
            <article key={candidate.id ?? candidate.candidate_id ?? candidate.url}
              style={{ padding: 20, margin: "16px 0", border: "1px solid #e0e5ef", borderRadius: 14, background: "#fff" }}>
              <h3>{candidate.title || "Untitled candidate"}</h3>
              <a href={candidate.url || candidate.source_url} target="_blank" rel="noreferrer">
                {candidate.url || candidate.source_url}
              </a>
              <p>{candidate.snippet}</p>
              <p>Review status: {candidate.review_status || reviewFilter}</p>

              {reviewFilter === "Pending review" && (
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button disabled={adminLoading} onClick={() => reviewCandidate(candidate, "approve")}>
                    Approve &amp; add
                  </button>
                  <button disabled={adminLoading} onClick={() => reviewCandidate(candidate, "reject")}>
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}

          {!adminLoading && queue.length === 0 && <p>No candidates in this queue yet.</p>}
          <p style={{ fontSize: 12, color: "#667085" }}>
            Verify event dates, registration links and eligibility before marking an event open.
            This prototype admin page is not protected by login.
          </p>
        </main>
      ) : (
        <main>
          <section className="hero-section" aria-labelledby="hero-title">
            <div className="hero-content">
              <span className="eyebrow">YOUR NEXT BIG IDEA STARTS HERE</span>
              <h1 id="hero-title">Find your next <span>hackathon.</span></h1>
              <p>Discover events that fit your skills, interests, experience and goals.</p>
              <button className="primary-button" onClick={() => {
                setActiveTab("Discover");
                document.getElementById("recommendations")?.scrollIntoView({ behavior: "smooth" });
              }}>
                Find my matches <span>→</span>
              </button>
            </div>
          </section>

          <section className="value-strip" aria-label="Why use HackMate">
            <div className="value-strip-stat">
              <span className="value-strip-icon">✦</span>
              <div><strong>{mergedEvents.length}</strong><span>opportunities to explore</span></div>
            </div>
            <div className="value-strip-stat">
              <span className="value-strip-icon">⌕</span>
              <div><strong>One search</strong><span>multiple event platforms</span></div>
            </div>
            <div className="value-strip-stat">
              <span className="value-strip-icon">↗</span>
              <div><strong>Your next step</strong><span>save, track and compare</span></div>
            </div>
          </section>

          <section className="hackmate-signal" aria-label="HackMate rotating builder mindset">
            <div className="mindset-topbar">
              <span><i className="mindset-status-dot" /> HACKMATE FIELD NOTES</span>
              <span>SMALL PSYCHOLOGY. REAL PROGRESS.</span>
            </div>
            <div className="mindset-content" aria-live="polite">
              <div className="mindset-index"><span>A LITTLE NUDGE FOR YOUR BUILDER BRAIN</span><span>ROTATING NOTE · 0{signalSeed + 1}/05</span></div>
              <div className="mindset-main" key={signalSeed}>
                <span className="mindset-tag">{mindsets[signalSeed].tag}</span>
                <h2>{mindsets[signalSeed].title.split(" — ").map((part, index) => <span key={part}>{index > 0 && <br />}{part}</span>)}</h2>
                <p>{mindsets[signalSeed].line}</p>
                <div className="mindset-prompt"><span>YOUR SIDE QUEST</span><strong>{mindsets[signalSeed].prompt}</strong></div>
              </div>
              <div className="mindset-art" aria-label="Interactive orbit. Drag or swipe to rotate the rings in any direction; use the wheel to tilt them.">
                <div className="orbit-playfield"
                  onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = "true"; event.currentTarget.dataset.lastX = String(event.clientX); event.currentTarget.dataset.lastY = String(event.clientY); }}
                  onPointerMove={(event) => { if (event.currentTarget.dataset.dragging !== "true") return; const lastX = Number(event.currentTarget.dataset.lastX || event.clientX); const lastY = Number(event.currentTarget.dataset.lastY || event.clientY); const dx = event.clientX - lastX; const dy = event.clientY - lastY; setOrbitAngle((angle) => angle + dx * 1.1 + dy * .35); setOrbitTilt((tilt) => Math.max(-75, Math.min(75, tilt + dy * .7))); event.currentTarget.dataset.lastX = String(event.clientX); event.currentTarget.dataset.lastY = String(event.clientY); }}
                  onPointerUp={(event) => { event.currentTarget.dataset.dragging = "false"; }}
                  onPointerCancel={(event) => { event.currentTarget.dataset.dragging = "false"; }}
                  onWheel={(event) => { setOrbitTilt((tilt) => Math.max(-75, Math.min(75, tilt + event.deltaY * .08))); setOrbitScale((scale) => Math.max(.65, Math.min(1.55, scale - event.deltaY * .001))); }}
                  onDoubleClick={() => { setOrbitAngle(0); setOrbitTilt(0); setOrbitScale(1); }}
                  role="application" tabIndex={0}
                  onKeyDown={(event) => { if (event.key === "ArrowLeft") setOrbitAngle((angle) => angle - 12); if (event.key === "ArrowRight") setOrbitAngle((angle) => angle + 12); if (event.key === "ArrowUp") setOrbitTilt((tilt) => Math.max(-75, tilt - 8)); if (event.key === "ArrowDown") setOrbitTilt((tilt) => Math.min(75, tilt + 8)); if (event.key === "Home") { setOrbitAngle(0); setOrbitTilt(0); setOrbitScale(1); } }}
                  style={{ "--orbit-angle": `${orbitAngle}deg`, "--orbit-tilt": `${orbitTilt}deg`, "--orbit-scale": orbitScale }}>
                  <div className="orbit-auto-spin">
                    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                  </div>
                  <div className="art-core"><span>{mindsets[signalSeed].icon}</span></div>
                  <div className="orbit-hint">DRAG TO DEFY GRAVITY · DOUBLE-CLICK TO RESET</div>
                </div>
                <div className="art-label art-label-top">{mindsets[signalSeed].action} → PROTOTYPE</div>
                <div className="art-label art-label-bottom">PROCRASTINATION.exe <b>STOPPED</b></div>
                <div className="art-spark spark-one" /><div className="art-spark spark-two" /><div className="art-spark spark-three" />
              </div>
            </div>
            <div className="mindset-footer"><span>NO NEED TO FEEL READY. JUST MAKE THE NEXT MOVE.</span><button type="button" onClick={() => setSignalSeed((seed) => (seed + 1) % 5)}>Give me another nudge <span>↗</span></button></div>
          </section>

          {error && <div className="expiry-notice" role="alert">{error}</div>}
          {loading && <p role="status">Loading hackathons from your database…</p>}

          {activeTab === "Discover" && (
            <section className="personalization" id="recommendations"
              style={{ margin: "24px 0 36px", padding: 26, border: "1px solid #e1e7f3", borderRadius: 18, background: "#fff" }}>
              <span className="eyebrow">PERSONALIZED FOR YOU</span>
              <h2 style={{ margin: "8px 0" }}>Find hackathons made for you</h2>
              <p style={{ color: "#667085", marginTop: 0 }}>
                Tell us what you know and what you want to achieve. HackMate will rank suitable events from its database.
              </p>

              {showProfile ? (
                <form onSubmit={saveProfile}>
                  <h3>1. What skills do you have?</h3>
                  <div className="category-row">
                    {SKILLS.map((skill) => (
                      <button key={skill} type="button"
                        className={`category-chip ${draftProfile.skills.includes(skill) ? "selected" : ""}`}
                        onClick={() => toggleProfileChoice("skills", skill)}>
                        {skill}
                      </button>
                    ))}
                  </div>

                  <h3 style={{ marginTop: 24 }}>2. What interests you?</h3>
                  <div className="category-row">
                    {INTERESTS.map((interest) => (
                      <button key={interest} type="button"
                        className={`category-chip ${draftProfile.interests.includes(interest) ? "selected" : ""}`}
                        onClick={() => toggleProfileChoice("interests", interest)}>
                        {interest}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 18, marginTop: 24 }}>
                    <label>
                      <strong>3. Experience level</strong>
                      <select style={{ display: "block", width: "100%", marginTop: 8, padding: 11 }}
                        value={draftProfile.level} onChange={(e) => updateProfileField("level", e.target.value)}>
                        <option>Beginner</option>
                        <option>Intermediate</option>
                        <option>Advanced</option>
                      </select>
                    </label>

                    <label>
                      <strong>4. Preferred format</strong>
                      <select style={{ display: "block", width: "100%", marginTop: 8, padding: 11 }}
                        value={draftProfile.format} onChange={(e) => updateProfileField("format", e.target.value)}>
                        <option>Both</option>
                        <option>Online</option>
                        <option>Offline</option>
                      </select>
                    </label>

                    <label>
                      <strong>5. Main goal</strong>
                      <select style={{ display: "block", width: "100%", marginTop: 8, padding: 11 }}
                        value={draftProfile.goal} onChange={(e) => updateProfileField("goal", e.target.value)}>
                        <option>Learn new skills</option>
                        <option>Build my portfolio</option>
                        <option>Win prizes</option>
                        <option>Meet teammates</option>
                        <option>Improve internship chances</option>
                      </select>
                    </label>

                    <label>
                      <strong>6. Country / preferred location</strong>
                      <input style={{ display: "block", width: "100%", marginTop: 8, padding: 11 }}
                        value={draftProfile.location}
                        onChange={(e) => updateProfileField("location", e.target.value)}
                        placeholder="e.g. India" />
                    </label>
                  </div>

                  <button className="primary-button" type="submit" style={{ marginTop: 24 }}>
                    Recommend my hackathons →
                  </button>
                </form>
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <p style={{ margin: 0 }}>Your profile is saved on this browser.</p>
                  <button onClick={() => { setDraftProfile(profile); setShowProfile(true); }}>
                    Edit my profile
                  </button>
                </div>
              )}

              {recommendationsReady && !showProfile && (
                <div style={{ marginTop: 28 }}>
                  <h3>Your best matches</h3>
                  <p style={{ color: "#667085" }}>
                    Scores show profile fit, not your probability of winning. Event details and availability still need checking.
                  </p>

                  {recommendedEvents.length === 0 ? (
                    <p>No upcoming or undated events currently match. Try changing your profile or check back after new events are added.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 14 }}>
                      {recommendedEvents.slice(0, 6).map(({ event, score, reasons }) => (
                        <article key={event.id}
                          style={{ padding: 20, border: "1px solid #e1e7f3", borderRadius: 14, background: "#fbfcff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                            <div>
                              <span className="eyebrow">{event.category || "HACKATHON"}</span>
                              <h3 style={{ margin: "6px 0" }}>{event.title}</h3>
                              <p style={{ margin: 0, color: "#667085" }}>
                                {event.organizer || "Organizer not listed"} · {event.format || "Format not specified"} · {event.location || "Location not specified"}
                              </p>
                            </div>
                            <div style={{ minWidth: 100, textAlign: "center", padding: "10px 14px", background: "#eef3ff", borderRadius: 12, alignSelf: "flex-start" }}>
                              <strong style={{ display: "block", fontSize: 25, color: "#315fca" }}>{score}%</strong>
                              <span style={{ fontSize: 11, color: "#315fca" }}>profile match</span>
                            </div>
                          </div>

                          <p style={{ marginBottom: 6 }}>
                            <strong>Why it matches:</strong> {reasons.join(" · ")}
                          </p>
                          <p style={{ color: "#667085", margin: "6px 0" }}>
                            Registration deadline: {eventDeadline(event) || "Not confirmed"}
                          </p>
                          <p style={{ color: "#667085", margin: "6px 0" }}>
                            Event date: {eventStart(event) || "Not confirmed"}
                          </p>
                          <p style={{ color: "#8a5a00", fontSize: 12 }}>
                            Status: {eventStatus(event)} — verify the official event page before applying.
                          </p>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                            {eventUrl(event) ? (
                              <a href={eventUrl(event)} target="_blank" rel="noreferrer"
                                className="primary-button" style={{ marginTop: 0, textDecoration: "none" }}>
                                View event / registration ↗
                              </a>
                            ) : (
                              <span style={{ color: "#667085", fontSize: 12 }}>No official link available yet</span>
                            )}
                            <button onClick={() => toggleList(setSaved, event.id)}>
                              {saved.includes(event.id) ? "★ Saved" : "☆ Save"}
                            </button>
                            <button onClick={() => toggleList(setTracked, event.id)}>
                              {tracked.includes(event.id) ? "✓ In My List" : "+ Add to My List"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="discovery-section" id="discover">
            <div className="section-heading">
              <div>
                <span className="eyebrow">DISCOVER OPPORTUNITIES</span>
                <h2>
                  {activeTab === "Saved" ? "Your saved hackathons" :
                    activeTab === "My List" ? "Your personal list" :
                    "Explore hackathons"}
                </h2>
                <p>Search events and manage your opportunities.</p>
              </div>
            </div>

            <label className="search-box" htmlFor="hackathon-search">
              <span aria-hidden="true">⌕</span>
              <input ref={searchInputRef} id="hackathon-search" type="search" aria-label="Search hackathons" placeholder="Search events, skills, locations, or organizers..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
              {!search && <kbd className="search-shortcut" aria-hidden="true">Ctrl K</kbd>}
              {search && <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setSearch("")}>×</button>}
            </label>

            <div className="filter-group">
              <span className="filter-label">Category</span>
              <div className="category-row">
                {categories.map((item) => (
                  <button type="button" key={item}
                    className={`category-chip ${category === item ? "selected" : ""}`}
                    onClick={() => setCategory(item)}>{item}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Format</span>
              <div className="category-row">
                {formats.map((item) => (
                  <button type="button" key={item}
                    className={`category-chip ${formatFilter === item ? "selected" : ""}`}
                    onClick={() => setFormatFilter(item)}>{item}</button>
                ))}
              </div>
            </div>

            <div className="results-heading">
              <span><strong>{visibleEvents.length}</strong> listings found</span>
              <label className="sort-control">Sort by
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="deadline">Nearest deadline</option>
                  <option value="eventDate">Event date</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>

            {visibleEvents.length ? (
              <div className="hackathon-grid">
                {visibleEvents.map((event) => (
                  <HackathonCard
                    key={event.id}
                    hackathon={event}
                    isSaved={saved.includes(event.id)}
                    isTracked={tracked.includes(event.id)}
                    onToggleSave={toggleList.bind(null, setSaved)}
                    onToggleTrack={toggleList.bind(null, setTracked)}
                    status={event.managementStatus}
                    onStatusChange={changeStatus}
                    onUpdateEvent={updateEvent}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No matching hackathons</h3>
                <p>Try changing your search or filters.</p>
                <button className="reset-button" onClick={() => {
                  setSearch("");
                  setCategory("All");
                  setFormatFilter("All");
                }}>Clear filters</button>
              </div>
            )}
          </section>
        </main>
      )}

      <footer className="footer">
        <a className="brand footer-brand" href="#top">
          <span className="brand-icon">H</span>
          <span>HackMate</span>
        </a>
        <p>Made for the next generation of builders.</p>
        <span>HackMate · Always verify event details</span>
      </footer>
    </div>
  );
}
