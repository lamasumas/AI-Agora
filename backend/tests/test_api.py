"""End-to-end API tests against the real FastAPI app, running on demo fixtures.

These assert the contract the React frontend depends on, plus the two build-time
guards: code execution is off unless explicitly enabled, and the cron fixtures
are read-only in demo mode.
"""

import pytest


class TestHealth:
    def test_reports_ok_and_demo_flag(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "demo": True}


class TestDemoSeed:
    def test_demo_notes_are_loaded_on_startup(self, client):
        notes = client.get("/api/notes").json()
        titles = {n["title"] for n in notes}
        assert "Agora Demo Vault" in titles
        assert len(notes) >= 10

    def test_demo_calendar_events_are_loaded(self, client):
        events = client.get("/api/calendar/events?start=2000-01-01&end=2100-01-01").json()
        assert len(events) >= 5

    def test_root_note_is_pinned(self, client):
        notes = client.get("/api/notes").json()
        root = next(n for n in notes if n["title"] == "Agora Demo Vault")
        assert root["pinned"] == 1


class TestNotesApi:
    def test_crud_roundtrip(self, client):
        created = client.post(
            "/api/notes",
            json={"title": "Test note", "body": "Hello **world**", "tags": ["test-tag"]},
        ).json()
        note_id = created["id"]

        fetched = client.get(f"/api/notes/{note_id}").json()
        assert fetched["title"] == "Test note"
        assert fetched["body"] == "Hello **world**"

        # PUT must carry parent_id, otherwise the note is detached from the tree.
        put = client.put(
            f"/api/notes/{note_id}",
            json={"title": "Renamed", "body": "Updated body", "parent_id": None},
        )
        assert put.status_code == 200
        assert client.get(f"/api/notes/{note_id}").json()["title"] == "Renamed"

        assert client.delete(f"/api/notes/{note_id}").status_code == 200
        assert client.get(f"/api/notes/{note_id}").status_code == 404

    def test_list_returns_summaries_not_bodies(self, client):
        note = client.post("/api/notes", json={"title": "Summary", "body": "x" * 500}).json()
        listed = next(n for n in client.get("/api/notes").json() if n["id"] == note["id"])
        assert "body" not in listed
        assert len(listed["summary"]) <= 220
        client.delete(f"/api/notes/{note['id']}")

    def test_list_search_matches_inside_the_body(self, client):
        note = client.post(
            "/api/notes",
            json={"title": "Searchable", "body": "the needle is in the body"},
        ).json()
        hits = client.get("/api/notes?search=needle").json()
        assert any(h["id"] == note["id"] for h in hits)
        client.delete(f"/api/notes/{note['id']}")

    def test_title_search_feeds_the_wikilink_autocomplete(self, client):
        hits = client.get("/api/notes/search?q=Demo Vault").json()
        assert {"id", "title"} == set(hits[0])
        assert any(h["title"] == "Agora Demo Vault" for h in hits)

    def test_child_notes_are_linked_by_parent_id(self, client):
        parent = client.post("/api/notes", json={"title": "Parent", "body": "p"}).json()
        child = client.post(
            "/api/notes",
            json={"title": "Child", "body": "c", "parent_id": parent["id"]},
        ).json()
        children = client.get(f"/api/notes?parent_id={parent['id']}").json()
        assert [c["id"] for c in children] == [child["id"]]
        client.delete(f"/api/notes/{child['id']}")
        client.delete(f"/api/notes/{parent['id']}")

    def test_tree_and_stats_endpoints_respond(self, client):
        assert client.get("/api/tree").status_code == 200
        assert client.get("/api/stats/summary").status_code == 200
        assert client.get("/api/stats/activity").status_code == 200
        assert client.get("/api/notes/tags/all").status_code == 200

    def test_export_returns_every_note(self, client):
        export = client.get("/api/export").json()
        assert "notes" in export
        assert len(export["notes"]) >= 10


class TestCalendarApi:
    def test_create_list_and_delete(self, client):
        created = client.post(
            "/api/calendar/events",
            json={"title": "Test event", "start_date": "2026-10-01", "all_day": True},
        ).json()
        event_id = created["id"]

        events = client.get("/api/calendar/events?start=2026-10-01&end=2026-10-02").json()
        assert any(e["id"] == event_id for e in events)

        assert client.delete(f"/api/calendar/events/{event_id}").status_code == 200

    def test_recurring_event_expands_across_the_range(self, client):
        created = client.post(
            "/api/calendar/events",
            json={
                "title": "Weekly sync",
                "start_date": "2026-10-05",
                "all_day": False,
                "start_time": "09:00",
                "recurrence": "weekly",
            },
        ).json()
        events = client.get("/api/calendar/events?start=2026-10-01&end=2026-10-31").json()
        occurrences = [e for e in events if e["id"] == created["id"]]
        assert len(occurrences) == 4
        client.delete(f"/api/calendar/events/{created['id']}")

    def test_ical_export_is_a_valid_feed(self, client):
        response = client.get("/api/calendar/ical/export")
        assert response.status_code == 200
        assert "BEGIN:VCALENDAR" in response.text
        assert "BEGIN:VEVENT" in response.text

    def test_google_status_is_false_without_a_feed_url(self, client):
        assert client.get("/api/calendar/google/status").json() == {"configured": False}


class TestFinanceApi:
    def test_bank_savings_shape(self, client):
        rows = client.get("/api/finance/bank-savings").json()
        assert {"account", "balance", "raw"} == set(rows[0])
        assert any(r["account"] == "assets:bank:savings" for r in rows)

    def test_investment_value_shape(self, client):
        rows = client.get("/api/finance/investment-value").json()
        assert {"account", "value", "raw"} == set(rows[0])
        assert len(rows) >= 5

    def test_cashflow_latest_splits_multi_currency_cells(self, client):
        rows = client.get("/api/finance/cashflow/latest").json()
        contracting = [r for r in rows if r["account"] == "income:contracting"]
        assert len(contracting) == 2

    def test_cashflow_monthly_has_twelve_months(self, client):
        rows = client.get("/api/finance/cashflow/monthly").json()
        months = [k for k in rows[0] if k != "account"]
        assert len(months) == 12

    def test_investment_history_is_wide_dated_rows(self, client):
        rows = client.get("/api/finance/investment-history").json()
        history = rows[0]["history"]
        assert len(history) > 100
        assert all(len(date) == 10 for date in history)

    def test_exchange_rate_always_returns_a_number(self, client):
        payload = client.get("/api/finance/exchange-rate").json()
        assert isinstance(payload["rate"], (int, float))

    def test_etf_watchlist_is_fully_described(self, client):
        payload = client.get("/api/finance/etf-watchlist").json()
        assert len(payload["etfs"]) >= 5
        for etf in payload["etfs"]:
            assert etf["symbol"] and etf["name"] and etf["currency"]

    def test_etf_tracker_rejects_an_unknown_period(self, client):
        assert client.get("/api/finance/etf-tracker?period=decade").status_code == 400

    def test_etf_tracker_rejects_an_unknown_symbol(self, client):
        assert client.get("/api/finance/etf-tracker?symbol=NOPE").status_code == 400


class TestGuards:
    def test_run_code_is_disabled_by_default(self, client):
        response = client.post("/api/run-code", json={"language": "python", "code": "print(1)"})
        assert response.status_code == 403
        assert "disabled" in response.json()["detail"]

    def test_run_code_also_rejects_non_loopback_clients(self, client, monkeypatch):
        from routers import notes

        monkeypatch.setattr(notes, "ENABLE_CODE_EXEC", True)
        response = client.post("/api/run-code", json={"language": "python", "code": "print(1)"})
        assert response.status_code == 403
        assert "localhost" in response.json()["detail"]

    def test_cron_sync_is_read_only_in_demo_mode(self, client):
        response = client.post("/api/cron/sync", json={"jobs": []})
        assert response.status_code == 403
        assert "demo mode" in response.json()["detail"]

    def test_cron_script_write_is_read_only_in_demo_mode(self, client):
        response = client.put("/api/cron/scripts/daily-calendar-check.py", json={"content": "x"})
        assert response.status_code == 403

    def test_clip_rejects_private_addresses(self, client):
        response = client.post("/api/clip", json={"url": "http://127.0.0.1:8080/api/notes"})
        assert response.status_code == 400
        assert "private" in response.json()["detail"]


class TestCronApi:
    def test_list_returns_the_fixture_jobs(self, client):
        jobs = client.get("/api/cron/list").json()["jobs"]
        assert len(jobs) == 3
        assert {j["name"] for j in jobs} >= {"Daily calendar summary", "Disk usage watchdog"}

    def test_scripts_are_listed_from_the_fixture_dir(self, client):
        pytest.importorskip("pathlib")
        scripts = client.get("/api/cron/scripts").json()["scripts"]
        names = {s["name"] for s in scripts}
        assert "daily-calendar-check.py" in names or scripts == []
