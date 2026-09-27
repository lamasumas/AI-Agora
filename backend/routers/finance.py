"""Finance router — CSV-parsing endpoints for Agora finance dashboard."""

from fastapi import APIRouter, HTTPException
import csv
import os
import re
import time
import requests as http_requests

router = APIRouter(prefix="/api/finance", tags=["finance"])

FINANCE_DATA_DIR = os.getenv("FINANCE_DATA_DIR", "/data/finance")


def _csv_path(filename: str) -> str:
    p = os.path.join(FINANCE_DATA_DIR, filename)
    if not os.path.isfile(p):
        raise HTTPException(status_code=404, detail=f"CSV file not found: {filename}")
    return p


def _parse_value(raw: str) -> float | None:
    """Parse a value like '1434943 JPY', '1234.56 EUR', '1,234,567', or plain float.
    Returns the numeric portion or None if unparseable."""
    if not raw:
        return None
    s = raw.strip()
    # Remove currency suffix (e.g. " JPY", " EUR")
    s = re.sub(r"\s*(JPY|EUR|USD|GBP|CHF|CAD|AUD)\s*$", "", s, flags=re.IGNORECASE)
    # Remove any trailing non-numeric token (e.g. '"H4ZZ"', 'CHSI', 'BTC')
    s = re.sub(r"\s*[A-Za-z\"']\S*$", "", s)
    # Remove thousands separators (commas)
    s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _split_multi_currency(raw: str):
    """Split '127.0000000000000000000 EUR, 6864 JPY' into [(part_raw, value), ...].
    Returns None when there are not multiple amount+currency pairs."""
    parts = re.findall(
        r"([-+]?\d+(?:\.\d+)?\s*(?:JPY|EUR|USD|GBP|CHF|CAD|AUD))",
        raw,
        flags=re.IGNORECASE,
    )
    if len(parts) <= 1:
        return None
    out = []
    for p in parts:
        v = _parse_value(p)
        if v is not None:
            out.append((p.strip(), v))
    return out or None


def _read_simple_csv(filename: str, value_col: str | None = None):
    """Read a simple 2-column CSV (account, value) and return list of dicts.
    If value_col is None, uses the second column header as the key."""
    path = _csv_path(filename)
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Normalize keys (strip whitespace)
            clean = {k.strip(): v.strip() if v else v for k, v in row.items() if k}
            keys = list(clean.keys())
            if len(keys) < 2:
                continue
            account = clean[keys[0]]
            raw_val = clean[keys[1]]
            val = _parse_value(raw_val)
            vcol = value_col or keys[1]
            rows.append({"account": account, vcol: val, "raw": raw_val})
    return rows


def _read_cashflow_csv(filename: str, all_months: bool = False):
    """Parse hledger-style income statement CSV.

    Format:
        Row 1: title (e.g. "Income Statement 2026-05", "")
        Row 2+: header ("Account", "May") or ("Account", "2025-10", "2025-11", ...)
        Data rows: account, value(s)
        Section headers: "Revenues", "", "" / "Expenses", "", ""
        Totals: "total", value(s)
        Footer: "Net:", value(s)

    Returns for single-month: [{account, amount, raw}]
    Returns for multi-month: [{account, month1: raw_val, month2: raw_val, ...}]
    """
    path = _csv_path(filename)
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        all_rows = list(csv.reader(f))

    if len(all_rows) < 2:
        return []

    # Skip title row (row 0). Row 1 is the actual header.
    header = [c.strip() for c in all_rows[1]]
    # First column is always "Account"
    month_cols = [h for h in header[1:] if h]
    data_rows = all_rows[2:]

    for raw_row in data_rows:
        # Pad row to header length
        row = raw_row + [""] * (len(header) - len(raw_row))
        row = [c.strip() for c in row]

        account = row[0]

        # Skip section headers (Revenues, Expenses, empty account) and Net:/total
        if not account or account in ("Revenues", "Expenses", "total", "Net:"):
            continue

        if all_months:
            # Multi-month: return {account, month1: raw, month2: raw, ...}
            entry = {"account": account}
            for i, month in enumerate(month_cols):
                raw_val = row[i + 1] if i + 1 < len(row) else ""
                entry[month] = raw_val
            rows.append(entry)
        else:
            # Single-month: return {account, amount, raw}
            # Multi-currency cells (e.g. "127 EUR, 6864 JPY") are split into
            # one entry per currency so no amount is dropped by the parser.
            raw_val = row[1] if len(row) > 1 else ""
            val = _parse_value(raw_val)
            split = _split_multi_currency(raw_val)
            if split:
                for part_raw, part_val in split:
                    rows.append({"account": account, "amount": part_val, "raw": part_raw})
            else:
                rows.append({"account": account, "amount": val, "raw": raw_val})

    return rows


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/bank-savings")
async def bank_savings():
    """Parse bank_savings.csv → [{account, balance, raw}]"""
    return _read_simple_csv("bank_savings.csv", value_col="balance")


@router.get("/investment-value")
async def investment_value():
    """Parse investment_value.csv → [{account, value, raw}]"""
    return _read_simple_csv("investment_value.csv", value_col="value")


@router.get("/investment-amounts")
async def investment_amounts():
    """Parse investments_amount.csv → [{account, amount, raw}]"""
    return _read_simple_csv("investments_amount.csv", value_col="amount")


@router.get("/investment-costs")
async def investment_costs():
    """Parse investments_cost.csv → [{account, cost, raw}]"""
    return _read_simple_csv("investments_cost.csv", value_col="cost")


@router.get("/investment-history")
async def investment_history():
    """Parse investments-history-daily.csv (wide format: account + date columns).
    Returns [{account, history: {date: value, ...}}]"""
    path = _csv_path("investments-history-daily.csv")
    result = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            clean = {k.strip(): (v.strip() if v else v) for k, v in row.items() if k}
            keys = list(clean.keys())
            if not keys:
                continue
            account = clean[keys[0]]
            history = {}
            for col in keys[1:]:
                val = _parse_value(clean[col])
                if val is not None:
                    history[col] = val
            result.append({"account": account, "history": history})
    return result


@router.get("/cashflow/latest")
async def cashflow_latest():
    """Parse last_month.csv → [{account, amount, raw}]"""
    return _read_cashflow_csv("last_month.csv", all_months=False)


@router.get("/cashflow/monthly")
async def cashflow_monthly():
    """Parse monthly_income.csv → [{account, month1: raw, month2: raw, ...}]"""
    return _read_cashflow_csv("monthly_income.csv", all_months=True)


@router.get("/exchange-rate")
async def exchange_rate():
    """Proxy to frankfurter.app for JPY→EUR rate. Fallback 160."""
    try:
        resp = http_requests.get(
            "https://api.frankfurter.app/latest?from=JPY&to=EUR",
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        rate = data.get("rates", {}).get("EUR", 160)
        return {"from": "JPY", "to": "EUR", "rate": rate}
    except Exception:
        return {"from": "JPY", "to": "EUR", "rate": 160}


# ---------------------------------------------------------------------------
# ETF / crypto price tracker
# Primary: finance-query.com hosted API (batch). Fallback: Yahoo chart API.
# ---------------------------------------------------------------------------

ETF_WATCHLIST = [
    {"symbol": "CHSI.DE", "name": "UBS MSCI World ex USA"},
    {"symbol": "GLDA.DE", "name": "Amundi Physical Gold ETC"},
    {"symbol": "H4ZZ.DE", "name": "HSBC EURO STOXX 50"},
    {"symbol": "UEQD.DE", "name": "UBS Core S&P 500 (EUR hedged)"},
    {"symbol": "BTC-EUR", "name": "Bitcoin"},
    {"symbol": "ETH-EUR", "name": "Ethereum"},
    {"symbol": "VOO", "name": "Vanguard S&P 500"},
    {"symbol": "^NDX", "display": "NDX", "name": "Nasdaq 100"},
    {"symbol": "^N225", "display": "NI225", "name": "Nikkei 225"},
    {"symbol": "^KS11", "display": "KOSPI", "name": "KOSPI"},
]

# Currency per watchlist symbol (finance-query chart candles do not carry currency)
ETF_CURRENCIES = {
    "CHSI.DE": "EUR",
    "GLDA.DE": "EUR",
    "H4ZZ.DE": "EUR",
    "UEQD.DE": "EUR",
    "BTC-EUR": "EUR",
    "ETH-EUR": "EUR",
    "VOO": "USD",
    "^NDX": "USD",
    "^N225": "JPY",
    "^KS11": "KRW",
}

# Minimum candles before a finance-query result is considered usable.
# Below this, the endpoint tries the Yahoo fallback (serial + paced).
ETF_MIN_POINTS = 5

# period key -> (Yahoo range, Yahoo interval)
ETF_RANGE_CONFIG = {
    "24h": ("1d", "5m"),
    "1w": ("5d", "15m"),
    "1m": ("1mo", "1d"),
    "6m": ("6mo", "1d"),
    "1y": ("1y", "1d"),
    "all": ("max", "1wk"),
}

_YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]

_YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
}


def _fetch_yahoo_chart(symbol: str, yrange: str, interval: str):
    """Fetch one symbol's price series from Yahoo Finance chart API. Returns None on failure.
    Retries once on rate-limit (429) / errors, alternating between query1/query2 hosts."""
    data = None
    for attempt in range(2):
        host = _YAHOO_HOSTS[attempt % len(_YAHOO_HOSTS)]
        url = f"https://{host}/v8/finance/chart/{symbol}"
        try:
            resp = http_requests.get(
                url,
                params={"range": yrange, "interval": interval},
                headers=_YAHOO_HEADERS,
                timeout=12,
            )
            if resp.status_code == 429:
                time.sleep(1.0 + attempt)
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception:
            time.sleep(0.5)
    if data is None:
        return None
    result = ((data or {}).get("chart") or {}).get("result")
    if not result:
        return None
    meta = result[0].get("meta", {})
    timestamps = result[0].get("timestamp") or []
    quote = ((result[0].get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []
    prices = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        prices.append({"date": ts, "close": round(float(close), 4)})
    return {
        "symbol": symbol,
        "currency": meta.get("currency", ""),
        "regularMarketPrice": meta.get("regularMarketPrice"),
        "regularMarketChangePercent": meta.get("regularMarketChangePercent"),
        "prices": prices,
    }


def _parse_finance_query_candles(candles: list) -> list:
    """Normalize finance-query candles [{timestamp, open, high, low, close, volume}] to [{date, close}]."""
    prices = []
    for c in candles or []:
        if c.get("close") is None:
            continue
        prices.append({"date": c["timestamp"], "close": round(float(c["close"]), 4)})
    return prices


def _fetch_finance_query_batch(symbols: list, yrange: str, interval: str) -> dict:
    """Fetch multiple symbols in ONE request from the finance-query.com hosted API.
    Returns {symbol: {symbol, currency, regularMarketPrice, regularMarketChangePercent, prices}}.
    Empty dict on failure."""
    url = "https://finance-query.com/v2/charts"
    try:
        resp = http_requests.get(
            url,
            params={"symbols": ",".join(symbols), "range": yrange, "interval": interval},
            headers=_YAHOO_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {}
    out = {}
    for entry in (data or {}).get("charts") or []:
        sym = entry.get("symbol")
        prices = _parse_finance_query_candles(((entry.get("chart") or {}).get("candles")) or [])
        if sym and prices:
            out[sym] = {
                "symbol": sym,
                "currency": ETF_CURRENCIES.get(sym, ""),
                "regularMarketPrice": prices[-1]["close"],
                "regularMarketChangePercent": None,
                "prices": prices,
            }
    return out


@router.get("/etf-watchlist")
async def etf_watchlist():
    """Return the configured tracker watchlist (with currency + display label)."""
    return {"etfs": [
        {**etf, "currency": ETF_CURRENCIES.get(etf["symbol"], "")}
        for etf in ETF_WATCHLIST
    ]}


@router.get("/etf-tracker")
async def etf_tracker(period: str = "1m", symbol: str | None = None):
    """Fetch price history for watchlist items.

    Primary source: finance-query.com hosted API (batch, one request).
    Fallback: direct Yahoo Finance chart API (per symbol, serial + paced), used when a
    symbol comes back empty or with too few candles (<ETF_MIN_POINTS) from finance-query.
    period: 24h | 1w | 1m | 6m | 1y | all
    Optional symbol: restrict to one watchlist symbol.
    Returns {"period": ..., "etfs": [{symbol, name, currency, regularMarketPrice,
             regularMarketChangePercent, prices: [{date, close}]}]}
    """
    if period not in ETF_RANGE_CONFIG:
        raise HTTPException(status_code=400, detail=f"period must be one of: {', '.join(ETF_RANGE_CONFIG)}")
    if symbol:
        symbol = symbol.strip()
        if symbol not in [e["symbol"] for e in ETF_WATCHLIST]:
            raise HTTPException(status_code=400, detail=f"unknown symbol: {symbol}")
        symbols = [symbol]
    else:
        symbols = [etf["symbol"] for etf in ETF_WATCHLIST]

    yrange, interval = ETF_RANGE_CONFIG[period]
    charts = _fetch_finance_query_batch(symbols, yrange, interval)

    # Per-symbol fallback: empty or too sparse from finance-query -> try Yahoo directly.
    # Serial + paced (no parallel bursts) because Yahoo 429s on bursts.
    missing = [s for s in symbols if not charts.get(s) or len(charts[s]["prices"]) < ETF_MIN_POINTS]
    if missing:
        for s in missing:
            chart = _fetch_yahoo_chart(s, yrange, interval)
            if chart:
                charts[chart["symbol"]] = chart
            time.sleep(1.0)

    results = []
    for etf in ETF_WATCHLIST:
        chart = charts.get(etf["symbol"])
        if chart:
            chart["name"] = etf["name"]
            results.append(chart)
    return {"period": period, "etfs": results}
