#!/usr/bin/env python3
"""Demo fixture: summarise today's calendar events from the local API.

Runs as a `no_agent` cron job, so its stdout is delivered verbatim.
"""

import datetime as dt
import json
import urllib.request

BASE = "http://127.0.0.1:8000"


def main() -> None:
    today = dt.date.today().isoformat()
    url = f"{BASE}/api/calendar/events?start={today}&end={today}"
    with urllib.request.urlopen(url, timeout=10) as response:
        events = json.load(response)

    if not events:
        print(f"No events on {today}.")
        return

    print(f"{len(events)} event(s) on {today}:")
    for event in events:
        when = event.get("start_time") or "all day"
        print(f"- {when}  {event.get('title', '(untitled)')}")


if __name__ == "__main__":
    main()
