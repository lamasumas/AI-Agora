/**
 * Pure parsing and utility functions for the Finance Dashboard.
 * Extracted from App.jsx for testability.
 */

export function parseAmount(str) {
  if (!str || str.trim() === "") return null;
  const match = str.trim().match(/^(-?[\d.]+)\s*([A-Z"]+)?/);
  if (!match) return null;
  return { value: parseFloat(match[1]), currency: match[2]?.replace(/"/g, "") || "" };
}

export function parseBankCSV(rows) {
  return rows
    .filter(r => r[0] && r[0] !== "account" && r[0] !== "total" && r[1])
    .map(r => {
      const parsed = parseAmount(r[1]);
      const name = r[0].replace("assets:bank:", "").replace(/"/g, "");
      return parsed ? { account: name, value: parsed.value, currency: parsed.currency } : null;
    }).filter(Boolean);
}

export function parseInvestmentAmountCSV(rows) {
  return rows
    .filter(r => r[0] && r[0] !== "account" && r[0] !== "total" && r[1])
    .map(r => {
      const parsed = parseAmount(r[1]);
      const name = r[0].replace("assets:investments:crypto:", "").replace("assets:investments:etf:", "").replace(/"/g, "").replace("assets:investments:", "");
      return parsed ? { name, amount: parsed.value, unit: parsed.currency } : null;
    }).filter(Boolean);
}

export function parseInvestmentValueCSV(rows) {
  return rows
    .filter(r => r[0] && r[0] !== "account" && r[0] !== "total" && r[1])
    .map(r => {
      const parsed = parseAmount(r[1]);
      const name = r[0].replace("assets:investments:crypto:", "").replace("assets:investments:etf:", "").replace(/"/g, "").replace("assets:investments:", "");
      return parsed ? { name, eur: parsed.value, currency: parsed.currency } : null;
    }).filter(Boolean);
}

export function parseInvestmentCostCSV(rows) {
  return rows
    .filter(r => r[0] && r[0] !== "account" && r[0] !== "total" && r[1])
    .map(r => {
      const parsed = parseAmount(r[1]);
      const name = r[0].replace("assets:investments:crypto:", "").replace("assets:investments:etf:", "").replace(/"/g, "").replace("assets:investments:", "");
      return parsed ? { name, cost: parsed.value, currency: parsed.currency } : null;
    }).filter(Boolean);
}

export function parseInvestmentHistoryCSV(rows) {
  if (!rows || rows.length < 2) return { dates: [], assets: [] };

  const headerRow = rows[0];
  const dates = headerRow.slice(1).filter(d => d && d.match(/^\d{4}-\d{2}-\d{2}$/));

  const assets = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const account = row[0].replace(/"/g, "").trim();
    if (account === "account" || account === "total" || account === "assets:investments:cash" || account === "assets:investments:crypto:_") continue;

    const assetName = account
      .replace("assets:investments:crypto:", "")
      .replace("assets:investments:etf:", "")
      .replace(/"/g, "")
      .replace("assets:investments:", "");

    const valuesByDate = {};
    dates.forEach(date => valuesByDate[date] = 0);

    dates.forEach((date, idx) => {
      const colIdx = idx + 1;
      const cellValue = row[colIdx];
      if (!cellValue || cellValue === "0") return;

      const parsed = parseAmount(cellValue);
      if (parsed && parsed.value !== 0) {
        if (parsed.currency === "EUR") {
          valuesByDate[date] += parsed.value;
        }
      }
    });

    const hasValues = Object.values(valuesByDate).some(v => v !== 0);
    if (hasValues) {
      assets.push({
        name: assetName,
        values: dates.map(date => ({
          date,
          value: valuesByDate[date]
        })).filter(d => d.value !== 0)
      });
    }
  }

  return { dates, assets };
}

export function parseLastMonthCSV(rows) {
  const income = [], expenses = [];
  let section = null, month = "";
  for (const row of rows) {
    const col0 = (row[0] || "").trim().replace(/"/g, "");
    const col1 = (row[1] || "").trim().replace(/"/g, "");
    if (col0.startsWith("Income Statement")) { month = col0; continue; }
    if (col0 === "Account" || col0 === "total" || col0 === "") continue;
    if (col0 === "Revenues") { section = "income"; continue; }
    if (col0 === "Expenses") { section = "expenses"; continue; }
    if (col0 === "Net:") { section = null; continue; }
    const parsed = col1 ? parseAmount(col1) : null;
    if (!parsed) continue;
    const label = col0.split(":").pop();
    if (section === "income") income.push({ label, value: Math.abs(parsed.value), currency: parsed.currency });
    else if (section === "expenses") expenses.push({ label, value: Math.abs(parsed.value), currency: parsed.currency });
  }
  return { income, expenses, month };
}

export function parseMonthlyIncomeCSV(rows) {
  if (!rows || rows.length < 3) return { months: [], dataByMonth: {} };

  let headerRowIdx = rows.findIndex(r => r[0] && r[0].replace(/"/g, "").trim() === "Account");
  if (headerRowIdx === -1) return { months: [], dataByMonth: {} };

  const headerRow = rows[headerRowIdx];
  const months = headerRow.slice(1).map(m => m?.replace(/"/g, "").trim()).filter(m => m && m.match(/^\d{4}-\d{2}$/));

  const dataByMonth = {};
  months.forEach(month => {
    dataByMonth[month] = { income: [], expenses: [] };
  });

  let currentSection = null;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const col0 = row[0].replace(/"/g, "").trim();
    if (!col0 || col0 === "Account" || col0 === "total" || col0 === "Net:") {
      if (col0 === "total" || col0 === "Net:") currentSection = null;
      continue;
    }
    if (col0 === "Revenues") { currentSection = "income"; continue; }
    if (col0 === "Expenses") { currentSection = "expenses"; continue; }

    const label = col0.split(":").pop();

    months.forEach((month, idx) => {
      const colIdx = idx + 1;
      const cellValue = row[colIdx];
      if (!cellValue || cellValue === "0") return;

      // Handle multi-currency cells like "2.30 EUR, 284797 JPY"
      const parts = cellValue.split(",").map(s => s.trim()).filter(s => s && s !== "0");
      parts.forEach(part => {
        const parsed = parseAmount(part);
        if (!parsed || parsed.value === 0) return;
        const item = { label, value: Math.abs(parsed.value), currency: parsed.currency };
        if (currentSection === "income") {
          dataByMonth[month].income.push(item);
        } else if (currentSection === "expenses") {
          dataByMonth[month].expenses.push(item);
        }
      });
    });
  }

  return { months, dataByMonth };
}

/**
 * Group a multi-month income statement into per-month income and expense entries.
 * Input rows come from GET /api/finance/cashflow/monthly:
 *   [{account: "income:salary", "2025-10": "382000 JPY", ...}, ...]
 * A cell can hold more than one amount ("127.00 EUR, 6864 JPY") when the month was
 * settled from two accounts; each amount becomes its own entry so neither is lost.
 */
export function groupMonthlyCashflow(rows) {
  if (!rows || rows.length === 0) return { months: [], dataByMonth: {} };

  const months = Object.keys(rows[0] || {})
    .filter(k => k !== "account" && /^\d{4}-\d{2}$/.test(k))
    .sort();

  const dataByMonth = {};
  months.forEach(month => {
    dataByMonth[month] = { income: [], expenses: [] };
  });

  rows.forEach(row => {
    const account = row.account || "";
    const lc = account.toLowerCase();
    const isIncome = lc.startsWith("income") || lc.includes("revenue");
    const isExpense = lc.startsWith("expenses");
    if (!isIncome && !isExpense) return;

    const label = account.split(":").pop();
    months.forEach(month => {
      const cell = row[month];
      if (!cell || cell === "0") return;
      String(cell).split(",").forEach(part => {
        const parsed = parseAmount(part);
        if (!parsed || !parsed.value) return;
        const entry = {
          account,
          label,
          value: Math.abs(parsed.value),
          currency: parsed.currency || "EUR",
        };
        if (isIncome) dataByMonth[month].income.push(entry);
        else dataByMonth[month].expenses.push(entry);
      });
    });
  });

  return { months, dataByMonth };
}

export const fmtCurrency = (v, cur = "EUR") => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v); }
  catch { return `${v.toFixed(2)} ${cur}`; }
};

export const safePct = (numerator, denominator, decimals = 1) => denominator ? ((numerator / denominator) * 100).toFixed(decimals) : "0.0";

export const COLORS = ["#06b6d4", "#f7931a", "#627eea", "#d4af37", "#00c49f", "#8884d8", "#60a5fa", "#f43f5e", "#34d399", "#fb923c", "#a78bfa"];

// Fixed colors per top-level expense category (stable across months)
export const CATEGORY_COLORS = {
  food: "#00c49f",
  shopping: "#f43f5e",
  entertainment: "#8884d8",
  fitness: "#06b6d4",
  health: "#34d399",
  rent: "#f7931a",
  transport: "#60a5fa",
  phone: "#fb923c",
  bank: "#a78bfa",
  bizum: "#d4af37",
  unknown: "#9ca3af",
  business: "#627eea",
};

const CATEGORY_LABELS = {
  food: "Food",
  shopping: "Shopping",
  entertainment: "Entertainment",
  fitness: "Fitness",
  health: "Health",
  rent: "Rent",
  transport: "Transport",
  phone: "Phone",
  bank: "Bank Fees",
  bizum: "Bizum",
  unknown: "Other",
  business: "Business",
};

/**
 * Group flat expense entries [{account, label, value, currency}] by top-level category.
 * e.g. expenses:food:convenience + expenses:food:grocery → { category: "food", label: "Food", ... }
 * Returns [{category, label, value, currency, color, subcategories: [{label, value, currency}]}]
 */
export function groupExpensesByCategory(expenses, toDisplay) {
  const groups = {};
  expenses.forEach(e => {
    const parts = (e.account || "").split(":");
    const cat = parts.length >= 2 ? parts[1] : "unknown";
    if (!groups[cat]) {
      groups[cat] = { category: cat, label: CATEGORY_LABELS[cat] || cat, value: 0, currency: e.currency, color: CATEGORY_COLORS[cat] || "#9ca3af", subcategories: [] };
    }
    groups[cat].value += toDisplay ? toDisplay(e.value, e.currency) : e.value;
    groups[cat].subcategories.push({ label: e.label, value: e.value, currency: e.currency });
  });
  // Sort by value descending
  return Object.values(groups).sort((a, b) => b.value - a.value);
}

export const CSV_FILES = {
  bank: "/bank_savings.csv",
  lastMonth: "/last_month.csv",
  monthlyIncome: "/monthly_income.csv",
  invAmount: "/investments_amount.csv",
  invValue: "/investment_value.csv",
  invCost: "/investments_cost.csv",
  invHistory: "/investments-history-daily.csv",
};

// ── Classification helpers ──
const goldNames = ["paxg", "gold", "xau", "glda"];
const cryptoNames = ["btc", "eth", "sol", "dot", "ada", "avax", "matic", "link", "uni", "atom", "xrp", "doge", "ltc"];

export const isGold = (name) => (name || "").toLowerCase() && goldNames.some(g => (name || "").toLowerCase().includes(g));
export const isCrypto = (name) => !isGold(name) && cryptoNames.some(c => (name || "").toLowerCase().includes(c)) || (name || "").toLowerCase().includes("crypto");

export function classifyInvestments(investments) {
  const etfs = investments.filter(i => !isGold(i.name) && !isCrypto(i.name));
  const crypto = investments.filter(i => isCrypto(i.name));
  const gold = investments.filter(i => isGold(i.name));
  const etfsValue = etfs.reduce((s, i) => s + (i.eur || 0), 0);
  const cryptoValue = crypto.reduce((s, i) => s + (i.eur || 0), 0);
  const goldValue = gold.reduce((s, i) => s + (i.eur || 0), 0);
  return { etfs, crypto, gold, etfsValue, cryptoValue, goldValue };
}

export function mergeInvestmentData(invValue, invAmount, invCost) {
  return invValue.map((iv, i) => {
    const key = (v) => (v.name || v.account || "").toLowerCase();
    const amt = invAmount.find(a => key(a) === key(iv));
    const cost = invCost.find(c => key(c) === key(iv));
    const name = iv.name || iv.account || "";
    const value = iv.value || iv.eur || 0;
    const amount = amt ? (amt.value || amt.amount || 0) : 0;
    const costVal = cost ? (cost.value || cost.cost || 0) : 0;
    return { name, value, amount, cost: costVal, eur: value, color: COLORS[i % COLORS.length] };
  });
}
