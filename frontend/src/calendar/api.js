/**
 * Calendar API client for Agora.
 * Manages calendar events with recurrence support.
 */

const API_BASE = "";

async function fetchJSON(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

async function sendJSON(endpoint, method, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

/**
 * List events within a date range (with recurrence expansion).
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 */
export async function listEvents(start, end) {
  const params = new URLSearchParams({ start, end });
  return fetchJSON(`/api/calendar/events?${params}`);
}

/**
 * Get a single event master record by ID.
 */
export async function getEvent(eventId) {
  return fetchJSON(`/api/calendar/events/${eventId}`);
}

/**
 * Create a new calendar event.
 */
export async function createEvent(event) {
  return sendJSON("/api/calendar/events", "POST", event);
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(eventId, event) {
  return sendJSON(`/api/calendar/events/${eventId}`, "PUT", event);
}

/**
 * Delete a calendar event (master record + all occurrences).
 */
export async function deleteEvent(eventId) {
  const res = await fetch(`${API_BASE}/api/calendar/events/${eventId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for DELETE`);
  return res.json();
}

/**
 * Delete a single occurrence of a recurring event.
 * Adds the date to excluded_dates on the master record.
 * @param {string} eventId - Master event ID
 * @param {string} occDate - YYYY-MM-DD of the occurrence to exclude
 */
export async function deleteOccurrence(eventId, occDate) {
  const res = await fetch(`${API_BASE}/api/calendar/events/${eventId}/occurrences/${occDate}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for DELETE occurrence`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Google Calendar (read-only, iCal feed)
// ---------------------------------------------------------------------------

/**
 * List events from Google Calendar (read-only, cached 5 min).
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 */
export async function listGoogleEvents(start, end) {
  const params = new URLSearchParams({ start, end });
  return fetchJSON(`/api/calendar/google/events?${params}`);
}

/**
 * Check if Google Calendar is configured and reachable.
 */
export async function googleStatus() {
  return fetchJSON("/api/calendar/google/status");
}
