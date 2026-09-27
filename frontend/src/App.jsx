import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from "recharts";
import {
  CSV_FILES, fmtCurrency, safePct,
  classifyInvestments, mergeInvestmentData,
  groupExpensesByCategory, groupMonthlyCashflow,
} from "./lib/parsers.js";
import * as financeApi from "./finance/api.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import MentalLibrary from "./library/index.js";
import CalendarDashboard from "./calendar/CalendarDashboard.jsx";
import CronDashboard from "./cron/CronDashboard.jsx";
import EtfTracker from "./finance/EtfTracker.jsx";
import theme from "./library/theme.js";

const CustomTooltip = ({ active, payload, currency = "EUR" }) => {
  if (!active || !payload?.length) return null;
  const sym = currency === "JPY" ? "¥" : "€";
  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, padding: "8px 14px", borderRadius: theme.borderRadiusSm, fontSize: 13, color: theme.text }}>
      <strong>{payload[0].name || payload[0].dataKey}</strong>: {sym}{Math.abs(payload[0].value).toFixed(2)}
    </div>
  );
};


function AnimatedNumber({ target, formatter }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    setDisplayed(0);
    if (!target) return;
    const duration = 1400;
    const startTime = performance.now();
    let raf;
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(target * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [target]);
  return <>{formatter(displayed)}</>;
}

function StatCard({ title, value, sub, accent = theme.accent, isMobile, animTarget, animFormatter }) {
  const showAnim = animTarget !== undefined && animFormatter !== undefined && animTarget > 0;
  return (
    <div style={{ background: "linear-gradient(135deg, #161b27 0%, #0f1117 100%)", border: `1px solid ${theme.border}`, borderRadius: theme.borderRadius, padding: isMobile ? "16px" : "24px 28px", position: "relative", overflow: "hidden", transition: "all 0.3s ease" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "16px 16px 0 0" }} />
      <div style={{ fontSize: 10, color: theme.textDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: theme.text, fontFamily: theme.fontMono, lineHeight: 1.2 }}>
        {showAnim ? <AnimatedNumber target={animTarget} formatter={animFormatter} /> : value}
      </div>
      {sub && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, isMobile }) {
  return (
    <div style={{ marginBottom: isMobile ? 24 : 36 }}>
      <h2 style={{ fontFamily: theme.fontHeading, fontSize: isMobile ? 12 : 14, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: isMobile ? 12 : 18, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-block", width: 24, height: 2, background: theme.accent }} />{title}
      </h2>
      {children}
    </div>
  );
}

function FinanceDashboard() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({});
  const [jpyRate, setJpyRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errors, setErrors] = useState({});
  const [selectedCashflowMonth, setSelectedCashflowMonth] = useState(null);
  const [invHistoryTimeframe, setInvHistoryTimeframe] = useState("week");
  const [invHistoryIgnoreZero, setInvHistoryIgnoreZero] = useState(true);

  const [isMobile, setIsMobile] = useState(false);
  const [hideValues, setHideValues] = useState(() => { try { return localStorage.getItem("dash-hideValues") === "true"; } catch { return false; } });
  const [displayCurrency, setDisplayCurrency] = useState(() => { try { return localStorage.getItem("dash-currency") || "EUR"; } catch { return "EUR"; } });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const data = await financeApi.getExchangeRate();
        // API returns EUR-per-JPY (~0.006); dashboard needs JPY-per-EUR (~160)
        const rate = data.rate || 160;
        setJpyRate(rate < 1 ? Math.round(1 / rate) : rate);
      } catch {
        console.warn("Failed to fetch JPY/EUR rate, using fallback 160");
        setJpyRate(160);
      }
    };
    fetchExchangeRate();
  }, []);

  // Load all data via Agora API
  const loadData = useCallback(async () => {
    const errs = {};
    try {
      const [
        bankRows, invValueRows, invAmountRows, invCostRows,
        invHistoryRows, cashflowLatestRows, cashflowMonthlyRows,
      ] = await Promise.all([
        financeApi.getBankSavings().catch(e => { errs.bank = e.message; return []; }),
        financeApi.getInvestmentValue().catch(e => { errs.invValue = e.message; return []; }),
        financeApi.getInvestmentAmounts().catch(e => { errs.invAmount = e.message; return []; }),
        financeApi.getInvestmentCosts().catch(e => { errs.invCost = e.message; return []; }),
        financeApi.getInvestmentHistory().catch(e => { errs.invHistory = e.message; return []; }),
        financeApi.getCashflowLatest().catch(e => { errs.lastMonth = e.message; return []; }),
        financeApi.getCashflowMonthly().catch(e => { errs.monthlyIncome = e.message; return []; }),
      ]);
      setData({
        bank: bankRows,
        invValue: invValueRows,
        invAmount: invAmountRows,
        invCost: invCostRows,
        invHistory: invHistoryRows,
        lastMonth: cashflowLatestRows,
        monthlyIncome: cashflowMonthlyRows,
      });
    } catch (e) {
      errs.general = e.message;
    }
    setErrors(errs);
    setLastUpdated(new Date().toLocaleString());
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, []);

  const allUploaded = ["bank", "lastMonth", "monthlyIncome", "invAmount", "invValue", "invCost", "invHistory"].every(k => data[k] && data[k].length > 0);

  // API returns: {account, balance, raw} for bank; {account, value/cost/amount, raw} for investments
  // Extract currency from the raw string, numeric value from the parsed field
  const _cleanName = (acct) => (acct || "").replace(/"/g, "").replace("assets:investments:crypto:", "").replace("assets:investments:etf:", "").replace("assets:investments:", "").replace("assets:bank:", "");

  const bank = (data.bank || [])
    .filter(r => r.account !== "total")
    .map(r => {
      const cur = (r.raw || "").match(/JPY|EUR|USD/i)?.[0]?.toUpperCase() || "EUR";
      return { account: _cleanName(r.account), value: r.balance || 0, currency: cur };
    });
  const invValue = (data.invValue || [])
    .filter(r => r.account !== "total")
    .map(r => ({ account: _cleanName(r.account), value: r.value || 0, currency: "EUR" }));
  const invAmount = (data.invAmount || [])
    .filter(r => r.account !== "total")
    .map(r => ({ account: _cleanName(r.account), value: r.amount || 0, currency: "EUR", raw: r.raw }));
  const invCost = (data.invCost || [])
    .filter(r => r.account !== "total")
    .map(r => ({ account: _cleanName(r.account), value: r.cost || 0, currency: "EUR" }));

  const invHistoryData = (() => {
    const rows = data.invHistory || [];
    if (rows.length === 0) return { dates: [], assets: [] };
    // API returns [{account, history: {date: val, ...}}]
    const first = rows[0] || {};
    if (first.history && typeof first.history === "object") {
      const dates = Object.keys(first.history).sort();
      const assets = rows.filter(r => r.account !== "total" && r.account !== "assets:investments:cash" && r.account !== "assets:investments:crypto:_").map(r => ({
        name: _cleanName(r.account),
        account: r.account,
        values: Object.entries(r.history || {}).map(([date, value]) => ({ date, value })),
      }));
      return { dates, assets };
    }
    // Fallback: flat columnar format
    const dates = Object.keys(first).filter(k => k !== "account").sort();
    const assets = rows.filter(r => r.account !== "total").map(r => {
      const vals = [];
      dates.forEach(d => {
        const v = parseFloat(String(r[d]).replace(/[^0-9.-]/g, "")) || 0;
        if (v !== 0) vals.push({ date: d, value: v });
      });
      return {
        name: _cleanName(r.account),
        account: r.account,
        values: vals,
      };
    });
    return { dates, assets };
  })();

  const monthlyIncomeData = (() => {
    const rows = data.monthlyIncome || [];
    if (rows.length === 0) return { months: [], dataByMonth: {} };
    // API returns [{account: "income:salary", "2025-10": "0", "2025-11": "300611 JPY", ...}]
    // Cells may carry two amounts ("127.00 EUR, 6864 JPY"); the helper keeps both.
    return groupMonthlyCashflow(rows);
  })();

  // Use selected month or fall back to lastMonth data
  const selectedMonthData = selectedCashflowMonth && monthlyIncomeData.dataByMonth[selectedCashflowMonth]
    ? monthlyIncomeData.dataByMonth[selectedCashflowMonth]
    : null;
  const cashflow = selectedMonthData
    ? { income: selectedMonthData.income, expenses: selectedMonthData.expenses, month: selectedCashflowMonth }
    : (() => {
        const rows = data.lastMonth || [];
        if (rows.length === 0) return { income: [], expenses: [], month: "" };
        // API returns [{account: "income:salary", amount: 300611, raw: "300611 JPY"}]
        const income = [];
        const expenses = [];
        rows.forEach(r => {
          if (!r.account) return;
          const val = Math.abs(r.amount || 0);
          if (val === 0) return;
          const cur = (r.raw || "").match(/JPY|EUR|USD/i)?.[0]?.toUpperCase() || "EUR";
          const acct = r.account.toLowerCase();
          const label = r.account.split(":").pop();
          const entry = { account: r.account, label, value: val, currency: cur };
          if (acct.startsWith("income") || acct.includes("revenue")) {
            income.push(entry);
          } else if (acct.startsWith("expenses")) {
            expenses.push(entry);
          }
        });
        return { income, expenses, month: "" };
      })();

  const investments = mergeInvestmentData(invValue, invAmount, invCost);

  const toDisplay = (v, sourceCur) => {
    if (sourceCur === displayCurrency) return v;
    if (sourceCur === "JPY" && displayCurrency === "EUR") return jpyRate ? v / jpyRate : v;
    if (sourceCur === "EUR" && displayCurrency === "JPY") return jpyRate ? v * jpyRate : v;
    return v;
  };
  const curSymbol = displayCurrency === "JPY" ? "¥" : "€";
  const fmt = (v, cur) => fmtCurrency(v, cur || displayCurrency);
  const totalBankEur = bank.reduce((s, b) => s + toDisplay(b.value, b.currency), 0);
  const totalInvEur = investments.reduce((s, i) => s + toDisplay(i.eur, "EUR"), 0);
  const totalNetWorth = totalBankEur + totalInvEur;
  const totalIncomeEur = cashflow.income.reduce((s, i) => s + toDisplay(i.value, i.currency), 0);
  const totalExpEur = cashflow.expenses.reduce((s, e) => s + toDisplay(e.value, e.currency), 0);

  const ytdYear = monthlyIncomeData.months.length > 0 ? monthlyIncomeData.months[monthlyIncomeData.months.length - 1].slice(0, 4) : String(new Date().getFullYear());
  const ytdMonths = monthlyIncomeData.months.filter(m => m.startsWith(ytdYear));
  const ytdIncome = ytdMonths.reduce((sum, m) => sum + ((monthlyIncomeData.dataByMonth[m] || {}).income || []).reduce((s, e) => s + toDisplay(e.value, e.currency), 0), 0);
  const ytdExpenses = ytdMonths.reduce((sum, m) => sum + ((monthlyIncomeData.dataByMonth[m] || {}).expenses || []).reduce((s, e) => s + toDisplay(e.value, e.currency), 0), 0);
  const ytdNet = ytdIncome - ytdExpenses;

  const monthlyRates = monthlyIncomeData.months
    .map(m => {
      const inc = ((monthlyIncomeData.dataByMonth[m] || {}).income || []).reduce((s, e) => s + toDisplay(e.value, e.currency), 0);
      const exp = ((monthlyIncomeData.dataByMonth[m] || {}).expenses || []).reduce((s, e) => s + toDisplay(e.value, e.currency), 0);
      return { month: m, income: inc, expenses: exp, rate: inc > 0 ? (inc - exp) / inc : null };
    })
    .filter(x => x.rate !== null);
  const avgSavingsRate = monthlyRates.length > 0 ? (monthlyRates.reduce((s, x) => s + x.rate, 0) / monthlyRates.length) * 100 : null;

  // Classify investments into ETFs, Crypto, Gold
  const { etfs, crypto, gold, etfsValue, cryptoValue, goldValue } = classifyInvestments(investments);

  const etfsPct = safePct(etfsValue, totalInvEur, 1);
  const cryptoPct = safePct(cryptoValue, totalInvEur, 1);
  const goldPct = safePct(goldValue, totalInvEur, 1);

  // Survival Fund: months you can survive without income
  const avgMonthlyExpEur = monthlyIncomeData.months.length > 0
    ? monthlyIncomeData.months.reduce((sum, m) => {
        const d = monthlyIncomeData.dataByMonth[m];
        const exp = d ? d.expenses.reduce((s, e) => s + toDisplay(e.value, e.currency), 0) : 0;
        return sum + exp;
      }, 0) / monthlyIncomeData.months.filter(m => {
        const d = monthlyIncomeData.dataByMonth[m];
        return d && (d.income.length > 0 || d.expenses.length > 0);
      }).length
    : 0;
  const survivalMonths = avgMonthlyExpEur > 0 ? totalBankEur / avgMonthlyExpEur : 0;
  const survivalColor = survivalMonths >= 12 ? theme.success : survivalMonths >= 6 ? theme.warning : theme.danger;

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "investments", label: "Investments" },
    { key: "cashflow", label: "Cashflow" },
    { key: "etfs", label: "ETF Tracker" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'Inter', sans-serif", padding: isMobile ? "16px 12px" : "32px 24px", transition: "background 0.3s, color 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 24 : 36, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: isMobile ? 24 : 34, fontWeight: 800, color: theme.heading, margin: 0, letterSpacing: "-0.02em" }}>
              Agora <span style={{ color: theme.accent }}>Dashboard</span>
            </h1>
            <div style={{ fontSize: isMobile ? 11 : 13, color: theme.textFaint, marginTop: 4 }}>
              {cashflow.month
                || (monthlyIncomeData.months.length > 0
                  ? `Latest month: ${monthlyIncomeData.months[monthlyIncomeData.months.length - 1]}`
                  : "No finance data loaded")}
              {lastUpdated && <span style={{ marginLeft: 12, fontSize: 10, opacity: 0.7 }}>Updated: {lastUpdated}</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, color: theme.textDim }}>JPY/EUR:</label>
              <span style={{
                width: 50, padding: "4px 6px", background: theme.bgSubtle, border: `1px solid ${theme.border}`, borderRadius: 6,
                color: jpyRate ? theme.accent : theme.textDim, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center"
              }}>{jpyRate || "..."}</span>
              <input type="number" placeholder="Override" value={jpyRate || ""} onChange={e => setJpyRate(parseFloat(e.target.value) || null)}
                style={{ width: 50, padding: "4px 6px", background: theme.bgSubtle, border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, fontSize: 11 }} title="Enter manual rate to override" />
            </div>
            {allUploaded && TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 500,
                background: tab === t.key ? theme.accent : theme.bgSubtle, color: tab === t.key ? theme.bg : theme.textMuted, transition: "all 0.2s",
              }}>{t.label}</button>
            ))}

            <button onClick={() => { const next = displayCurrency === "EUR" ? "JPY" : "EUR"; setDisplayCurrency(next); try { localStorage.setItem("dash-currency", next); } catch { /* storage may be unavailable */ } }} style={{
              padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, cursor: "pointer", fontSize: 11, fontWeight: 500,
              background: theme.bgSubtle, color: theme.accent, transition: "all 0.2s", display: "flex", alignItems: "center", gap: 4,
            }} title={`Switch to ${displayCurrency === "EUR" ? "JPY" : "EUR"}`}>
              {displayCurrency === "EUR" ? "€ EUR" : "¥ JPY"}
            </button>
            <button onClick={() => { const v = !hideValues; setHideValues(v); try { localStorage.setItem("dash-hideValues", v); } catch { /* storage may be unavailable */ } }} style={{
              padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, cursor: "pointer", fontSize: 14,
              background: hideValues ? "#2a1a0a" : theme.bgSubtle, color: hideValues ? theme.warning : "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 4,
            }} title={hideValues ? "Show Values" : "Hide Values"}>
              {hideValues ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {/* Loading / Error state */}
        {loading && (
          <div style={{ textAlign: "center", padding: isMobile ? "40px 0" : "60px 0", color: theme.textDim, fontSize: isMobile ? 13 : 15 }}>
            ⏳ Loading finance data…
          </div>
        )}
        {!loading && Object.keys(errors).length > 0 && (
          <div style={{ background: "#1a0a0a", border: `1px solid ${theme.danger}`, borderRadius: 12, padding: isMobile ? 14 : 20, marginBottom: isMobile ? 20 : 28 }}>
            <div style={{ color: theme.danger, fontWeight: 600, marginBottom: 8, fontSize: isMobile ? 12 : 14 }}>⚠️ Could not load some files:</div>
            {Object.entries(errors).map(([key, msg]) => (
              <div key={key} style={{ fontSize: isMobile ? 11 : 13, color: theme.textMuted, marginBottom: 4 }}>
                <span style={{ color: theme.danger, fontFamily: "monospace" }}>{CSV_FILES[key] || key}</span> — {msg}
              </div>
            ))}
            <div style={{ marginTop: isMobile ? 8 : 12, fontSize: isMobile ? 10 : 12, color: theme.textDim }}>
              These come from the CSV files in FINANCE_DATA_DIR. Check the path and the file format.
            </div>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {allUploaded && tab === "overview" && (
          <ErrorBoundary title="Overview" isMobile={isMobile}>
          <>
            <Section title="Net Worth Summary" isMobile={isMobile}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(210px, 1fr))", gap: isMobile ? 12 : 16 }}>
                <StatCard title="Total Net Worth" value={hideValues ? "——.——" : fmt(totalNetWorth)} sub={hideValues ? "Bank + Investments" : `Bank + Investments (${displayCurrency})`} accent={theme.accent} isMobile={isMobile} animTarget={hideValues ? undefined : totalNetWorth} animFormatter={(v) => fmt(v)} />
                <StatCard title="Bank Savings" value={hideValues ? "——.——" : fmt(totalBankEur)} sub={hideValues ? "Multiple accounts" : bank.map(b => `${b.account}: ${fmt(toDisplay(b.value, b.currency))}`).join(" · ")} accent={theme.accent} isMobile={isMobile} animTarget={hideValues ? undefined : totalBankEur} animFormatter={(v) => fmt(v)} />
                <StatCard title="Investments" value={hideValues ? "——.——" : fmt(totalInvEur)} sub={`${investments.length} assets`} accent={theme.warning} isMobile={isMobile} animTarget={hideValues ? undefined : totalInvEur} animFormatter={(v) => fmt(v)} />
                <StatCard title="Monthly Net" value={fmt(totalIncomeEur - totalExpEur)} sub={`In: ${curSymbol}${totalIncomeEur.toFixed(0)} / Out: ${curSymbol}${totalExpEur.toFixed(0)}`} accent="#a78bfa" isMobile={isMobile} animTarget={totalIncomeEur - totalExpEur} animFormatter={(v) => fmt(v)} />
                <StatCard title={`Year Saved ${ytdYear}`} value={fmt(ytdNet)} sub={`In: ${curSymbol}${ytdIncome.toFixed(0)} / Out: ${curSymbol}${ytdExpenses.toFixed(0)}`} accent={ytdNet >= 0 ? theme.success : theme.danger} isMobile={isMobile} animTarget={ytdNet} animFormatter={(v) => fmt(v)} />
                <StatCard title="Savings Rate" value={totalIncomeEur > 0 ? `${safePct(totalIncomeEur - totalExpEur, totalIncomeEur)}%` : "N/A"} sub={totalIncomeEur > 0 ? `${fmt(totalIncomeEur - totalExpEur)} saved of ${fmt(totalIncomeEur)}` : "No income data"} accent={totalIncomeEur > 0 ? (parseFloat(safePct(totalIncomeEur - totalExpEur, totalIncomeEur)) >= 20 ? theme.success : theme.warning) : theme.textDim} isMobile={isMobile} />
                <StatCard title="Avg Savings Rate" value={avgSavingsRate !== null ? `${avgSavingsRate.toFixed(1)}%` : "N/A"} sub={avgSavingsRate !== null ? `Avg of ${monthlyRates.length} months` : "No income data"} accent={avgSavingsRate !== null ? (avgSavingsRate >= 20 ? theme.success : theme.warning) : theme.textDim} isMobile={isMobile} />
                <StatCard title="Survival Fund" value={survivalMonths > 0 ? `${survivalMonths.toFixed(1)} months` : "N/A"} sub={survivalMonths > 0 ? `${fmt(totalBankEur)} / ~${fmt(avgMonthlyExpEur)}/mo avg` : "No expense data"} accent={survivalColor} isMobile={isMobile} animTarget={survivalMonths > 0 ? survivalMonths : undefined} animFormatter={(v) => `${v.toFixed(1)} months`} />
              </div>
            </Section>

            <Section title="Asset Allocation" isMobile={isMobile}>
              <div style={{ filter: hideValues ? "blur(8px)" : "none", transition: "filter 0.3s", pointerEvents: hideValues ? "none" : "auto", userSelect: hideValues ? "none" : "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20 }}>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 180 : 230}>
                    <PieChart>
                      <Pie data={[{ name: "Bank", value: totalBankEur }, { name: "Investments", value: totalInvEur }]}
                        cx="50%" cy="50%" innerRadius={isMobile ? 40 : 60} outerRadius={isMobile ? 65 : 95} paddingAngle={3} dataKey="value">
                        <Cell fill={theme.accent} /><Cell fill={theme.warning} />
                      </Pie>
                      <Tooltip content={<CustomTooltip currency={displayCurrency} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 12 : 20, marginTop: 4 }}>
                    {[["Bank", theme.accent, fmt(totalBankEur)], ["Investments", theme.warning, fmt(totalInvEur)]].map(([l, c, v]) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: theme.textMuted }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />{l} <span style={{ color: theme.text }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <div style={{ fontSize: 11, color: theme.textDim, marginBottom: isMobile ? 12 : 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Bank Accounts</div>
                  {bank.map(b => {
                    const eur = toDisplay(b.value, b.currency);
                    return (
                      <div key={b.account} style={{ marginBottom: isMobile ? 14 : 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: theme.text, textTransform: "capitalize" }}>{b.account}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 12, color: theme.text }}>{fmt(b.value, b.currency)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: theme.bgSubtle }}>
                          <div style={{ height: 5, borderRadius: 3, background: theme.accent, width: `${safePct(eur, totalBankEur, 0)}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: theme.textDim, marginTop: 4 }}>≈ {fmt(eur)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            </Section>

            <Section title="Net Worth Trend" isMobile={isMobile}>
              {(() => {
                const totalByDate = new Map();
                invHistoryData.assets.forEach(asset => {
                  asset.values.forEach(v => {
                    const existing = totalByDate.get(v.date) || 0;
                    totalByDate.set(v.date, existing + v.value);
                  });
                });
                const sortedDates = Array.from(totalByDate.keys()).sort();
                const chartData = sortedDates.map(date => ({
                  date,
                  label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  value: totalByDate.get(date)
                }));
                const startVal = chartData.length > 0 ? chartData[0].value : 0;
                const endVal = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
                const change = endVal - startVal;
                const changePct = startVal > 0 ? (change / startVal * 100) : 0;
                return chartData.length > 0 ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 12 : 16, marginBottom: isMobile ? 16 : 20 }}>
                      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                        <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Portfolio Start</div>
                        <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(startVal)}</div>
                      </div>
                      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                        <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Portfolio Now</div>
                        <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: theme.accent, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(endVal)}</div>
                      </div>
                      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                        <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Total Change</div>
                        <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: change >= 0 ? theme.success : theme.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                          {change >= 0 ? "+" : ""}{fmt(change)} ({change >= 0 ? "+" : ""}{changePct.toFixed(1)}%)
                        </div>
                      </div>
                    </div>
                    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                      <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={theme.accent} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={theme.accent} stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                          <XAxis dataKey="label" stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 9 : 11 }} />
                          <YAxis stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 10 : 12 }} tickFormatter={v => `${curSymbol}${(v / 1000).toFixed(1)}k`} />
                          <Tooltip formatter={v => fmt(v)} contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.border }} />
                          <Area type="monotone" dataKey="value" stroke={theme.accent} fill="url(#netWorthGradient)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "30px 0", color: theme.textDim, fontSize: isMobile ? 12 : 14 }}>
                    No historical data available yet.
                  </div>
                );
              })()}
            </Section>
          </>
          </ErrorBoundary>
        )}

        {/* ── INVESTMENTS ── */}
        {allUploaded && tab === "investments" && (
          <ErrorBoundary title="Investments" isMobile={isMobile}>
          <>
            <Section title="Portfolio Breakdown" isMobile={isMobile}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.3fr", gap: isMobile ? 12 : 20 }}>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                    <PieChart>
                      <Pie data={investments.map(d => ({ name: d.name, value: d.eur }))}
                        cx="50%" cy="50%" innerRadius={isMobile ? 40 : 55} outerRadius={isMobile ? 70 : 100} paddingAngle={3} dataKey="value">
                        {investments.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip currency={displayCurrency} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 12 : 24, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: isMobile ? 11 : 13 }}>
                    <thead>
                      <tr style={{ color: theme.textDim, borderBottom: `1px solid ${theme.border}` }}>
                        <th style={{ textAlign: "left", padding: "0 0 8px" }}>Asset</th>
                        <th style={{ textAlign: "right", padding: "0 0 8px" }}>Amount</th>
                        <th style={{ textAlign: "right", padding: "0 0 8px" }}>EUR</th>
                        <th style={{ textAlign: "right", padding: "0 0 8px" }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investments.map(d => (
                        <tr key={d.name} style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
                          <td style={{ padding: "8px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: "inline-block", flexShrink: 0 }} />
                              <span style={{ color: theme.text, fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>{d.name}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: "right", color: theme.textMuted, padding: "8px 0", fontSize: isMobile ? 10 : 12 }}>{d.amount?.toFixed(5)} {d.unit}</td>
                          <td style={{ textAlign: "right", color: theme.accent, padding: "8px 0", fontSize: isMobile ? 10 : 12 }}>{fmt(d.eur)}</td>
                          <td style={{ textAlign: "right", color: theme.textDim, padding: "8px 0", fontSize: isMobile ? 10 : 12 }}>{safePct(d.eur, totalInvEur)}%</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2} style={{ paddingTop: 12, color: theme.textDim, fontSize: isMobile ? 11 : 13 }}>Total</td>
                        <td style={{ textAlign: "right", paddingTop: 12, color: theme.accent, fontWeight: 700, fontSize: isMobile ? 12 : 15 }}>{fmt(totalInvEur)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            <Section title="ETFs vs Crypto vs Gold" isMobile={isMobile}>
              <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? "10px 14px" : "12px 20px", marginBottom: isMobile ? 12 : 20, display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap", width: "fit-content" }}>
                <div style={{ fontSize: isMobile ? 10 : 11, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Target:</div>
                <div style={{ display: "flex", gap: isMobile ? 12 : 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted }}><span style={{ color: theme.warning, fontWeight: 600 }}>ETF</span> 65%</span>
                  <span style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted }}><span style={{ color: "#d4af37", fontWeight: 600 }}>Gold</span> 15%</span>
                  <span style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted }}><span style={{ color: "#627eea", fontWeight: 600 }}>Crypto</span> 20%</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20 }}>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 180 : 230}>
                    <PieChart>
                      <Pie data={[
                        { name: "ETFs", value: etfsValue },
                        { name: "Crypto", value: cryptoValue },
                        { name: "Gold", value: goldValue }
                      ]}
                        cx="50%" cy="50%" innerRadius={isMobile ? 40 : 60} outerRadius={isMobile ? 65 : 95} paddingAngle={3} dataKey="value">
                        <Cell fill={theme.warning} /><Cell fill="#627eea" /><Cell fill="#d4af37" />
                      </Pie>
                      <Tooltip content={<CustomTooltip currency={displayCurrency} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 12 : 20, marginTop: 4 }}>
                    {[["ETFs", theme.warning, etfsPct], ["Crypto", "#627eea", cryptoPct], ["Gold", "#d4af37", goldPct]].map(([l, c, v]) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: theme.textMuted }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />{l} <span style={{ color: theme.text }}>{v}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 12 : 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: isMobile ? 12 : 20 }}>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>ETFs</div>
                      <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: theme.warning, fontFamily: "'JetBrains Mono', monospace" }}>{etfsPct}%</div>
                      <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>{etfs.length} assets</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Crypto</div>
                      <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#627eea", fontFamily: "'JetBrains Mono', monospace" }}>{cryptoPct}%</div>
                      <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>{crypto.length} assets</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Gold</div>
                      <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#d4af37", fontFamily: "'JetBrains Mono', monospace" }}>{goldPct}%</div>
                      <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>{gold.length} assets</div>
                    </div>
                  </div>
                  {etfs.length > 0 && (
                    <div style={{ marginBottom: isMobile ? 12 : 16 }}>
                      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>ETFs</div>
                      {etfs.map(d => (
                        <div key={d.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: isMobile ? 11 : 12 }}>
                          <span style={{ color: theme.text }}>{d.name}</span>
                          <span style={{ color: theme.text, fontFamily: "monospace" }}>{safePct(d.eur, totalInvEur)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {crypto.length > 0 && (
                    <div style={{ marginBottom: isMobile ? 12 : 16 }}>
                      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Crypto</div>
                      {crypto.map(d => (
                        <div key={d.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: isMobile ? 11 : 12 }}>
                          <span style={{ color: theme.text }}>{d.name}</span>
                          <span style={{ color: theme.text, fontFamily: "monospace" }}>{safePct(d.eur, totalInvEur)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {gold.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Gold</div>
                      {gold.map(d => (
                        <div key={d.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: isMobile ? 11 : 12 }}>
                          <span style={{ color: theme.text }}>{d.name}</span>
                          <span style={{ color: theme.text, fontFamily: "monospace" }}>{safePct(d.eur, totalInvEur)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Allocation Drift" isMobile={isMobile}>
              {(() => {
                const targets = [
                  { name: "ETFs", target: 65, actual: parseFloat(etfsPct), color: theme.warning },
                  { name: "Crypto", target: 20, actual: parseFloat(cryptoPct), color: "#627eea" },
                  { name: "Gold", target: 15, actual: parseFloat(goldPct), color: "#d4af37" },
                ];
                return (
                  <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                    {targets.map(tgt => {
                      const drift = tgt.actual - tgt.target;
                      const absDrift = Math.abs(drift);
                      const driftColor = absDrift <= 5 ? theme.success : absDrift <= 10 ? theme.warning : theme.danger;
                      const statusLabel = absDrift <= 5 ? "On Track" : absDrift <= 10 ? "Drifting" : "Rebalance";
                      return (
                        <div key={tgt.name} style={{ marginBottom: isMobile ? 16 : 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 3, background: tgt.color, display: "inline-block" }} />
                              <span style={{ fontSize: isMobile ? 12 : 14, color: theme.text, fontWeight: 600 }}>{tgt.name}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
                              <span style={{ fontSize: isMobile ? 11 : 12, color: theme.textDim }}>Target: {tgt.target}%</span>
                              <span style={{ fontSize: isMobile ? 12 : 14, color: theme.text, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{tgt.actual.toFixed(1)}%</span>
                              <span style={{ fontSize: isMobile ? 10 : 11, color: driftColor, padding: "2px 8px", borderRadius: 4, background: driftColor + "20" }}>
                                {drift >= 0 ? "+" : ""}{drift.toFixed(1)}% · {statusLabel}
                              </span>
                            </div>
                          </div>
                          <div style={{ position: "relative", height: 8, borderRadius: 4, background: theme.bgSubtle, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${tgt.actual}%`, borderRadius: 4, background: tgt.color, opacity: 0.8, transition: "width 0.5s" }} />
                            <div style={{ position: "absolute", left: `${tgt.target}%`, top: -2, width: 2, height: 12, background: theme.border, borderRadius: 1, opacity: 0.6 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Section>


            <Section title="Top Movers (7d)" isMobile={isMobile}>
              {(() => {
                const movers = invHistoryData.assets.filter(asset => investments.some(inv => inv.name === asset.name)).map(asset => {
                  const values = asset.values;
                  if (values.length < 2) return null;
                  // Use latest data date instead of browser date to handle stale data
                  const latestDate = new Date(values[values.length - 1].date);
                  const weekAgo = new Date(latestDate);
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  // Find the value closest to (and on or before) 7 days ago
                  const onOrBefore = values.filter(v => new Date(v.date) <= weekAgo);
                  const startVal = onOrBefore.length > 0 ? onOrBefore[onOrBefore.length - 1].value : values[0].value;
                  const endVal = values[values.length - 1].value;
                  if (startVal === 0) return null;
                  const pctChange = ((endVal - startVal) / startVal) * 100;
                  const eurChange = endVal - startVal;
                  const colorIdx = investments.findIndex(i => i.name === asset.name);
                  const color = colorIdx >= 0 ? investments[colorIdx].color : theme.textDim;
                  return { name: asset.name, pctChange, eurChange, startVal, endVal, color };
                }).filter(Boolean).sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
                return movers.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 10 : 14 }}>
                    {movers.map(m => (
                      <div key={m.name} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: "inline-block" }} />
                            <span style={{ fontSize: isMobile ? 11 : 13, color: theme.text, fontWeight: 600 }}>{m.name}</span>
                          </div>
                          <span style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, color: m.pctChange >= 0 ? theme.success : theme.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                            {m.pctChange >= 0 ? "▲" : "▼"} {Math.abs(m.pctChange).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ fontSize: isMobile ? 10 : 11, color: theme.textDim }}>
                          {m.eurChange >= 0 ? "+" : ""}{fmt(m.eurChange)} this week
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: theme.textDim, fontSize: isMobile ? 12 : 14 }}>
                    No data for the last 7 days.
                  </div>
                );
              })()}
            </Section>

            <Section title="Rebalancing Suggestions" isMobile={isMobile}>
              {(() => {
                const targets = [
                  { name: "ETFs", target: 65, value: etfsValue, color: theme.warning },
                  { name: "Crypto", target: 20, value: cryptoValue, color: "#627eea" },
                  { name: "Gold", target: 15, value: goldValue, color: "#d4af37" },
                ];
                const suggestions = targets.filter(tgt => {
                  const actualPct = parseFloat(safePct(tgt.value, totalInvEur));
                  return Math.abs(actualPct - tgt.target) > 5;
                }).map(tgt => {
                  const actualPct = parseFloat(safePct(tgt.value, totalInvEur));
                  const targetValue = (tgt.target / 100) * totalInvEur;
                  const gap = targetValue - tgt.value;
                  return { ...tgt, actualPct, targetValue, gap };
                });
                return suggestions.length > 0 ? (
                  <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                    <div style={{ fontSize: isMobile ? 11 : 12, color: theme.textDim, marginBottom: isMobile ? 14 : 20, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: theme.warning }}>⚡</span> To rebalance your portfolio to target allocations without selling:
                    </div>
                    {suggestions.map(s => (
                      <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "10px 0" : "14px 0", borderBottom: `1px solid ${theme.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
                          <div>
                            <div style={{ fontSize: isMobile ? 12 : 14, color: theme.text, fontWeight: 600 }}>{s.name}</div>
                            <div style={{ fontSize: isMobile ? 10 : 11, color: theme.textDim }}>{s.actualPct.toFixed(1)}% actual → {s.target}% target</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 700, color: s.gap > 0 ? theme.success : theme.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                            {s.gap > 0 ? "Buy" : "Sell"} {fmt(Math.abs(s.gap))}
                          </div>
                          <div style={{ fontSize: isMobile ? 9 : 10, color: theme.textDim }}>to reach target</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: isMobile ? 12 : 16, padding: isMobile ? "10px 12px" : "12px 16px", background: theme.bgHover, borderRadius: 10 }}>
                      <div style={{ fontSize: isMobile ? 10 : 11, color: theme.textDim, marginBottom: 6 }}>💡 Prioritize new contributions to underweight categories</div>
                      {suggestions.filter(s => s.gap > 0).sort((a, b) => b.gap - a.gap).map((s, i) => (
                        <div key={s.name} style={{ fontSize: isMobile ? 11 : 13, color: theme.text, marginBottom: 4 }}>
                          {i + 1}. <span style={{ color: s.color, fontWeight: 600 }}>{s.name}</span> — contribute up to {fmt(s.gap)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24, textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                    <div style={{ fontSize: isMobile ? 12 : 14, color: theme.accent, fontWeight: 600 }}>Portfolio is balanced</div>
                    <div style={{ fontSize: isMobile ? 10 : 12, color: theme.textDim, marginTop: 4 }}>All categories within ±5% of target. No action needed.</div>
                  </div>
                );
              })()}
            </Section>

            <Section title="Investment Cost vs Value" isMobile={isMobile}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20 }}>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                    <BarChart data={investments.map(d => ({
                      name: d.name,
                      Cost: d.cost || 0,
                      Value: d.eur || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                      <XAxis dataKey="name" stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 9 : 11 }} angle={-45} textAnchor="end" height={70} />
                      <YAxis stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 10 : 12 }} tickFormatter={v => `${curSymbol}${v.toFixed(0)}`} />
                      <Tooltip formatter={v => `${curSymbol}${v.toFixed(2)}`} contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.border }} />
                      <Bar dataKey="Cost" fill={theme.danger} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Value" fill={theme.accent} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 16 : 24, marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: theme.textMuted }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: theme.danger, display: "inline-block" }} />Cost
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: theme.textMuted }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: theme.accent, display: "inline-block" }} />Value
                    </div>
                  </div>
                </div>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 12 : 24, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: isMobile ? 11 : 13 }}>
                    <thead>
                      <tr style={{ color: theme.textDim, borderBottom: `1px solid ${theme.border}` }}>
                        <th style={{ textAlign: "left", padding: "0 0 8px" }}>Asset</th>
                        <th style={{ textAlign: "right", padding: "0 0 8px" }}>Cost</th>
                        <th style={{ textAlign: "right", padding: "0 0 8px" }}>Value</th>
                        <th style={{ textAlign: "right", padding: "0 0 8px" }}>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investments.map(d => {
                        const pl = (d.eur || 0) - (d.cost || 0);
                        const plPct = d.cost ? ((pl / d.cost) * 100) : 0;
                        return (
                          <tr key={d.name} style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
                            <td style={{ padding: "8px 0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: "inline-block", flexShrink: 0 }} />
                                <span style={{ color: theme.text, fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>{d.name}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: "right", color: theme.danger, padding: "8px 0", fontSize: isMobile ? 10 : 12 }}>{fmt(d.cost || 0)}</td>
                            <td style={{ textAlign: "right", color: theme.accent, padding: "8px 0", fontSize: isMobile ? 10 : 12 }}>{fmt(d.eur || 0)}</td>
                            <td style={{ textAlign: "right", color: pl >= 0 ? theme.success : theme.danger, padding: "8px 0", fontSize: isMobile ? 10 : 12 }}>{pl >= 0 ? "+" : ""}{fmt(pl)} ({plPct.toFixed(1)}%)</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td style={{ paddingTop: 12, color: theme.textDim, fontSize: isMobile ? 11 : 13 }}>Total</td>
                        <td style={{ textAlign: "right", paddingTop: 12, color: theme.danger, fontWeight: 700, fontSize: isMobile ? 12 : 15 }}>{fmt(investments.reduce((s, d) => s + (d.cost || 0), 0))}</td>
                        <td style={{ textAlign: "right", paddingTop: 12, color: theme.accent, fontWeight: 700, fontSize: isMobile ? 12 : 15 }}>{fmt(investments.reduce((s, d) => s + (d.eur || 0), 0))}</td>
                        <td style={{ textAlign: "right", paddingTop: 12, color: (investments.reduce((s, d) => s + (d.eur || 0) - (d.cost || 0), 0)) >= 0 ? theme.success : theme.danger, fontWeight: 700, fontSize: isMobile ? 12 : 15 }}>
                          {fmt(investments.reduce((s, d) => s + (d.eur || 0) - (d.cost || 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            {(() => {
              const assetColors = ["#f7931a", "#627eea", "#d4af37", "#00c49f", "#8884d8", theme.accent, "#f43f5e", "#34d399", "#fb923c", "#a78bfa"];

              const timeframes = [
                { key: "week", label: "Last Week" },
                { key: "monthWeekly", label: "This Month Weekly" },
                { key: "sixMonths", label: "6 Months" },
                { key: "yearMonthly", label: "This Year Monthly" },
                { key: "byYear", label: "By Years" }
              ];

              const getWeekKey = (date) => {

                const d = new Date(date);
                const jan1 = new Date(d.getFullYear(), 0, 1);
                const days = Math.floor((d - jan1) / 86400000);
                const dayOfYear = days + jan1.getDay();
                const week = Math.ceil(dayOfYear / 7);
                return `${d.getFullYear()}-W${week.toString().padStart(2, '0')}`;
              };

              const getMonthKey = (date) => {
                const d = new Date(date);
                return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
              };

              const getYearKey = (date) => {
                return new Date(date).getFullYear().toString();
              };



              const filterHistoryByTimeframe = () => {
                if (!invHistoryData.assets.length) return { chartData: [], activeAssets: [], xAxisLabel: "" };

                // Use latest data date instead of browser date for stale-data resilience
                const allDates = invHistoryData.assets.flatMap(a => a.values.map(v => v.date));
                const today = allDates.length > 0 ? new Date(allDates.sort().pop()) : new Date();
                const assetColorMap = new Map();
                let colorIdx = 0;

                // First pass: identify active assets and assign colors
                const heldAssets = new Set(invAmount.map(a => a.account));
                const activeAssets = [];
                invHistoryData.assets.forEach((asset) => {
                  if (invHistoryIgnoreZero && !heldAssets.has(asset.name)) return;
                  const filteredValues = asset.values.filter(v => {
                    const d = new Date(v.date);
                    switch (invHistoryTimeframe) {
                      case "week": {
                        const weekAgo = new Date(today);
                        weekAgo.setDate(today.getDate() - 7);
                        return d >= weekAgo;
                      }
                      case "monthWeekly":
                        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                      case "sixMonths": {
                        const sixMonthsAgo = new Date(today);
                        sixMonthsAgo.setMonth(today.getMonth() - 6);
                        return d >= sixMonthsAgo;
                      }
                      case "yearMonthly":
                        return d.getFullYear() === today.getFullYear();
                      case "byYear":
                        return true;
                      default:
                        return true;
                    }
                  });

                  if (filteredValues.length > 0) {
                    if (!assetColorMap.has(asset.name)) {
                      assetColorMap.set(asset.name, assetColors[colorIdx % assetColors.length]);
                      colorIdx++;
                    }
                    activeAssets.push({ ...asset, color: assetColorMap.get(asset.name), filteredValues });
                  }
                });

                // Second pass: aggregate data
                const periodMap = new Map();

                activeAssets.forEach(asset => {
                  const valuesByPeriod = new Map();

                  asset.filteredValues.forEach(v => {
                    let periodKey;
                    let periodLabel;

                    switch (invHistoryTimeframe) {
                      case "week":
                        periodKey = v.date;
                        periodLabel = new Date(v.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
                        break;
                      case "monthWeekly":
                        periodKey = getWeekKey(v.date);
                        periodLabel = `Week ${periodKey.split('-W')[1]}`;
                        break;
                      case "sixMonths":
                        periodKey = getMonthKey(v.date);
                        periodLabel = new Date(v.date).toLocaleDateString("en-US", { month: "short" });
                        break;
                      case "yearMonthly":
                        periodKey = getMonthKey(v.date);
                        periodLabel = new Date(v.date).toLocaleDateString("en-US", { month: "short" });
                        break;
                      case "byYear":
                        periodKey = getYearKey(v.date);
                        periodLabel = periodKey;
                        break;
                      default:
                        periodKey = v.date;
                        periodLabel = v.date;
                    }

                    if (!valuesByPeriod.has(periodKey)) {
                      valuesByPeriod.set(periodKey, { values: [], label: periodLabel, sortKey: v.date });
                    }
                    valuesByPeriod.get(periodKey).values.push(v.value);
                  });

                  valuesByPeriod.forEach((data, periodKey) => {
                    if (!periodMap.has(periodKey)) {
                      periodMap.set(periodKey, {
                        period: periodKey,
                        label: data.label,
                        sortDate: new Date(data.sortKey)
                      });
                    }
                    periodMap.get(periodKey)[asset.name] = data.values[data.values.length - 1];
                  });
                });

                // Sort by date
                const chartData = Array.from(periodMap.values()).sort((a, b) => a.sortDate - b.sortDate);

                const xAxisLabels = {
                  week: "Date",
                  monthWeekly: "Week",
                  sixMonths: "Month",
                  yearMonthly: "Month",
                  byYear: "Year"
                };

                return { chartData, activeAssets, xAxisLabel: xAxisLabels[invHistoryTimeframe] || "Date" };
              };

              const { chartData, activeAssets, xAxisLabel } = filterHistoryByTimeframe();

              // Calculate total start/end values
              const totalStartValue = activeAssets.reduce((sum, asset) => {
                const firstValue = asset.filteredValues.length > 0 ? asset.filteredValues[0].value : 0;
                return sum + firstValue;
              }, 0);

              const totalEndValue = activeAssets.reduce((sum, asset) => {
                const lastValue = asset.filteredValues.length > 0 ? asset.filteredValues[asset.filteredValues.length - 1].value : 0;
                return sum + lastValue;
              }, 0);

              const totalChange = totalEndValue - totalStartValue;
              const totalChangePct = totalStartValue > 0 ? ((totalChange / totalStartValue) * 100) : 0;

              return (
                <Section title="Investment Value History" isMobile={isMobile}>
                  <div style={{ display: "flex", gap: isMobile ? 8 : 12, marginBottom: isMobile ? 16 : 24, flexWrap: "wrap" }}>
                    {timeframes.map(tf => (
                      <button
                        key={tf.key}
                        onClick={() => setInvHistoryTimeframe(tf.key)}
                        style={{
                          padding: isMobile ? "8px 12px" : "10px 16px",
                          borderRadius: 8,
                          border: "none",
                          cursor: "pointer",
                          fontSize: isMobile ? 11 : 12,
                          fontWeight: 500,
                          background: invHistoryTimeframe === tf.key ? theme.accent : theme.bgSubtle,
                          color: invHistoryTimeframe === tf.key ? theme.bg : theme.textMuted,
                          transition: "all 0.2s"
                        }}
                      >
                        {tf.label}
                      </button>
                    ))}
                      <button
                        onClick={() => setInvHistoryIgnoreZero(v => !v)}
                        title="Ignore investments with 0 current holdings"
                        style={{
                          padding: isMobile ? "8px 12px" : "10px 16px",
                          borderRadius: 8,
                          border: "none",
                          cursor: "pointer",
                          fontSize: isMobile ? 11 : 12,
                          fontWeight: 500,
                          background: invHistoryIgnoreZero ? theme.accent : theme.bgSubtle,
                          color: invHistoryIgnoreZero ? theme.bg : theme.textMuted,
                          transition: "all 0.2s"
                        }}
                      >
                        {invHistoryIgnoreZero ? "Hide 0-holdings: ON" : "Hide 0-holdings: OFF"}
                      </button>
                  </div>

                  {chartData.length > 0 && activeAssets.length > 0 ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(3, 1fr)", gap: isMobile ? 12 : 16, marginBottom: isMobile ? 16 : 24 }}>
                        <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                          <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Start Value</div>
                          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(totalStartValue)}</div>
                        </div>
                        <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                          <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>End Value</div>
                          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: theme.accent, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(totalEndValue)}</div>
                        </div>
                        <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                          <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Change</div>
                          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: totalChange >= 0 ? theme.success : theme.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                            {totalChange >= 0 ? "+" : ""}{fmt(totalChange)} ({totalChange >= 0 ? "+" : ""}{totalChangePct.toFixed(1)}%)
                          </div>
                        </div>
                      </div>

                      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24, marginBottom: isMobile ? 16 : 24 }}>
                        <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
                          <AreaChart data={chartData}>
                            <defs>
                              {activeAssets.map((asset) => (
                                <linearGradient key={asset.name} id={`gradient-${asset.name}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={asset.color} stopOpacity={0.6} />
                                  <stop offset="95%" stopColor={asset.color} stopOpacity={0.1} />
                                </linearGradient>
                              ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                            <XAxis
                              dataKey="label"
                              stroke={theme.textDim}
                              tick={{ fill: theme.textMuted, fontSize: isMobile ? 9 : 11 }}
                              label={{ value: xAxisLabel, position: "insideBottom", offset: -5, fill: theme.textDim, fontSize: 10 }}
                            />
                            <YAxis
                              stroke={theme.textDim}
                              tick={{ fill: theme.textMuted, fontSize: isMobile ? 10 : 12 }}
                              tickFormatter={v => `${curSymbol}${(v / 1000).toFixed(1)}k`}
                            />
                            <Tooltip
                              formatter={(v, name) => [fmt(v), name]}
                              labelFormatter={(label) => `${xAxisLabel}: ${label}`}
                              contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.border }}
                            />
                            {activeAssets.map((asset) => (
                              <Area
                                key={asset.name}
                                type="monotone"
                                dataKey={asset.name}
                                stroke={asset.color}
                                fill={`url(#gradient-${asset.name})`}
                                strokeWidth={2}
                                dot={true}
                                activeDot={{ r: 4, fill: asset.color }}
                              />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legend */}
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: isMobile ? 12 : 20 }}>
                        {activeAssets.map(asset => (
                          <div key={asset.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: isMobile ? 10 : 11, color: theme.textMuted }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: asset.color, display: "inline-block" }} />
                            <span>{asset.name}</span>
                            <span style={{ color: theme.text, fontFamily: "monospace" }}>
                              ({fmt(asset.filteredValues[asset.filteredValues.length - 1].value)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: isMobile ? "30px 0" : "40px 0", color: theme.textDim, fontSize: isMobile ? 12 : 14 }}>
                      No historical data available for the selected timeframe.
                    </div>
                  )}
                </Section>
              );
            })()}
          </>
          </ErrorBoundary>
        )}

        {/* ── CASHFLOW ── */}
        {allUploaded && tab === "cashflow" && (
          <ErrorBoundary title="Cashflow" isMobile={isMobile}>
          <>
            <Section title="Income vs Expenses" isMobile={isMobile}>
              {/* Month Selector */}
              <div style={{ marginBottom: isMobile ? 16 : 24 }}>
                <label style={{ display: "block", fontSize: isMobile ? 11 : 12, color: theme.textDim, marginBottom: 8 }}>Select Month</label>
                <select
                  value={selectedCashflowMonth || ""}
                  onChange={e => setSelectedCashflowMonth(e.target.value || null)}
                  style={{
                    background: theme.bgSubtle,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: isMobile ? "10px 12px" : "12px 16px",
                    color: theme.text,
                    fontSize: isMobile ? 13 : 14,
                    cursor: "pointer",
                    minWidth: 140,
                  }}
                >
                  <option value="">Current (Last Month)</option>
                  {monthlyIncomeData.months.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: isMobile ? 12 : 16, marginBottom: isMobile ? 12 : 20 }}>
                <StatCard title="Total Income" value={fmt(totalIncomeEur)} sub={`${cashflow.income.length} sources`} accent={theme.accent} isMobile={isMobile} animTarget={totalIncomeEur} animFormatter={(v) => fmt(v)} />
                <StatCard title="Total Expenses" value={fmt(totalExpEur)} sub={`${cashflow.expenses.length} categories`} accent={theme.danger} isMobile={isMobile} animTarget={totalExpEur} animFormatter={(v) => fmt(v)} />
                <StatCard title="Net Savings" value={fmt(totalIncomeEur - totalExpEur)} accent={totalIncomeEur > totalExpEur ? theme.success : theme.danger} isMobile={isMobile} animTarget={totalIncomeEur - totalExpEur} animFormatter={(v) => fmt(v)} />
              </div>
              <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 12 : 24 }}>
                <ResponsiveContainer width="100%" height={Math.max(isMobile ? 250 : 200, (cashflow.income.length + cashflow.expenses.length) * (isMobile ? 28 : 36))}>
                  <BarChart layout="vertical"
                    data={[
                      ...cashflow.income.map(i => ({ name: i.label, value: toDisplay(i.value, i.currency), type: "income" })),
                      ...cashflow.expenses.map(e => ({ name: e.label, value: -toDisplay(e.value, e.currency), type: "expense" })),
                    ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
                    <XAxis type="number" stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 10 : 12 }} tickFormatter={v => `${curSymbol}${Math.abs(v).toFixed(0)}`} />
                    <YAxis type="category" dataKey="name" stroke={theme.textDim} tick={{ fill: theme.textMuted, fontSize: isMobile ? 10 : 12 }} width={isMobile ? 80 : 110} />
                    <Tooltip formatter={v => [`${curSymbol}${Math.abs(v).toFixed(2)}`, v > 0 ? "Income" : "Expense"]} contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.border }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {[...cashflow.income, ...cashflow.expenses].map((_, i) => (
                        <Cell key={i} fill={i < cashflow.income.length ? theme.success : theme.danger} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Expense Breakdown" isMobile={isMobile}>
              {(() => {
                const grouped = groupExpensesByCategory(cashflow.expenses, toDisplay);
                return (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20 }}>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <div style={{ fontSize: 11, color: theme.textDim, marginBottom: isMobile ? 12 : 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>By Category</div>
                  <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
                    <PieChart>
                      <Pie
                        data={grouped.map(g => ({ name: g.label, value: g.value }))}
                        cx="50%" cy="50%" innerRadius={isMobile ? 45 : 65} outerRadius={isMobile ? 75 : 105} paddingAngle={2} dataKey="value"
                      >
                        {grouped.map((g, i) => (
                          <Cell key={i} fill={g.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={v => fmt(v)} contentStyle={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.border }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: isMobile ? 6 : 10, marginTop: 8 }}>
                    {grouped.map((g) => {
                      const pct = parseFloat(safePct(g.value, totalExpEur, 1));
                      return (
                        <div key={g.category} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: isMobile ? 9 : 11, color: theme.textMuted }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color, display: "inline-block" }} />
                          <span>{g.label}</span>
                          <span style={{ color: theme.text, fontFamily: "monospace" }}>{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
                  <div style={{ fontSize: 11, color: theme.textDim, marginBottom: isMobile ? 12 : 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Details</div>
                  {grouped.map((g) => {
                    const pct = parseFloat(safePct(g.value, totalExpEur, 1));
                    return (
                      <div key={g.category} style={{ marginBottom: isMobile ? 14 : 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color, display: "inline-block" }} />
                            <span style={{ fontSize: isMobile ? 12 : 14, color: theme.text }}>{g.label}</span>
                          </div>
                          <span style={{ fontFamily: "monospace", fontSize: isMobile ? 11 : 13, color: theme.text }}>
                            {fmt(g.value)} <span style={{ color: theme.textDim }}>({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        {/* Subcategory breakdown */}
                        {g.subcategories.length > 1 && g.subcategories.map((sub, si) => {
                          const subEur = toDisplay(sub.value, sub.currency);
                          return (
                            <div key={si} style={{ display: "flex", justifyContent: "space-between", paddingLeft: 16, marginBottom: 2, fontSize: isMobile ? 10 : 12 }}>
                              <span style={{ color: theme.textDim, textTransform: "capitalize" }}>{sub.label}</span>
                              <span style={{ fontFamily: "monospace", color: theme.textDim }}>{fmt(subEur)}</span>
                            </div>
                          );
                        })}
                        <div style={{ height: 5, borderRadius: 3, background: theme.bgSubtle, marginTop: 4 }}>
                          <div style={{ height: 5, borderRadius: 3, background: g.color, width: `${pct}%`, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
                );
              })()}
            </Section>
          </>
          </ErrorBoundary>
        )}
        {/* ── ETF TRACKER ── */}
        {tab === "etfs" && (
          <ErrorBoundary title="ETF Tracker" isMobile={isMobile}>
            <EtfTracker />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

// ─── Global App Shell with Navigation ───
export default function App() {
  const location = useLocation();
  const isCalendar = location.pathname === "/" || location.pathname === "/calendar" || location.pathname.startsWith("/calendar");
  const isLibrary = location.pathname.startsWith("/library");
  const isFinance = location.pathname.startsWith("/finance");
  const isCron = location.pathname.startsWith("/cron");

  return (
    <>
      {/* Global nav bar — shared across all tabs */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: theme.bg, borderBottom: `1px solid ${theme.border}`,
        display: "flex", justifyContent: "center", gap: 0, padding: "0 1rem",
      }}>
        <Link to="/" style={{
          padding: "10px 20px", textDecoration: "none", fontSize: 12, fontWeight: 600,
          color: isCalendar ? "#3b82f6" : theme.textDim,
          borderBottom: isCalendar ? "2px solid #3b82f6" : "2px solid transparent",
          transition: "all 0.2s", letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          📅 Calendar
        </Link>
        <Link to="/library" style={{
          padding: "10px 20px", textDecoration: "none", fontSize: 12, fontWeight: 600,
          color: isLibrary ? "#06b6d4" : theme.textDim,
          borderBottom: isLibrary ? "2px solid #06b6d4" : "2px solid transparent",
          transition: "all 0.2s", letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          🧠 Library
        </Link>
        <Link to="/finance" style={{
          padding: "10px 20px", textDecoration: "none", fontSize: 12, fontWeight: 600,
          color: isFinance ? theme.accent : theme.textDim,
          borderBottom: isFinance ? `2px solid ${theme.accent}` : "2px solid transparent",
          transition: "all 0.2s", letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          💰 Finance
        </Link>
        <Link to="/cron" style={{
          padding: "10px 20px", textDecoration: "none", fontSize: 12, fontWeight: 600,
          color: isCron ? theme.accent : theme.textDim,
          borderBottom: isCron ? `2px solid ${theme.accent}` : "2px solid transparent",
          transition: "all 0.2s", letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          ⚡ Cron
        </Link>
      </div>
      <Routes>
        <Route path="/library/*" element={<MentalLibrary />} />
        <Route path="/finance/*" element={<FinanceDashboard />} />
        <Route path="/cron/*" element={<CronDashboard />} />
        <Route path="*" element={<CalendarDashboard />} />
      </Routes>
    </>
  );
}
