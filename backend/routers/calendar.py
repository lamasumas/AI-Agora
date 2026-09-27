"""Calendar router — event CRUD with recurrence expansion for Agora."""

import json
import time
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import get_db

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class EventCreate(BaseModel):
    title: str
    start_date: str          # YYYY-MM-DD
    end_date: Optional[str] = None  # YYYY-MM-DD (inclusive, for ranges)
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None    # HH:MM
    all_day: Optional[bool] = True
    color: Optional[str] = "#06b6d4"
    description: Optional[str] = None
    location: Optional[str] = None
    recurrence: Optional[str] = None        # null, 'daily', 'weekly', 'monthly', 'yearly'
    recurrence_end: Optional[str] = None    # YYYY-MM-DD — when to stop recurring


class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    color: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_end: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    return dict(row)


def _event_id() -> str:
    return f"evt-{int(time.time())}-{uuid.uuid4().hex[:6]}"


def _parse_excluded(row_dict: dict) -> set:
    """Parse the excluded_dates JSON column into a set of date strings."""
    raw = row_dict.get("excluded_dates")
    if not raw:
        return set()
    try:
        return set(json.loads(raw))
    except (json.JSONDecodeError, TypeError):
        return set()


def _expand_recurrences(event: dict, range_start: date, range_end: date) -> list[dict]:
    """Expand a recurring event into individual occurrences within [range_start, range_end].

    Returns a list of event dicts, each with start_date/end_date set to the
    specific occurrence dates. Non-recurring events are returned as-is if they
    fall within the range. Dates in excluded_dates are skipped.
    """
    rec = event.get("recurrence")
    ev_start = date.fromisoformat(event["start_date"])
    ev_end = date.fromisoformat(event["end_date"]) if event.get("end_date") else ev_start
    duration = (ev_end - ev_start).days
    excluded = _parse_excluded(event)

    rec_end_str = event.get("recurrence_end")
    hard_end = date.fromisoformat(rec_end_str) if rec_end_str else range_end
    effective_end = min(hard_end, range_end)

    if not rec:
        # Non-recurring: check if it overlaps the requested range
        if ev_end >= range_start and ev_start <= effective_end:
            if ev_start.isoformat() not in excluded:
                return [event]
        return []

    occurrences = []
    cursor = ev_start

    # Safety limit to avoid infinite loops
    max_iterations = 2000
    i = 0

    while cursor <= effective_end and i < max_iterations:
        occ_end = cursor + timedelta(days=duration)

        # Only include if this occurrence overlaps the requested range and isn't excluded
        if occ_end >= range_start and cursor <= effective_end:
            if cursor.isoformat() not in excluded:
                occ = dict(event)
                occ["start_date"] = cursor.isoformat()
                occ["end_date"] = occ_end.isoformat() if event.get("end_date") else None
                occurrences.append(occ)

        # Advance cursor based on recurrence type
        if rec == "daily":
            cursor += timedelta(days=1)
        elif rec == "weekly":
            cursor += timedelta(weeks=1)
        elif rec == "monthly":
            month = cursor.month + 1
            year = cursor.year
            if month > 12:
                month = 1
                year += 1
            day = min(cursor.day, _days_in_month(year, month))
            cursor = date(year, month, day)
        elif rec == "yearly":
            try:
                cursor = date(cursor.year + 1, cursor.month, cursor.day)
            except ValueError:
                cursor = date(cursor.year + 1, cursor.month, 28)
        else:
            break

        i += 1

    return occurrences


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return (date(year + 1, 1, 1) - date(year, month, 1)).days
    return (date(year, month + 1, 1) - date(year, month, 1)).days


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/events")
async def list_events(
    start: str = Query(..., description="Range start (YYYY-MM-DD)"),
    end: str = Query(..., description="Range end (YYYY-MM-DD)"),
):
    """List all events (with recurrence expansion) within a date range."""
    range_start = date.fromisoformat(start)
    range_end = date.fromisoformat(end)

    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM calendar_events
               WHERE start_date <= ?
               ORDER BY start_date ASC""",
            [range_end.isoformat()],
        ).fetchall()

    events = []
    for row in rows:
        ev = _row_to_dict(row)
        expanded = _expand_recurrences(ev, range_start, range_end)
        events.extend(expanded)

    return events


@router.get("/events/{event_id}")
async def get_event(event_id: str):
    """Get a single event by ID (the master record, not expanded)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        return _row_to_dict(row)


@router.post("/events")
async def create_event(event: EventCreate):
    """Create a new calendar event."""
    now = int(time.time())
    event_id = _event_id()

    if event.end_date:
        if event.end_date < event.start_date:
            raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    with get_db() as conn:
        conn.execute(
            """INSERT INTO calendar_events
               (id, title, start_date, end_date, start_time, end_time, all_day, color,
                description, location, recurrence, recurrence_end,
                excluded_dates, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                event_id, event.title, event.start_date, event.end_date,
                event.start_time, event.end_time,
                1 if event.all_day else 0, event.color, event.description,
                event.location, event.recurrence, event.recurrence_end,
                "[]", now, now,
            ],
        )
        row = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        return _row_to_dict(row)


@router.put("/events/{event_id}")
async def update_event(event_id: str, event: EventUpdate):
    """Update an existing event."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")

        now = int(time.time())
        fields = event.model_dump(exclude_unset=True)
        VALID_COLUMNS = {"title", "start_date", "end_date", "start_time", "end_time", "all_day", "color", "description", "location", "recurrence", "recurrence_end", "excluded_dates"}
        fields = {k: v for k, v in fields.items() if k in VALID_COLUMNS}
        if not fields:
            return _row_to_dict(existing)

        set_clauses = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [now, event_id]
        conn.execute(
            f"UPDATE calendar_events SET {set_clauses}, updated_at = ? WHERE id = ?",
            values,
        )
        row = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        return _row_to_dict(row)


@router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    """Delete an event (the master record and all its occurrences)."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")
        conn.execute("DELETE FROM calendar_events WHERE id = ?", [event_id])
        return {"deleted": event_id}


@router.delete("/events/{event_id}/occurrences/{occ_date}")
async def delete_occurrence(event_id: str, occ_date: str):
    """Exclude a single occurrence of a recurring event by adding its date
    to the excluded_dates list. If all occurrences are excluded, deletes
    the master record entirely.
    """
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Event not found")

        ev = _row_to_dict(existing)
        excluded = _parse_excluded(ev)
        excluded.add(occ_date)
        excluded_json = json.dumps(sorted(excluded))

        # Check if all possible occurrences are now excluded
        # (simple heuristic: if start_date itself is excluded and no recurrence, delete)
        if not ev.get("recurrence") and ev["start_date"] in excluded:
            conn.execute("DELETE FROM calendar_events WHERE id = ?", [event_id])
            return {"deleted": event_id, "reason": "only_occurrence_excluded"}

        now = int(time.time())
        conn.execute(
            "UPDATE calendar_events SET excluded_dates = ?, updated_at = ? WHERE id = ?",
            [excluded_json, now, event_id],
        )
        row = conn.execute(
            "SELECT * FROM calendar_events WHERE id = ?", [event_id]
        ).fetchone()
        return _row_to_dict(row)


# ---------------------------------------------------------------------------
# Google Calendar (iCal feed, read-only)
# ---------------------------------------------------------------------------

@router.get("/google/events")
async def list_google_events(
    start: str = Query(..., description="Range start (YYYY-MM-DD)"),
    end: str = Query(..., description="Range end (YYYY-MM-DD)"),
):
    """Fetch events from Google Calendar iCal feed (read-only, cached 5 min).

    Returns events in the same shape as local events, with source="google".
    """
    try:
        import ical_feed
    except ImportError:
        raise HTTPException(status_code=503, detail="ical_feed module not available")

    try:
        all_events = ical_feed.get_events(start=start, end=end)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch iCal feed: {e}")

    # Filter by date range
    filtered = []
    for ev in all_events:
        ev_start = ev.get("start_date", "")
        ev_end = ev.get("end_date") or ev_start
        # Event overlaps range if it starts before range ends and ends after range starts
        if ev_start <= end and ev_end >= start:
            filtered.append(ev)

    return filtered


@router.get("/google/status")
async def google_calendar_status():
    """Check if the Google Calendar iCal feed is reachable."""
    try:
        import ical_feed
        configured = ical_feed.is_configured()
    except ImportError:
        configured = False
    return {"configured": configured}


# ---------------------------------------------------------------------------
# iCal export — subscribe from your phone
# ---------------------------------------------------------------------------

def _to_ical_datetime(date_str: str, time_str: str | None, all_day: bool):
    """Convert Agora date/time strings to icalendar-compatible objects."""
    from datetime import datetime as dt_cls
    d = date.fromisoformat(date_str)
    if all_day or not time_str:
        return d
    h, m = map(int, time_str.split(":"))
    return dt_cls(d.year, d.month, d.day, h, m)


@router.get("/ical/export")
async def export_ical(
    start: str = Query(default=None, description="Range start YYYY-MM-DD (default: 60 days ago)"),
    end: str = Query(default=None, description="Range end YYYY-MM-DD (default: 365 days ahead)"),
):
    """Export all events (local + Google) as a single .ics feed.

    Subscribe to this URL from your phone's calendar app to get both
    local Agora events and Google Calendar events in one feed.
    """
    from fastapi.responses import Response
    import icalendar as ical_mod

    today = date.today()
    range_start = date.fromisoformat(start) if start else today - timedelta(days=60)
    range_end = date.fromisoformat(end) if end else today + timedelta(days=365)

    # --- Build iCal calendar ---
    cal = ical_mod.Calendar()
    cal.add("prodid", "-//Agora Calendar//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", "Agora Calendar")

    # --- Local events ---
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE start_date <= ? ORDER BY start_date ASC",
            [range_end.isoformat()],
        ).fetchall()

    for row in rows:
        ev = _row_to_dict(row)
        expanded = _expand_recurrences(ev, range_start, range_end)
        for occ in expanded:
            vevent = ical_mod.Event()
            vevent.add("uid", f"agora-local-{occ['id']}")
            vevent.add("summary", occ["title"])
            vevent.add("dtstamp", datetime.now(timezone.utc))

            is_all_day = bool(occ.get("all_day"))
            dt_start = _to_ical_datetime(occ["start_date"], occ.get("start_time"), is_all_day)
            vevent.add("dtstart", dt_start)

            end_date = occ.get("end_date") or occ["start_date"]
            end_time = occ.get("end_time")
            if is_all_day:
                # iCal all-day DTEND is exclusive, so add 1 day
                dt_end = date.fromisoformat(end_date) + timedelta(days=1)
            else:
                dt_end = _to_ical_datetime(end_date, end_time, is_all_day)
            vevent.add("dtend", dt_end)

            if occ.get("description"):
                vevent.add("description", occ["description"])
            if occ.get("location"):
                vevent.add("location", occ["location"])

            cal.add_component(vevent)

    # --- Google Calendar events ---
    try:
        import ical_feed
        google_events = ical_feed.get_events(
            start=range_start.isoformat(), end=range_end.isoformat()
        )
        for ev in google_events:
            vevent = ical_mod.Event()
            vevent.add("uid", f"agora-gcal-{ev.get('google_event_id', ev['id'])}")
            vevent.add("summary", ev["title"])
            vevent.add("dtstamp", datetime.now(timezone.utc))

            is_all_day = bool(ev.get("all_day"))
            dt_start = _to_ical_datetime(ev["start_date"], ev.get("start_time"), is_all_day)
            vevent.add("dtstart", dt_start)

            end_date = ev.get("end_date") or ev["start_date"]
            end_time = ev.get("end_time")
            if is_all_day:
                dt_end = date.fromisoformat(end_date) + timedelta(days=1)
            else:
                dt_end = _to_ical_datetime(end_date, end_time, is_all_day)
            vevent.add("dtend", dt_end)

            if ev.get("description"):
                vevent.add("description", ev["description"])
            if ev.get("location"):
                vevent.add("location", ev["location"])

            cal.add_component(vevent)
    except Exception:
        pass  # Google feed unavailable — export local events only

    return Response(
        content=cal.to_ical(),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "inline; filename=agora-calendar.ics"},
    )
