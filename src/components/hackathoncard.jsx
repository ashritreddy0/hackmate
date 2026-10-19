
import { useState } from "react";
import "./hackathoncard.css";
import "./hackathon-status.css";

const EVENT_STATUSES = [
  "Open",
  "Needs verification",
  "Closed",
  "Cancelled",
];

function formatDate(value) {
  if (!value) return "Not confirmed";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not confirmed";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getSourceInfo(item) {
  const date = item.verifiedOn
    ? new Date(`${item.verifiedOn}T00:00:00`)
    : null;

  const age =
    date && !Number.isNaN(date.getTime())
      ? Math.floor((Date.now() - date.getTime()) / 86400000)
      : null;

  return {
    age,
    needsRecheck: age === null || age > 7,
    label:
      item.verification === "official-source"
        ? "Event-specific page"
        : "Third-party directory",
  };
}

function HackathonCard({
  hackathon,
  isSaved,
  isTracked,
  onToggleSave,
  onToggleTrack,
  status,
  onStatusChange,
  onUpdateEvent,
}) {
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    deadline: hackathon.deadline || "",
    eventStart: hackathon.eventStart || "",
    eventEnd: hackathon.eventEnd || "",
    registrationUrl: hackathon.registrationUrl || "",
    eventUrl: hackathon.eventUrl || "",
    organizer: hackathon.organizer || "",
  });

  const source = getSourceInfo(hackathon);

  const deadline = hackathon.deadline
    ? new Date(`${hackathon.deadline}T23:59:59`)
    : null;

  const isExpired =
    deadline && !Number.isNaN(deadline.getTime()) && deadline < new Date();

  const statusClass =
    status === "Open"
      ? "status-open"
      : status === "Closed"
        ? "status-closed"
        : status === "Cancelled"
          ? "status-cancelled"
          : "status-review";

  const eventUrl =
    hackathon.registrationUrl ||
    hackathon.eventUrl ||
    hackathon.platformUrl ||
    "";

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEditing() {
    setForm({
      deadline: hackathon.deadline || "",
      eventStart: hackathon.eventStart || "",
      eventEnd: hackathon.eventEnd || "",
      registrationUrl: hackathon.registrationUrl || "",
      eventUrl: hackathon.eventUrl || "",
      organizer: hackathon.organizer || "",
    });
    setFormError("");
    setEditing(true);
  }

  function saveEdits(event) {
    event.preventDefault();
    setFormError("");

    for (const field of ["registrationUrl", "eventUrl"]) {
      const value = form[field].trim();

      if (value && !/^https?:\/\/\S+$/i.test(value)) {
        setFormError(
          `${field === "eventUrl" ? "Event page" : "Registration"} URL must start with http:// or https://.`
        );
        return;
      }
    }

    if (
      form.eventStart &&
      form.eventEnd &&
      form.eventEnd < form.eventStart
    ) {
      setFormError("The event end date cannot be earlier than its start date.");
      return;
    }

    onUpdateEvent(hackathon.id, {
      ...form,
      organizer: form.organizer.trim() || hackathon.organizer,
    });

    setEditing(false);
  }

  return (
    <article className="hackathon-card">
      <div className="hackathon-card-top">
        <span
          className={`verification-badge ${
            source.needsRecheck
              ? "directory"
              : hackathon.verification === "official-source"
                ? "verified"
                : "directory"
          }`}
        >
          {source.label}
        </span>

        <button
          type="button"
          className={`save-button ${isSaved ? "is-active" : ""}`}
          onClick={() => onToggleSave(hackathon.id)}
        >
          {isSaved ? "♥ Saved" : "♡ Save"}
        </button>
      </div>

      <div className="hackathon-tags">
        <span>{hackathon.category}</span>
        <span>{hackathon.format}</span>
        {isExpired && <span className="expired-badge">Deadline passed</span>}
      </div>

      <h3>{hackathon.title}</h3>
      <p className="hackathon-organizer">{hackathon.organizer}</p>
      <p className="hackathon-description">{hackathon.description}</p>

      <div className="hackathon-details">
        <div>
          <span className="detail-label">Location</span>
          <span>{hackathon.location || "Not specified"}</span>
        </div>
        <div>
          <span className="detail-label">Eligibility</span>
          <span>{hackathon.eligibility || "Check event rules"}</span>
        </div>
        <div>
          <span className="detail-label">Registration deadline</span>
          <span>
            {!hackathon.deadline
              ? "Not confirmed"
              : isExpired
                ? `Passed — ${formatDate(hackathon.deadline)}`
                : formatDate(hackathon.deadline)}
          </span>
        </div>
        <div>
          <span className="detail-label">Event dates</span>
          <span>
            {formatDate(hackathon.eventStart)}
            {hackathon.eventEnd &&
              hackathon.eventEnd !== hackathon.eventStart &&
              ` – ${formatDate(hackathon.eventEnd)}`}
          </span>
        </div>
      </div>

      <section className="event-status-panel">
        <div className="event-status-heading">
          <span className="detail-label">Registration status</span>
          <span className={`event-status-pill ${statusClass}`}>{status}</span>
        </div>

        <label
          className="event-status-select-label"
          htmlFor={`status-${hackathon.id}`}
        >
          Update status
        </label>

        <select
          id={`status-${hackathon.id}`}
          className="event-status-select"
          value={status}
          onChange={(event) =>
            onStatusChange(hackathon.id, event.target.value)
          }
        >
          {EVENT_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="status-help-button"
          onClick={() => setShowStatusHelp((value) => !value)}
        >
          {showStatusHelp
            ? "Hide status guide"
            : "What do these statuses mean?"}
        </button>

        {showStatusHelp && (
          <p className="status-help-text">
            Open means you believe registration is open. Needs verification
            means you should check the event page. Closed means registration
            is closed. Cancelled means you believe the event was cancelled.
            These are your notes, not live checks.
          </p>
        )}
      </section>

      <div
        className={`source-check-panel ${
          source.needsRecheck ? "source-check-stale" : ""
        }`}
      >
        <strong>
          {source.needsRecheck
            ? "⚠ Recheck this listing"
            : "Source check recorded"}
        </strong>
        <div>Source: {source.label}</div>
        <div>
          Last checked: {formatDate(hackathon.verifiedOn)}
          {source.age !== null && ` (${Math.max(0, source.age)} days ago)`}
        </div>
        <div>
          {source.needsRecheck
            ? "The check date is missing or older than 7 days. Confirm the event details."
            : "A recorded check does not guarantee that details are still current."}
        </div>
      </div>

      <div className="event-edit-actions">
        <button
          type="button"
          className="edit-event-button"
          onClick={startEditing}
        >
          ✎ Edit event details
        </button>
      </div>

      {editing && (
        <form className="event-edit-form" onSubmit={saveEdits}>
          <h4>Edit event details</h4>
          <p>Changes are saved in this browser and do not update the organizer's website.</p>

          <label>
            Organizer
            <input
              value={form.organizer}
              onChange={(event) => updateField("organizer", event.target.value)}
              maxLength={120}
            />
          </label>

          <label>
            Registration deadline
            <input
              type="date"
              value={form.deadline}
              onChange={(event) => updateField("deadline", event.target.value)}
            />
          </label>

          <label>
            Event start date
            <input
              type="date"
              value={form.eventStart}
              onChange={(event) => updateField("eventStart", event.target.value)}
            />
          </label>

          <label>
            Event end date
            <input
              type="date"
              value={form.eventEnd}
              onChange={(event) => updateField("eventEnd", event.target.value)}
            />
          </label>

          <label>
            Registration URL
            <input
              type="url"
              placeholder="https://..."
              value={form.registrationUrl}
              onChange={(event) =>
                updateField("registrationUrl", event.target.value)
              }
            />
          </label>

          <label>
            Event page URL
            <input
              type="url"
              placeholder="https://..."
              value={form.eventUrl}
              onChange={(event) => updateField("eventUrl", event.target.value)}
            />
          </label>

          {formError && (
            <p className="event-edit-error" role="alert">
              {formError}
            </p>
          )}

          <div className="event-edit-form-actions">
            <button type="submit" className="edit-save-button">
              Save changes
            </button>
            <button
              type="button"
              className="edit-cancel-button"
              onClick={() => {
                setEditing(false);
                setFormError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="hackathon-card-actions">
        <button
          type="button"
          className={`track-button ${isTracked ? "is-active" : ""}`}
          onClick={() => onToggleTrack(hackathon.id)}
        >
          {isTracked ? "✓ In my list" : "+ Add to my list"}
        </button>

        {eventUrl && (
          <a
            className="explore-button"
            href={eventUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View event ↗
          </a>
        )}
      </div>

      {!hackathon.registrationUrl && (
        <p className="registration-note">
          Direct registration link not confirmed. Check the event page before
          applying.
        </p>
      )}
    </article>
  );
}

export default HackathonCard;
