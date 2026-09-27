
import httpx
import icalendar
import json
import os
import time
from datetime import date, datetime, timezone, timedelta
from dateutil.rrule import rrulestr
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ICAL_URL = os.getenv("GOOGLE_ICAL_URL", "")
CACHE_TTL = 300  # 5 minutes
_cache = {"data": None, "ts": 0}

# How far ahead to expand recurring events (years)
EXPAND_YEARS_AHEAD = 2
EXPAND_YEARS_BEHIND = 1


# ---------------------------------------------------------------------------
# Fetch + Parse
# ---------------------------------------------------------------------------

def fetch_ical() -> str:
    """Fetch raw iCal data from the public URL."""
    if not ICAL_URL:
        raise ValueError("GOOGLE_ICAL_URL environment variable is not set")
    with httpx.Client(timeout=15) as client:
        resp = client.get(ICAL_URL, follow_redirects=True)
        resp.raise_for_status()
        return resp.text


def _parse_dt(dt_val) -> tuple[str, str | None]:
    """Parse an iCal datetime into (date_str, time_str|None).

    All-day dates come as `date` objects. Timed events come as `datetime`.
    """
    if isinstance(dt_val, datetime):
        # Timed event - convert to local (JST +9) for display
        if dt_val.tzinfo is None:
            dt_val = dt_val.replace(tzinfo=timezone.utc)
        local = dt_val.astimezone(timezone(timedelta(hours=9)))
        return local.strftime("%Y-%m-%d"), local.strftime("%H:%M")
    elif isinstance(dt_val, date):
        return dt_val.isoformat(), None
    else:
        return str(dt_val)[:10], None


def _rrule_to_dateutil_str(rrule_val) -> str | None:
    """Convert an icalendar vRecur to a dateutil-compatible RRULE string."""
    if rrule_val is None:
        return None
    # icalendar vRecur has a .to_ical() method that returns bytes like b'FREQ=YEARLY'
    try:
        raw = rrule_val.to_ical().decode("utf-8")
        return raw
    except Exception:
        return str(rrule_val)


def _parse_exdates(component) -> list[date]:
    """Extract EXDATE values from a VEVENT component."""
    exdates = []
    # EXDATE can appear multiple times
    for key in component:
        if key.upper().startswith("EXDATE"):
            exdate_prop = component[key]
            # Can be a list of vDDDLists or a single vDDDLists
            if not isinstance(exdate_prop, list):
                exdate_prop = [exdate_prop]
            for prop in exdate_prop:
                if hasattr(prop, "dts"):
                    for dt_val in prop.dts:
                        d = dt_val.dt
                        if isinstance(d, datetime):
                            d = d.astimezone(timezone(timedelta(hours=9))).date()
                        exdates.append(d)
                elif hasattr(prop, "dt"):
                    d = prop.dt
                    if isinstance(d, datetime):
                        d = d.astimezone(timezone(timedelta(hours=9))).date()
                    exdates.append(d)
    return exdates


def _make_event_dict(
    uid: str, summary: str, description: str, location: str,
    start_date: str, end_date: str | None,
    start_time: str | None, end_time: str | None,
    is_all_day: bool,
) -> dict:
    """Build a standard event dict."""
    # If end_date == start_date, treat as single-day
    if end_date == start_date:
        end_date = None

    return {
        "id": f"gcal-{uid}",
        "title": summary,
        "start_date": start_date,
        "end_date": end_date,
        "start_time": start_time,
        "end_time": end_time,
        "all_day": is_all_day,
        "color": "#3b82f6",
        "description": description,
        "location": location,
        "source": "google",
        "google_event_id": uid,
        "google_html_link": f"https://calendar.google.com/calendar/event?eid={uid}",
    }


def parse_ical_events(raw: str, expand_start: date | None = None, expand_end: date | None = None) -> list[dict]:
    """Parse raw iCal text into Agora-format event dicts.

    Expands RRULE recurring events into individual occurrences within
    the given date range (or a default range around today).
    """
    cal = icalendar.Calendar.from_ical(raw)
    events = []

    # Define expansion range — use requested range with padding, or defaults
    today = date.today()
    if expand_start is not None:
        range_start = expand_start - timedelta(days=30)
    else:
        range_start = today - timedelta(days=365 * EXPAND_YEARS_BEHIND)
    if expand_end is not None:
        range_end = expand_end + timedelta(days=30)
    else:
        range_end = today + timedelta(days=365 * EXPAND_YEARS_AHEAD)

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        uid = str(component.get("UID", ""))
        summary = str(component.get("SUMMARY", "(No title)"))
        description = str(component.get("DESCRIPTION", "") or "")
        location = str(component.get("LOCATION", "") or "")

        # Get dt objects
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")

        if dtstart is None:
            continue

        start_val = dtstart.dt if hasattr(dtstart, "dt") else dtstart
        end_val = dtend.dt if hasattr(dtend, "dt") and dtend else None

        is_all_day = isinstance(start_val, date) and not isinstance(start_val, datetime)

        # Get RRULE
        rrule_prop = component.get("RRULE")
        rrule_str = _rrule_to_dateutil_str(rrule_prop)

        # Get EXDATEs
        exdates = _parse_exdates(component)
        exdate_set = set()
        for d in exdates:
            exdate_set.add(d.isoformat())

        if rrule_str:
            # --- Recurring event: expand via dateutil ---
            try:
                # Build the RRULE with DTSTART (use datetime for dateutil compatibility)
                if is_all_day:
                    dt_start = datetime(start_val.year, start_val.month, start_val.day)
                else:
                    dt_start = start_val if isinstance(start_val, datetime) else datetime(start_val.year, start_val.month, start_val.day)

                rule_str = f"DTSTART:{dt_start.strftime('%Y%m%dT%H%M%S')}\nRRULE:{rrule_str}"
                rule = rrulestr(rule_str, dtstart=dt_start)

                # Compute duration for multi-day events
                if end_val is not None:
                    if isinstance(end_val, datetime):
                        end_date_obj = end_val.astimezone(timezone(timedelta(hours=9))).date()
                    else:
                        end_date_obj = end_val
                    start_date_obj = start_val if isinstance(start_val, date) and not isinstance(start_val, datetime) else (start_val.astimezone(timezone(timedelta(hours=9))).date() if isinstance(start_val, datetime) else start_val)
                    duration_days = (end_date_obj - start_date_obj).days
                    # Google all-day DTEND is exclusive, subtract 1 for inclusive
                    if is_all_day:
                        duration_days -= 1
                else:
                    duration_days = 0

                # Use datetime for between() since dateutil returns datetime objects
                dt_range_start = datetime(range_start.year, range_start.month, range_start.day)
                dt_range_end = datetime(range_end.year, range_end.month, range_end.day)

                for occ in rule.between(dt_range_start, dt_range_end, inc=True):
                    occ_date = occ.date() if isinstance(occ, datetime) else occ

                    if occ_date.isoformat() in exdate_set:
                        continue

                    occ_end_date = None
                    if duration_days > 0:
                        occ_end_date = (occ_date + timedelta(days=duration_days)).isoformat()

                    # Extract time if it's a timed event
                    start_time = None
                    if isinstance(occ, datetime) and not is_all_day:
                        local = occ.astimezone(timezone(timedelta(hours=9))) if occ.tzinfo else occ.replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=9)))
                        start_time = local.strftime("%H:%M")

                    sd = occ_date.isoformat()

                    events.append(_make_event_dict(
                        uid=f"{uid}-{occ_date.isoformat()}",
                        summary=summary,
                        description=description,
                        location=location,
                        start_date=sd,
                        end_date=occ_end_date,
                        start_time=start_time,
                        end_time=None,
                        is_all_day=is_all_day,
                    ))

            except Exception as e:
                # Fallback: add the original event if expansion fails
                start_date, start_time = _parse_dt(start_val)
                if end_val is not None:
                    end_date, end_time = _parse_dt(end_val)
                else:
                    end_date, end_time = None, None

                if is_all_day and end_date:
                    end_d = date.fromisoformat(end_date)
                    end_date = (end_d - timedelta(days=1)).isoformat()

                events.append(_make_event_dict(
                    uid=uid, summary=summary, description=description, location=location,
                    start_date=start_date, end_date=end_date,
                    start_time=start_time, end_time=end_time,
                    is_all_day=is_all_day,
                ))
        else:
            # --- Non-recurring event ---
            start_date, start_time = _parse_dt(start_val)
            if end_val is not None:
                end_date, end_time = _parse_dt(end_val)
            else:
                end_date, end_time = None, None

            # Google all-day DTEND is exclusive - subtract 1 day for inclusive display
            if is_all_day and end_date:
                end_d = date.fromisoformat(end_date)
                end_date = (end_d - timedelta(days=1)).isoformat()

            events.append(_make_event_dict(
                uid=uid, summary=summary, description=description, location=location,
                start_date=start_date, end_date=end_date,
                start_time=start_time, end_time=end_time,
                is_all_day=is_all_day,
            ))

    return events


def get_events(force: bool = False, start: str | None = None, end: str | None = None) -> list[dict]:
    """Get parsed events with caching.

    If start/end are provided, they expand the recurrence range so events
    in the past (beyond the default 1-year window) are included.
    """
    now = time.time()
    # Include range in cache key to avoid stale range issues
    cache_key = f"{start}:{end}"
    if (not force
            and _cache["data"] is not None
            and _cache.get("key") == cache_key
            and (now - _cache["ts"]) < CACHE_TTL):
        return _cache["data"]

    raw = fetch_ical()
    expand_start = date.fromisoformat(start) if start else None
    expand_end = date.fromisoformat(end) if end else None
    events = parse_ical_events(raw, expand_start=expand_start, expand_end=expand_end)
    _cache["data"] = events
    _cache["ts"] = now
    _cache["key"] = cache_key
    return events


def is_configured() -> bool:
    """Check if the iCal feed is reachable."""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.head(ICAL_URL, follow_redirects=True)
            return resp.status_code == 200
    except Exception:
        return False
