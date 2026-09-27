/**
 * Finance API client for Agora.
 * All endpoints return clean JSON — no CSV parsing needed.
 */

const API_BASE = "";

async function fetchJSON(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

// In-memory cache with 5h TTL for ETF tracker data (avoids re-hitting the API
// when switching tabs / period filters within 5 hours).
const CACHE_TTL_MS = 5 * 60 * 60 * 1000;
const etfCache = new Map(); // key -> {ts, data}

async function fetchWithCache(key, fetcher, isValid = () => true) {
  const hit = etfCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }
  const data = await fetcher();
  if (isValid(data)) {
    etfCache.set(key, { ts: Date.now(), data });
  }
  return data;
}

/**
 * Fetch bank savings data.
 * Returns: [{account, balance}]
 */
export async function getBankSavings() {
  return fetchJSON("/api/finance/bank-savings");
}

/**
 * Fetch investment current values (in EUR).
 * Returns: [{account, balance}]
 */
export async function getInvestmentValue() {
  return fetchJSON("/api/finance/investment-value");
}

/**
 * Fetch investment amounts (units held).
 * Returns: [{account, balance}]
 */
export async function getInvestmentAmounts() {
  return fetchJSON("/api/finance/investment-amounts");
}

/**
 * Fetch investment cost basis.
 * Returns: [{account, balance}]
 */
export async function getInvestmentCosts() {
  return fetchJSON("/api/finance/investment-costs");
}

/**
 * Fetch investment history (daily values).
 * Returns: [{account, ...dates}]
 */
export async function getInvestmentHistory() {
  return fetchJSON("/api/finance/investment-history");
}

/**
 * Fetch latest month cashflow.
 * Returns: [{account, value}]
 */
export async function getCashflowLatest() {
  return fetchJSON("/api/finance/cashflow/latest");
}

/**
 * Fetch monthly cashflow data.
 * Returns: [{account, ...months}]
 */
export async function getCashflowMonthly() {
  return fetchJSON("/api/finance/cashflow/monthly");
}

/**
 * Fetch JPY/EUR exchange rate.
 * Returns: {rate: 160}
 */
export async function getExchangeRate() {
  return fetchJSON("/api/finance/exchange-rate");
}

/**
 * Fetch ETF/crypto tracker data (proxied from finance-query.com / Yahoo fallback).
 * period: 24h | 1w | 1m | 6m | 1y | all
 * symbol: optional, restrict to one watchlist symbol (per-graph filters)
 * Returns: {period, etfs: [{symbol, name, currency, regularMarketPrice, regularMarketChangePercent, prices: [{date, close}]}]}
 */
export async function getEtfTracker(period = "1m", symbol = null) {
  const q = symbol ? `&symbol=${encodeURIComponent(symbol)}` : "";
  const key = `etf:${period}:${symbol || "*"}`;
  const hasData = (d) => !!(d && d.etfs && d.etfs.length > 0);
  return fetchWithCache(key, () => fetchJSON(`/api/finance/etf-tracker?period=${period}${q}`), hasData);
}

/**
 * Fetch the ETF tracker watchlist.
 * Returns: {etfs: [{symbol, name, currency, display?}]}
 */
export async function getEtfWatchlist() {
  const hasData = (d) => !!(d && d.etfs && d.etfs.length > 0);
  return fetchWithCache("etf:watchlist", () => fetchJSON("/api/finance/etf-watchlist"), hasData);
}

/**
 * Fetch all finance data in parallel.
 * Returns an object with all datasets keyed by name.
 */
export async function fetchAllFinanceData() {
  const [
    bank,
    invValue,
    invAmounts,
    invCosts,
    invHistory,
    cashflowLatest,
    cashflowMonthly,
    exchangeRate,
  ] = await Promise.all([
    getBankSavings().catch(() => []),
    getInvestmentValue().catch(() => []),
    getInvestmentAmounts().catch(() => []),
    getInvestmentCosts().catch(() => []),
    getInvestmentHistory().catch(() => []),
    getCashflowLatest().catch(() => []),
    getCashflowMonthly().catch(() => []),
    getExchangeRate().catch(() => ({ rate: 160 })),
  ]);

  return {
    bank,
    invValue,
    invAmounts,
    invCosts,
    invHistory,
    cashflowLatest,
    cashflowMonthly,
    exchangeRate,
  };
}
