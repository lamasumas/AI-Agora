#!/usr/bin/env python3
"""Generate the fictional CSV fixtures used by the demo container.

The finance dashboard reads seven CSV exports out of FINANCE_DATA_DIR. They are
normally produced by an external accounting pipeline, so the demo ships a
generator instead of hand-written files: re-running this script rebuilds the
same numbers (the RNG is seeded) and shifts every date so the data always looks
current.

    python demo/generate_demo_data.py                 # as of today
    python demo/generate_demo_data.py --as-of 2026-08-31

Writes into demo/finance/ and demo/cron.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent
FINANCE_DIR = DEMO_DIR / "finance"

RNG = random.Random(20260927)

FX_JPY_PER_EUR = 160.0

BANK_ACCOUNTS = [
    ("assets:bank:everyday", "EUR", 3420.55),
    ("assets:bank:savings", "EUR", 12000.00),
    ("assets:bank:jpy", "JPY", 482000.0),
]

# (account, units, unit currency, cost basis in EUR, current value in EUR, daily drift)
INVESTMENTS = [
    ("assets:investments:etf:WORLD", 154.3200, "", 10800.00, 12450.00, 0.00035),
    ("assets:investments:etf:SP500", 62.5000, "", 7100.00, 8320.00, 0.00042),
    ("assets:investments:etf:GOLD", 18.4000, "", 4200.00, 4910.00, 0.00021),
    ("assets:investments:crypto:BTC", 0.0212, "BTC", 1600.00, 1850.00, 0.00110),
    ("assets:investments:crypto:ETH", 0.3105, "ETH", 540.00, 620.00, 0.00135),
]

SALARY_JPY = 382000
SIDE_INCOME_JPY = 24000

INCOME_LINES = [
    "income:salary",
    "income:sidework",
    "income:cashback",
    "income:interest",
    "income:contracting",
]

# (account, currency, monthly amount, variance)
EXPENSE_LINES = [
    ("expenses:rent", "JPY", 118000, 0.0),
    ("expenses:food:grocery", "JPY", 42000, 0.18),
    ("expenses:food:dining", "JPY", 18500, 0.30),
    ("expenses:transport", "JPY", 9400, 0.25),
    ("expenses:telecom", "EUR", 21.50, 0.05),
    ("expenses:utilities:power", "JPY", 6800, 0.35),
    ("expenses:health:pharmacy", "JPY", 3200, 0.40),
    ("expenses:fitness:gym", "JPY", 8228, 0.0),
    ("expenses:shopping:misc", "JPY", 24000, 0.55),
    # Paid from a EUR account, so some months carry two currencies in one cell.
    ("expenses:travel", "MIXED", 0.0, 0.0),
]


def _money(value: float, currency: str) -> str:
    """Format a value the way the accounting export does: '-40000 JPY', '21.50 EUR'."""
    if currency.upper() == "JPY":
        return f"{value:.0f} JPY"
    return f"{value:.2f} EUR"


def _to_jpy(cell: str) -> float:
    """Approximate a cell's JPY value (used only for the total and Net rows)."""
    total = 0.0
    for part in str(cell).split(","):
        part = part.strip()
        if not part or part == "0":
            continue
        amount = float(part.split()[0].replace(",", ""))
        total += amount * FX_JPY_PER_EUR if part.upper().endswith("EUR") else amount
    return total


def _month_seq(end: date, count: int) -> list[tuple[int, int]]:
    """Return `count` (year, month) pairs ending at end's month, oldest first."""
    months = []
    year, month = end.year, end.month
    for _ in range(count):
        months.append((year, month))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(months))


def _label(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def _short_month(year: int, month: int) -> str:
    return date(year, month, 1).strftime("%b")


def _jitter(base: float, variance: float) -> float:
    if variance == 0:
        return base
    return base * (1 + RNG.uniform(-variance, variance))


def write_csv(path: Path, rows: list[list[str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        csv.writer(fh, quoting=csv.QUOTE_ALL).writerows(rows)
    print(f"  wrote {path.relative_to(DEMO_DIR.parent)} ({len(rows)} rows)")


# ---------------------------------------------------------------------------
# Balance exports
# ---------------------------------------------------------------------------


def bank_savings() -> list[list[str]]:
    rows = [["account", "balance"]]
    total_eur = total_jpy = 0.0
    for account, currency, amount in BANK_ACCOUNTS:
        rows.append([account, _money(amount, currency)])
        if currency == "JPY":
            total_jpy += amount
        else:
            total_eur += amount
    rows.append(["total", f"{total_eur:.2f} EUR, {total_jpy:.0f} JPY"])
    return rows


def investment_value() -> list[list[str]]:
    rows = [["account", "balance"]]
    for account, _units, _unit_cur, _cost, value, _drift in INVESTMENTS:
        rows.append([account, _money(value, "EUR")])
    rows.append(["total", _money(sum(i[4] for i in INVESTMENTS), "EUR")])
    return rows


def investments_amount() -> list[list[str]]:
    rows = [["account", "balance"]]
    for account, units, unit_cur, _cost, _value, _drift in INVESTMENTS:
        rows.append([account, f"{units:.4f} {unit_cur}".strip()])
    return rows


def investments_cost() -> list[list[str]]:
    rows = [["account", "balance"]]
    for account, _units, _unit_cur, cost, _value, _drift in INVESTMENTS:
        rows.append([account, _money(cost, "EUR")])
    rows.append(["total", _money(sum(i[3] for i in INVESTMENTS), "EUR")])
    return rows


def investment_history(as_of: date, days: int = 180) -> list[list[str]]:
    """Wide format: one row per asset, one column per day, values in EUR."""
    dates = [as_of - timedelta(days=days - 1 - i) for i in range(days)]
    rows = [["account"] + [d.isoformat() for d in dates]]
    series_by_asset = []

    for _account, _units, _unit_cur, _cost, target, drift in INVESTMENTS:
        # Random walk forwards, then rescale so the final point equals the value
        # reported in investment_value.csv.
        walk = [1.0]
        for _ in range(days - 1):
            walk.append(walk[-1] * (1 + drift + RNG.uniform(-0.006, 0.006)))
        scale = target / walk[-1]
        series = [max(0.01, point * scale) for point in walk]
        series_by_asset.append(series)
        rows.append([_account] + [f"{v:.2f} EUR" for v in series])

    rows.append(["total"] + [
        f"{sum(asset[i] for asset in series_by_asset):.2f} EUR" for i in range(days)
    ])
    return rows


# ---------------------------------------------------------------------------
# Income statements
# ---------------------------------------------------------------------------


def _single_month_income(months_back: int) -> list[tuple[str, str]]:
    label = "JPY"
    return [
        ("income:salary", _money(SALARY_JPY, label)),
        ("income:sidework", _money(round(RNG.uniform(0, SIDE_INCOME_JPY * 1.5)), label)),
        ("income:cashback", _money(round(RNG.uniform(200, 900)), label)),
        ("income:interest", _money(round(RNG.uniform(300, 1500)), label)),
    ] + ([("income:contracting", "127.00 EUR, 6864 JPY")] if months_back == 0 else [])


def _single_month_expenses() -> list[tuple[str, str]]:
    out = []
    for account, currency, base, variance in EXPENSE_LINES:
        if currency == "MIXED":
            out.append((account, "131.23 EUR, 66660 JPY"))
        elif currency == "EUR":
            out.append((account, _money(_jitter(base, variance), "EUR")))
        else:
            out.append((account, _money(round(_jitter(base, variance)), "JPY")))
    return out


def last_month(as_of: date) -> list[list[str]]:
    """Single month income statement, in the shape the accounting export produces."""
    prev = as_of.replace(day=1) - timedelta(days=1)
    label = _short_month(prev.year, prev.month)

    income = _single_month_income(0)
    expenses = _single_month_expenses()

    income_total = sum(_to_jpy(v) for _, v in income)
    expense_total = sum(_to_jpy(v) for _, v in expenses)

    rows = [
        [f"Income Statement {prev.year}-{prev.month:02d}", ""],
        ["Account", label],
        ["Revenues", ""],
    ]
    rows += [[a, v] for a, v in income]
    rows.append(["total", _money(round(income_total), "JPY")])
    rows.append(["Expenses", ""])
    rows += [[a, v] for a, v in expenses]
    rows.append(["total", _money(round(expense_total), "JPY")])
    rows.append(["Net:", _money(round(income_total - expense_total), "JPY")])
    return rows


def _monthly_income_cells(account: str, idx: int, months: int) -> str:
    if account == "income:salary":
        # A modest raise four months before the end of the series.
        base = SALARY_JPY if idx < months - 4 else SALARY_JPY - 8000
        return _money(base, "JPY")
    if account == "income:sidework":
        return _money(round(RNG.uniform(0, SIDE_INCOME_JPY * 1.5)), "JPY") if RNG.random() > 0.25 else "0"
    if account == "income:cashback":
        return _money(round(RNG.uniform(150, 900)), "JPY")
    if account == "income:interest":
        return _money(round(RNG.uniform(0, 1600)), "JPY")
    # income:contracting — invoiced in EUR, paid partly in JPY.
    return "127.00 EUR, 6864 JPY" if idx >= months - 3 else "0"


def _monthly_expense_cells(account: str, currency: str, base: float, variance: float, idx: int, months: int) -> str:
    if currency == "MIXED":
        return "131.23 EUR, 66660 JPY" if idx == months - 2 else "0"
    if currency == "EUR":
        return _money(_jitter(base, variance), "EUR")
    return _money(round(_jitter(base, variance)), "JPY")


def monthly_income(as_of: date, months: int = 12) -> list[list[str]]:
    """Multi-month statement. The dashboard derives cashflow, YTD and the savings rate from it."""
    prev = as_of.replace(day=1) - timedelta(days=1)
    seq = _month_seq(prev, months)
    labels = [_label(y, m) for y, m in seq]
    last_day = (prev.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)

    income_rows = [
        [acct] + [_monthly_income_cells(acct, idx, months) for idx in range(months)]
        for acct in INCOME_LINES
    ]
    expense_rows = [
        [acct] + [_monthly_expense_cells(acct, cur, base, var, idx, months) for idx in range(months)]
        for acct, cur, base, var in EXPENSE_LINES
    ]

    income_totals = [sum(_to_jpy(row[1 + i]) for row in income_rows) for i in range(months)]
    expense_totals = [sum(_to_jpy(row[1 + i]) for row in expense_rows) for i in range(months)]

    rows = [
        [f"Income Statement {labels[0]}-01..{last_day.isoformat()}"] + [""] * months,
        ["Account"] + labels,
        ["Revenues"] + [""] * months,
    ]
    rows += income_rows
    rows.append(["total"] + [_money(round(t), "JPY") for t in income_totals])
    rows.append(["Expenses"] + [""] * months)
    rows += expense_rows
    rows.append(["total"] + [_money(round(t), "JPY") for t in expense_totals])
    rows.append(["Net:"] + [
        _money(round(income_totals[i] - expense_totals[i]), "JPY") for i in range(months)
    ])
    return rows


# ---------------------------------------------------------------------------
# Cron fixture
# ---------------------------------------------------------------------------


def cron_jobs(as_of: date) -> dict:
    """Mirror of the job list the Hermes cron API pushes into the dashboard."""
    stamp = f"{as_of.isoformat()}T04:00:00"


    def job(job_id, name, prompt, script, no_agent, expr, enabled, state, completed, status, paused_reason=None):
        return {
            "id": job_id,
            "name": name,
            "prompt": prompt,
            "skills": [],
            "skill": None,
            "model": None,
            "provider": None,
            "base_url": None,
            "script": script,
            "no_agent": no_agent,
            "context_from": None,
            "schedule": {"kind": "cron", "expr": expr, "display": expr},
            "schedule_display": expr,
            "repeat": {"times": None, "completed": completed},
            "enabled": enabled,
            "state": state,
            "paused_at": stamp if not enabled else None,
            "paused_reason": paused_reason,
            "created_at": "2026-01-05T01:18:35",
            "last_run_at": stamp,
            "last_status": status,
            "next_run_at": stamp if enabled else None,
        }

    return {
        "jobs": [
            job(
                "demo00000001",
                "Daily calendar summary",
                "List today's events with title and description, or say that the day is clear.",
                "daily-calendar-check.py",
                True,
                "30 22 * * *",
                True,
                "scheduled",
                42,
                "success",
            ),
            job(
                "demo00000002",
                "Weekly price snapshot",
                "Fetch the watchlist quotes and store them in the tracker.",
                "weekly-snapshot.sh",
                False,
                "0 6 * * 1",
                True,
                "scheduled",
                7,
                "success",
            ),
            job(
                "demo00000003",
                "Disk usage watchdog",
                "",
                "disk-usage.sh",
                True,
                "0 */6 * * *",
                False,
                "paused",
                118,
                "silent",
                "paused while the volume was resized",
            ),
        ]
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", default=date.today().isoformat(), help="reference date (YYYY-MM-DD)")
    args = parser.parse_args()
    as_of = date.fromisoformat(args.as_of)

    FINANCE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"generating demo fixtures as of {as_of}")

    write_csv(FINANCE_DIR / "bank_savings.csv", bank_savings())
    write_csv(FINANCE_DIR / "investment_value.csv", investment_value())
    write_csv(FINANCE_DIR / "investments_amount.csv", investments_amount())
    write_csv(FINANCE_DIR / "investments_cost.csv", investments_cost())
    write_csv(FINANCE_DIR / "investments-history-daily.csv", investment_history(as_of))
    write_csv(FINANCE_DIR / "last_month.csv", last_month(as_of))
    write_csv(FINANCE_DIR / "monthly_income.csv", monthly_income(as_of))

    cron_path = DEMO_DIR / "cron.json"
    cron_path.write_text(json.dumps(cron_jobs(as_of), indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {cron_path.relative_to(DEMO_DIR.parent)}")


if __name__ == "__main__":
    main()
