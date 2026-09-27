import { useState, useEffect, useCallback, useRef } from "react";
import theme from "../library/theme.js";
import * as api from "./api.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COLORS = [
  { value: "#06b6d4", label: "Cyan" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#4ade80", label: "Green" },
  { value: "#ec4899", label: "Pink" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#f97316", label: "Orange" },
];

const RECURRENCE_OPTIONS = [
  { value: null, label: "No repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toISO(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${pad(m)}${period}`;
}

// Get all dates an event spans within a set of month days
function getEventDaysOnGrid(event, year, month) {
  const start = event.start_date;
  const end = event.end_date || event.start_date;
  const days = [];
  const totalDays = daysInMonth(year, month);

  for (let d = 1; d <= totalDays; d++) {
    const iso = toISO(year, month, d);
    if (iso >= start && iso <= end) {
      days.push(d);
    }
  }
  return days;
}

// Sort key for events within a day: all-day first, then by start_time
function eventSortKey(ev) {
  if (ev.all_day || !ev.start_time) return "00:00";
  return ev.start_time;
}

// ---------------------------------------------------------------------------
// Confirm Dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({ title, message, options, onSelect, onCancel }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: theme.zModal + 10, padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        background: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: theme.borderRadius, padding: 24, maxWidth: 380, width: "100%",
      }}>
        <h3 style={{
          fontFamily: theme.fontHeading, fontSize: 17, fontWeight: 700,
          color: theme.heading, margin: "0 0 10px",
        }}>{title}</h3>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: "0 0 20px", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt, i) => (
            <button key={i} onClick={() => onSelect(opt.value)} style={{
              padding: "10px 16px", borderRadius: theme.borderRadiusSm,
              border: `1px solid ${opt.danger ? theme.danger + "40" : theme.border}`,
              background: opt.danger ? theme.danger + "15" : theme.bgSubtle,
              color: opt.danger ? theme.danger : theme.text,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              fontFamily: theme.fontBody, textAlign: "left", transition: "all 0.15s",
            }}>{opt.label}</button>
          ))}
          <button onClick={onCancel} style={{
            padding: "8px 16px", borderRadius: theme.borderRadiusSm, border: "none",
            background: "transparent", color: theme.textDim, fontSize: 12, cursor: "pointer",
            fontFamily: theme.fontBody,
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google Event Detail Modal (read-only)
// ---------------------------------------------------------------------------

function GoogleEventModal({ event, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: theme.zModal, padding: 16,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: theme.borderRadius, padding: 28, maxWidth: 480,
        width: "100%", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
        }}>
          <span style={{ fontSize: 18 }}>🌐</span>
          <span style={{
            fontSize: 11, color: "#3b82f6", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>Google Calendar</span>
        </div>

        <h2 style={{
          fontFamily: theme.fontHeading, fontSize: 20, fontWeight: 700,
          color: theme.heading, margin: "0 0 16px", wordBreak: "break-word",
        }}>{event.title || "(No title)"}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, color: theme.text }}>
          {/* Date/time */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📅</span>
            <span>
              {event.start_date}
              {event.end_date && event.end_date !== event.start_date ? ` → ${event.end_date}` : ""}
              {!event.all_day && event.start_time ? ` · ${formatTime(event.start_time)}` : ""}
              {!event.all_day && event.end_time ? `–${formatTime(event.end_time)}` : ""}
              {event.all_day ? " · All day" : ""}
            </span>
          </div>

          {/* Location */}
          {event.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span>{event.location}</span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div style={{
              marginTop: 4, padding: "12px 14px",
              background: theme.bgSubtle, borderRadius: theme.borderRadiusSm,
              border: `1px solid ${theme.border}`,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontSize: 13, lineHeight: 1.6, color: theme.textMuted,
            }}>
              {event.description}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22 }}>
          {event.google_html_link ? (
            <a href={event.google_html_link} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, color: "#3b82f6", textDecoration: "none",
            }}>Open in Google Calendar ↗</a>
          ) : <span />}
          <button type="button" onClick={onClose} style={{
            padding: "10px 18px", borderRadius: theme.borderRadiusSm,
            border: `1px solid ${theme.border}`, background: theme.bgSubtle,
            color: theme.textMuted, fontSize: 13, cursor: "pointer", fontFamily: theme.fontBody,
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Modal
// ---------------------------------------------------------------------------

function EventModal({ event, occurrenceDate, dateRange, onClose, onSave, onDelete }) {
  // Normalize: backend returns all_day as 0/1, convert to boolean
  const evAllDay = event ? (event.all_day === true || event.all_day === 1) : true;

  const [form, setForm] = useState({
    title: event?.title || "",
    start_date: event?.start_date || dateRange?.start || "",
    end_date: event?.end_date || null,
    start_time: event?.start_time || "",
    end_time: event?.end_time || "",
    all_day: evAllDay,
    color: event?.color || "#06b6d4",
    description: event?.description || "",
    location: event?.location || "",
    recurrence: event?.recurrence || null,
    recurrence_end: event?.recurrence_end || "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = !!event?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.start_date) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      // Clear end_date if same as start (single day)
      if (!payload.end_date || payload.end_date === payload.start_date) payload.end_date = null;
      // Clear time fields if all-day
      if (payload.all_day) {
        payload.start_time = null;
        payload.end_time = null;
      }
      // Clean recurrence_end
      if (!payload.recurrence) payload.recurrence_end = null;
      await onSave(payload);
    } catch (err) {
      setError(err.message || "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", background: theme.bgSubtle,
    border: `1px solid ${theme.border}`, borderRadius: theme.borderRadiusSm,
    color: theme.text, fontSize: 14, fontFamily: theme.fontBody,
    outline: "none", boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 11, color: theme.textDim, textTransform: "uppercase",
    letterSpacing: "0.08em", marginBottom: 6, display: "block",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: theme.zModal, padding: 16,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={{
        background: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: theme.borderRadius, padding: 28, maxWidth: 480,
        width: "100%", maxHeight: "90vh", overflowY: "auto",
      }}>
        <h2 style={{
          fontFamily: theme.fontHeading, fontSize: 20, fontWeight: 700,
          color: theme.heading, margin: "0 0 20px",
        }}>{isEdit ? "Edit Event" : "New Event"}</h2>

        {error && (
          <div style={{
            padding: "10px 14px", marginBottom: 14, borderRadius: theme.borderRadiusSm,
            background: theme.danger + "15", border: `1px solid ${theme.danger}40`,
            color: theme.danger, fontSize: 13,
          }}>⚠️ {error}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input type="text" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Event name" style={inputStyle} autoFocus />
          </div>

          {/* Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Start Date *</label>
              <input type="date" value={form.start_date}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, start_date: val,
                    end_date: form.end_date && form.end_date < val ? val : form.end_date,
                  });
                }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>End Date (optional)</label>
              <input type="date" value={form.end_date || ""}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                min={form.start_date} style={inputStyle} />
            </div>
          </div>

          {/* All-day toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={form.all_day}
                onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
                style={{ marginRight: 6, cursor: "pointer" }} />
              All day
            </label>
          </div>

          {/* Times (hidden if all-day) */}
          {!form.all_day && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Start Time</label>
                <input type="time" value={form.start_time || ""}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End Time (optional)</label>
                <input type="time" value={form.end_time || ""}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  style={inputStyle} />
              </div>
            </div>
          )}

          {/* Color picker */}
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLORS.map((c) => (
                <button key={c.value} type="button"
                  onClick={() => setForm({ ...form, color: c.value })}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: c.value,
                    border: form.color === c.value
                      ? `3px solid ${theme.text}` : `2px solid ${theme.border}`,
                    cursor: "pointer", transition: "all 0.15s",
                  }} title={c.label} />
              ))}
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label style={labelStyle}>Repeat</label>
            <select value={form.recurrence || ""}
              onChange={(e) => setForm({
                ...form, recurrence: e.target.value || null,
                recurrence_end: e.target.value ? form.recurrence_end : "",
              })}
              style={{ ...inputStyle, cursor: "pointer" }}>
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value || ""}>{o.label}</option>
              ))}
            </select>
          </div>

          {form.recurrence && (
            <div>
              <label style={labelStyle}>Repeat Until (optional)</label>
              <input type="date" value={form.recurrence_end || ""}
                onChange={(e) => setForm({ ...form, recurrence_end: e.target.value })}
                min={form.start_date} style={inputStyle} />
            </div>
          )}

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input type="text" value={form.location || ""}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Optional" style={inputStyle} />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
          <div>
            {isEdit && onDelete && (
              <button type="button" onClick={() => onDelete(event, occurrenceDate)} style={{
                padding: "10px 16px", borderRadius: theme.borderRadiusSm,
                border: `1px solid ${theme.danger}30`, background: theme.danger + "15",
                color: theme.danger, fontSize: 13, cursor: "pointer", fontFamily: theme.fontBody,
              }}>Delete</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: "10px 18px", borderRadius: theme.borderRadiusSm,
              border: `1px solid ${theme.border}`, background: theme.bgSubtle,
              color: theme.textMuted, fontSize: 13, cursor: "pointer", fontFamily: theme.fontBody,
            }}>Cancel</button>
            <button type="submit"
              disabled={saving || !form.title.trim() || !form.start_date} style={{
                padding: "10px 20px", borderRadius: theme.borderRadiusSm, border: "none",
                background: form.color, color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: saving || !form.title.trim() || !form.start_date ? "not-allowed" : "pointer",
                opacity: saving || !form.title.trim() || !form.start_date ? 0.5 : 1,
                fontFamily: theme.fontBody,
              }}>{saving ? "Saving..." : isEdit ? "Update" : "Create"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day Schedule Sidebar
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function DaySchedulePanel({ day, year, month, events, onEventClick }) {
  const date = new Date(year, month, day);
  const header = `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[month]} ${day}, ${year}`;

  return (
    <div style={{
      width: 300, minWidth: 300, background: theme.bgCard,
      border: `1px solid ${theme.border}`, borderRadius: theme.borderRadius,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        padding: "16px 16px 12px", borderBottom: `1px solid ${theme.border}`,
      }}>
        <div style={{
          fontFamily: theme.fontHeading, fontSize: 14, fontWeight: 700,
          color: theme.heading,
        }}>{header}</div>
        <div style={{
          fontSize: 12, color: theme.textDim, marginTop: 4,
        }}>{events.length} event{events.length !== 1 ? "s" : ""}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {events.length === 0 && (
          <div style={{ fontSize: 13, color: theme.textFaint, padding: "20px 0", textAlign: "center" }}>
            No events
          </div>
        )}
        {events.map((ev, i) => {
          const isGoogle = ev.source === "google";
          return (
            <div key={`${ev.id}-${i}`}
              onClick={(e) => onEventClick(ev, day, e)}
              style={{
                padding: "10px 12px", marginBottom: 6, borderRadius: theme.borderRadiusSm,
                borderLeft: `3px solid ${ev.color}`, cursor: "pointer",
                background: theme.bgSubtle, transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = theme.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.background = theme.bgSubtle}
            >
              <div style={{
                fontSize: 11, color: ev.color, fontWeight: 600, marginBottom: 3,
              }}>
                {ev.all_day ? "All day" : ev.start_time ? formatTime(ev.start_time) + (ev.end_time ? ` – ${formatTime(ev.end_time)}` : "") : ""}
                {isGoogle ? " 🌐" : ""}
                {ev.recurrence ? " 🔄" : ""}
              </div>
              <div style={{
                fontSize: 13, color: theme.text, fontWeight: 500,
              }}>{ev.title}</div>
              {ev.location && (
                <div style={{ fontSize: 11, color: theme.textDim, marginTop: 3 }}>
                  📍 {ev.location}
                </div>
              )}
              {ev.description && (
                <div style={{
                  fontSize: 11, color: theme.textFaint, marginTop: 4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{ev.description}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar Grid
// ---------------------------------------------------------------------------

export default function CalendarDashboard() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [googleModal, setGoogleModal] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showGoogleCal, setShowGoogleCal] = useState(true);
  const [gcalStatus, setGcalStatus] = useState(null);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const lastClickedDay = useRef(null);

  const gridRef = useRef(null);

  // Check Google Calendar status on mount
  useEffect(() => {
    api.googleStatus()
      .then(setGcalStatus)
      .catch(() => setGcalStatus({ configured: false }));
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const totalDays = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const monthName = new Date(year, month).toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const start = toISO(year, month, 1);
      const end = toISO(year, month, totalDays);
      const rangeStart = addDays(start, -7);
      const rangeEnd = addDays(end, 7);

      // Fetch local events
      const localPromise = api.listEvents(rangeStart, rangeEnd);

      // Fetch Google events if enabled and configured
      const googlePromise = showGoogleCal && gcalStatus?.configured
        ? api.listGoogleEvents(rangeStart, rangeEnd).catch(() => [])
        : Promise.resolve([]);

      const [localData, googleData] = await Promise.all([localPromise, googlePromise]);
      setEvents([...localData, ...googleData]);
    } catch (e) {
      console.error("Failed to load calendar events:", e);
    } finally {
      setLoading(false);
    }
  }, [year, month, totalDays, showGoogleCal, gcalStatus]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(today.getDate()); lastClickedDay.current = null; };
  const goPrev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(d => Math.min(d, daysInMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)));
  };
  const goNext = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(d => Math.min(d, daysInMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1)));
  };

  // Build grid
  const grid = [];
  let dayCounter = 1 - firstDay;
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      week.push(dayCounter >= 1 && dayCounter <= totalDays ? dayCounter : null);
      dayCounter++;
    }
    if (week.every((d) => d === null)) break;
    grid.push(week);
  }

  // Map events to days, sorted by time within each day
  const eventsByDay = {};
  events.forEach((ev) => {
    getEventDaysOnGrid(ev, year, month).forEach((d) => {
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push(ev);
    });
  });
  // Sort each day's events: all-day first, then by start_time
  Object.values(eventsByDay).forEach(dayEvents => {
    dayEvents.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
  });

  // Handlers
  const handleEventClick = (ev, occurrenceDay, e) => {
    e.stopPropagation();
    // Google events open a read-only detail modal
    if (ev.source === "google") {
      setGoogleModal(ev);
      return;
    }
    const occDate = occurrenceDay ? toISO(year, month, occurrenceDay) : ev.start_date;
    setModal({ event: ev, occurrenceDate: occDate, dateRange: null });
  };

  const handleDayNumberClick = (day, e) => {
    e.stopPropagation();
    setSelectedDay(day);
  };

  const handleEmptyCellClick = (day) => {
    if (lastClickedDay.current === day) {
      setModal({ event: null, occurrenceDate: null, dateRange: { start: toISO(year, month, day), end: toISO(year, month, day) } });
    } else {
      lastClickedDay.current = day;
      setSelectedDay(day);
    }
  };

  const handleSave = async (form) => {
    if (modal.event?.id) await api.updateEvent(modal.event.id, form);
    else await api.createEvent(form);
    setModal(null);
    loadEvents();
  };

  const handleDelete = (event, occurrenceDate) => {
    if (event.recurrence) {
      setConfirmDlg({
        title: "Delete recurring event",
        message: `"${event.title}" repeats ${event.recurrence}. What do you want to delete?`,
        options: [
          { label: `🗑️ Delete only the occurrence on ${occurrenceDate || event.start_date}`, value: "one" },
          { label: `⚠️ Delete ALL occurrences of "${event.title}"`, value: "all", danger: true },
        ],
        onSelect: async (choice) => {
          setConfirmDlg(null);
          try {
            if (choice === "one") await api.deleteOccurrence(event.id, occurrenceDate || event.start_date);
            else await api.deleteEvent(event.id);
            setModal(null); loadEvents();
          } catch (err) { console.error("Delete failed:", err); }
        },
      });
    } else {
      setConfirmDlg({
        title: "Delete event", message: `Delete "${event.title}"?`,
        options: [{ label: "🗑️ Delete", value: "all", danger: true }],
        onSelect: async () => {
          setConfirmDlg(null);
          try { await api.deleteEvent(event.id); setModal(null); loadEvents(); }
          catch (err) { console.error("Delete failed:", err); }
        },
      });
    }
  };

  const isToday = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const isDaySelected = (day) => day === selectedDay;

  return (
    <div style={{
      minHeight: "100vh", background: theme.bg, color: theme.text,
      fontFamily: theme.fontBody, padding: isMobile ? "12px 8px" : "24px 20px",
    }}>
      <div style={{ maxWidth: 1300, margin: "0 auto" }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: isMobile ? 16 : 24, flexWrap: "wrap", gap: 8,
        }}>
          <h1 style={{
            fontFamily: theme.fontHeading, fontSize: isMobile ? 22 : 30,
            fontWeight: 800, color: theme.heading, margin: 0,
          }}>📅 <span style={{ color: "#3b82f6" }}>Calendar</span></h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={goToday} style={navBtnStyle()}>Today</button>
            <button onClick={goPrev} style={navBtnStyle()}>‹</button>
            <span style={{
              fontSize: isMobile ? 14 : 16, fontWeight: 600, color: theme.text,
              minWidth: 160, textAlign: "center",
            }}>{monthName}</span>
            <button onClick={goNext} style={navBtnStyle()}>›</button>
            {gcalStatus?.configured && (
              <button
                onClick={() => setShowGoogleCal(!showGoogleCal)}
                style={{
                  ...navBtnStyle(),
                  background: showGoogleCal ? "#3b82f6" + "20" : theme.bgSubtle,
                  color: showGoogleCal ? "#3b82f6" : theme.textDim,
                  border: showGoogleCal ? "1px solid #3b82f640" : `1px solid ${theme.border}`,
                }}
                title={showGoogleCal ? "Hide Google Calendar" : "Show Google Calendar"}
              >
                🌐 GCal
              </button>
            )}
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: gcalStatus?.configured ? theme.success : theme.textDim,
            }}>
              {gcalStatus?.configured ? "●" : "○"}
            </span>
          </div>
        </div>

        {/* Calendar Grid + Day Schedule */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div ref={gridRef} style={{
          background: theme.bgCard, border: `1px solid ${theme.border}`,
          borderRadius: theme.borderRadius, overflow: "hidden", flex: 1, minWidth: 0,
        }}>
          {/* Day headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: `1px solid ${theme.border}`,
          }}>
            {DAYS.map((d) => (
              <div key={d} style={{
                padding: isMobile ? "8px 0" : "12px 0", textAlign: "center",
                fontSize: isMobile ? 10 : 12, fontWeight: 600, color: theme.textDim,
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>{isMobile ? d[0] : d}</div>
            ))}
          </div>

          {/* Day cells */}
          {grid.map((week, ri) => (
            <div key={ri} style={{
              display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
              borderBottom: ri < grid.length - 1 ? `1px solid ${theme.borderLight}` : "none",
            }}>
              {week.map((day, ci) => {
                const dayEvents = day ? eventsByDay[day] || [] : [];
                const todayMark = day && isToday(day);
                const selectedMark = day && isDaySelected(day);
                const maxShow = isMobile ? 2 : 3;

                return (
                  <div key={ci}
                    onClick={() => day && handleEmptyCellClick(day)}
                    style={{
                      height: isMobile ? 64 : 100, padding: isMobile ? "4px 3px" : "8px 6px",
                      borderRight: ci < 6 ? `1px solid ${theme.borderLight}` : "none",
                      background: selectedMark ? theme.accentDim : todayMark ? theme.accentDim : "transparent",
                      outline: selectedMark && !todayMark ? `2px solid ${theme.accent}` : "none",
                      outlineOffset: -2,
                      cursor: day ? "pointer" : "default", opacity: day ? 1 : 0.3,
                      transition: "background 0.1s", position: "relative", userSelect: "none",
                      overflow: "hidden", boxSizing: "border-box",
                    }}>
                    {day && (
                      <>
                        <div style={{
                          fontSize: isMobile ? 11 : 13, fontWeight: todayMark ? 700 : 400,
                          color: todayMark ? theme.accent : theme.textMuted,
                          marginBottom: 4, lineHeight: 1,
                        }}>
                          {todayMark ? (
                            <span onClick={(e) => handleDayNumberClick(day, e)} style={{
                              display: "inline-block", width: 22, height: 22, lineHeight: "22px",
                              textAlign: "center", borderRadius: "50%", background: theme.accent,
                              color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
                            }}>{day}</span>
                          ) : (
                            <span onClick={(e) => handleDayNumberClick(day, e)} style={{ cursor: "pointer" }}>{day}</span>
                          )}
                        </div>

                        {/* Event chips */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          {dayEvents.slice(0, maxShow).map((ev, i) => {
                            const isGoogle = ev.source === "google";
                            return (
                            <div key={`${ev.id}-${i}`}
                              onClick={(e) => handleEventClick(ev, day, e)}
                              style={{
                                fontSize: isMobile ? 9 : 11, padding: "1px 4px", borderRadius: 3,
                                background: isGoogle ? ev.color + "15" : ev.color + "25",
                                color: ev.color, fontWeight: 500,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                cursor: "pointer",
                                borderLeft: `2px solid ${ev.color}`,
                                opacity: isGoogle ? 0.85 : 1,
                                lineHeight: isMobile ? "14px" : "16px",
                              }}
                              title={`${ev.title}${ev.start_time ? " " + formatTime(ev.start_time) : ""}${ev.recurrence ? ` (${ev.recurrence})` : ""}${isGoogle ? " (Google Calendar)" : ""}`}>
                              {isGoogle && <span style={{ marginRight: 2, fontSize: 9 }}>🌐</span>}
                              {ev.recurrence && <span style={{ marginRight: 2 }}>🔄</span>}
                              {!ev.all_day && ev.start_time && (
                                <span style={{ opacity: 0.7, marginRight: 3 }}>{formatTime(ev.start_time)}</span>
                              )}
                              {ev.title}
                            </div>
                            );
                          })}
                          {dayEvents.length > maxShow && (
                            <div style={{ fontSize: 9, color: theme.textDim, padding: "0 4px" }}>
                              +{dayEvents.length - maxShow} more
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Day Schedule Sidebar */}
        {!isMobile && selectedDay && (
          <DaySchedulePanel
            day={selectedDay}
            year={year}
            month={month}
            events={eventsByDay[selectedDay] || []}
            onEventClick={handleEventClick}
          />
        )}
        </div>

        <div style={{
          marginTop: 12, fontSize: 11, color: theme.textFaint, textAlign: "center",
        }}>Click a day to view its schedule · Click again to add event</div>

        {loading && (
          <div style={{
            position: "fixed", bottom: 20, right: 20, padding: "8px 16px",
            background: theme.bgCard, border: `1px solid ${theme.border}`,
            borderRadius: 8, fontSize: 12, color: theme.textDim,
          }}>⏳ Loading...</div>
        )}
      </div>

      {/* Event Modal — key forces clean remount each time */}
      {modal && (
        <EventModal
          key={modal.event?.id || "new"}
          event={modal.event}
          occurrenceDate={modal.occurrenceDate}
          dateRange={modal.dateRange}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={modal.event?.id ? handleDelete : null}
        />
      )}

      {confirmDlg && (
        <ConfirmDialog
          title={confirmDlg.title} message={confirmDlg.message}
          options={confirmDlg.options} onSelect={confirmDlg.onSelect}
          onCancel={() => setConfirmDlg(null)}
        />
      )}

      {googleModal && (
        <GoogleEventModal
          event={googleModal}
          onClose={() => setGoogleModal(null)}
        />
      )}
    </div>
  );
}

function navBtnStyle() {
  return {
    padding: "6px 14px", borderRadius: 6, border: `1px solid ${theme.border}`,
    background: theme.bgSubtle, color: theme.textMuted, fontSize: 13, fontWeight: 500,
    cursor: "pointer", fontFamily: theme.fontBody, transition: "all 0.15s",
  };
}
