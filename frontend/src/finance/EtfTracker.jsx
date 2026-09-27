import { useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import theme from "../library/theme.js";
import { getEtfTracker, getEtfWatchlist } from "./api.js";

const PERIODS = [
  ["24h", "24H"],
  ["1w", "1W"],
  ["1m", "1M"],
  ["6m", "6M"],
  ["1y", "1Y"],
  ["all", "ALL"],
];

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", JPY: "¥", KRW: "₩" };

const COLORS = ["#f7931a", "#627eea", "#d4af37", "#00c49f", "#8884d8", theme.accent, "#f43f5e", "#34d399", "#fb923c", "#a78bfa"];

function fmtPrice(v, currency) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const sym = CURRENCY_SYMBOLS[currency] || "";
  const digits = v >= 1000 ? 0 : v >= 100 ? 2 : v >= 1 ? 2 : 4;
  return sym + v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(ts, period) {
  const d = new Date(ts * 1000);
  if (period === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (period === "1w") return d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (period === "all") return d.toLocaleDateString([], { month: "short", year: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

function periodChange(prices) {
  if (!prices || prices.length < 2) return null;
  const first = prices[0].close;
  const last = prices[prices.length - 1].close;
  if (!first) return null;
  return { last, pct: ((last - first) / first) * 100 };
}

function EtfCard({ item, color, isMobile }) {
  const [period, setPeriod] = useState("1m");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEtfTracker(period, item.symbol)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, item.symbol]);

  const etf = (data && data.etfs && data.etfs[0]) || null;
  const change = periodChange(etf ? etf.prices : null);
  const chartData = (etf && etf.prices ? etf.prices : []).map(p => ({ date: p.date, label: fmtDate(p.date, period), close: p.close }));
  const label = item.display || item.symbol;
  const gradId = `etf-grad-${item.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 14 : 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: isMobile ? 8 : 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: theme.fontMono, fontSize: isMobile ? 13 : 15, fontWeight: 700, color: theme.text }}>{label}</div>
            <div style={{ fontSize: isMobile ? 10 : 11, color: theme.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: theme.fontMono, fontSize: isMobile ? 14 : 16, fontWeight: 700, color: theme.text }}>
            {fmtPrice(change ? change.last : (etf ? etf.regularMarketPrice : null), item.currency)}
          </div>
          {change && (
            <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 600, color: change.pct >= 0 ? theme.success : theme.danger }}>
              {change.pct >= 0 ? "▲" : "▼"} {Math.abs(change.pct).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: isMobile ? 8 : 10, flexWrap: "wrap" }}>
        {PERIODS.map(([key, plabel]) => (
          <button key={key} onClick={() => setPeriod(key)} style={{
            padding: "3px 8px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: isMobile ? 9 : 10,
            fontWeight: 500,
            background: period === key ? theme.accent : theme.bgSubtle,
            color: period === key ? theme.bg : theme.textMuted,
            transition: "all 0.2s",
          }}>
            {plabel}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: theme.textDim, fontSize: isMobile ? 11 : 12 }}>
          ⏳ Loading…
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: theme.danger, fontSize: isMobile ? 11 : 12 }}>
          ⚠️ {error}
        </div>
      ) : chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={isMobile ? 150 : 190}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                <stop offset="95%" stopColor={color} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
            <XAxis dataKey="label" stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 8 : 10 }} minTickGap={40} tickLine={false} />
            <YAxis stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 8 : 10 }} tickFormatter={v => fmtPrice(v, item.currency)} width={isMobile ? 48 : 60} domain={["auto", "auto"]} tickLine={false} />
            <Tooltip
              formatter={(v) => [fmtPrice(v, item.currency), "Price"]}
              labelFormatter={(l) => `${label} · ${l}`}
              contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="close" stroke={color} fill={`url(#${gradId})`} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: color }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ textAlign: "center", padding: "30px 0", color: theme.textDim, fontSize: isMobile ? 11 : 12 }}>
          Not enough data for this period.
        </div>
      )}
    </div>
  );
}

export default function EtfTracker() {
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getEtfWatchlist()
      .then(d => { if (!cancelled) setItems(d.etfs || []); })
      .catch(e => { if (!cancelled) setListError(e.message); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ marginBottom: isMobile ? 24 : 36 }}>
      <h2 style={{ fontFamily: theme.fontHeading, fontSize: isMobile ? 12 : 14, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: isMobile ? 12 : 18, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-block", width: 24, height: 2, background: theme.accent }} />ETF Price Trackers
      </h2>

      {loadingList && (
        <div style={{ textAlign: "center", padding: "40px 0", color: theme.textDim, fontSize: isMobile ? 13 : 15 }}>
          ⏳ Loading watchlist…
        </div>
      )}
      {!loadingList && listError && (
        <div style={{ background: "#1a0a0a", border: `1px solid ${theme.danger}`, borderRadius: 12, padding: isMobile ? 14 : 20, color: theme.textMuted, fontSize: isMobile ? 12 : 13 }}>
          ⚠️ Could not load watchlist: {listError}
        </div>
      )}
      {!loadingList && !listError && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: theme.textDim, fontSize: isMobile ? 12 : 14 }}>
          No data available.
        </div>
      )}
      {!loadingList && !listError && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(420px, 1fr))", gap: isMobile ? 12 : 16 }}>
          {items.map((item, i) => (
            <EtfCard key={item.symbol} item={item} color={COLORS[i % COLORS.length]} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  );
}
