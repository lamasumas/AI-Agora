import { describe, it, expect } from "vitest";
import {
  parseAmount,
  parseBankCSV,
  parseLastMonthCSV,
  parseInvestmentHistoryCSV,
  classifyInvestments,
  mergeInvestmentData,
  groupExpensesByCategory,
  groupMonthlyCashflow,
  safePct,
  isCrypto,
  isGold,
} from "./parsers.js";

describe("parseAmount", () => {
  it("reads a value with a currency suffix", () => {
    expect(parseAmount("382000 JPY")).toEqual({ value: 382000, currency: "JPY" });
    expect(parseAmount("3420.55 EUR")).toEqual({ value: 3420.55, currency: "EUR" });
  });

  it("reads a bare number as an amount with no currency", () => {
    expect(parseAmount("0")).toEqual({ value: 0, currency: "" });
  });

  it("reads a negative amount", () => {
    expect(parseAmount("-22000 JPY")).toEqual({ value: -22000, currency: "JPY" });
  });

  it("returns null for empty or non-numeric input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("parseBankCSV", () => {
  it("strips the account prefix and keeps the currency", () => {
    const rows = [
      ["account", "balance"],
      ["assets:bank:everyday", "3420.55 EUR"],
      ["total", "3420.55 EUR, 482000 JPY"],
    ];
    expect(parseBankCSV(rows)).toEqual([
      { account: "everyday", value: 3420.55, currency: "EUR" },
    ]);
  });
});

describe("parseLastMonthCSV", () => {
  it("splits income from expenses by section", () => {
    const rows = [
      ["Income Statement 2026-08", ""],
      ["Account", "Aug"],
      ["Revenues", ""],
      ["income:salary", "382000 JPY"],
      ["total", "382000 JPY"],
      ["Expenses", ""],
      ["expenses:rent", "118000 JPY"],
      ["total", "118000 JPY"],
      ["Net:", "264000 JPY"],
    ];
    const parsed = parseLastMonthCSV(rows);
    expect(parsed.month).toBe("Income Statement 2026-08");
    expect(parsed.income).toEqual([{ label: "salary", value: 382000, currency: "JPY" }]);
    expect(parsed.expenses).toEqual([{ label: "rent", value: 118000, currency: "JPY" }]);
  });
});

describe("parseInvestmentHistoryCSV", () => {
  it("keeps only EUR columns and skips all-zero rows", () => {
    const rows = [
      ["account", "2026-01-01", "2026-01-02"],
      ["assets:investments:etf:WORLD", "100.00 EUR", "110.00 EUR"],
      ["assets:investments:etf:JUNK", "0", "0"],
    ];
    const parsed = parseInvestmentHistoryCSV(rows);
    expect(parsed.dates).toEqual(["2026-01-01", "2026-01-02"]);
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0].name).toBe("WORLD");
    expect(parsed.assets[0].values.map(v => v.value)).toEqual([100, 110]);
  });
});

describe("groupMonthlyCashflow", () => {
  const rows = [
    { account: "income:salary", "2026-07": "382000 JPY", "2026-08": "382000 JPY" },
    { account: "income:contracting", "2026-07": "0", "2026-08": "127.00 EUR, 6864 JPY" },
    { account: "expenses:rent", "2026-07": "118000 JPY", "2026-08": "118000 JPY" },
    { account: "assets:investments:cash", "2026-07": "10 EUR", "2026-08": "10 EUR" },
  ];

  it("returns the months in ascending order", () => {
    expect(groupMonthlyCashflow(rows).months).toEqual(["2026-07", "2026-08"]);
  });

  it("buckets accounts by their prefix", () => {
    const { dataByMonth } = groupMonthlyCashflow(rows);
    // contracting yields two entries, one per currency in the cell.
    expect([...new Set(dataByMonth["2026-08"].income.map(e => e.label))]).toEqual([
      "salary",
      "contracting",
    ]);
    expect(dataByMonth["2026-08"].expenses.map(e => e.label)).toEqual(["rent"]);
  });

  it("ignores accounts that are neither income nor expenses", () => {
    const { dataByMonth } = groupMonthlyCashflow(rows);
    const all = [...dataByMonth["2026-08"].income, ...dataByMonth["2026-08"].expenses];
    expect(all.some(e => e.account.startsWith("assets"))).toBe(false);
  });

  it("keeps BOTH amounts from a multi-currency cell", () => {
    const { dataByMonth } = groupMonthlyCashflow(rows);
    const contracting = dataByMonth["2026-08"].income.filter(e => e.label === "contracting");
    expect(contracting).toHaveLength(2);
    expect(contracting.map(e => [e.value, e.currency])).toEqual([
      [127, "EUR"],
      [6864, "JPY"],
    ]);
  });

  it("skips zero and empty cells", () => {
    const { dataByMonth } = groupMonthlyCashflow(rows);
    const july = [...dataByMonth["2026-07"].income, ...dataByMonth["2026-07"].expenses];
    expect(july.map(e => e.label)).toEqual(["salary", "rent"]);
  });

  it("handles an empty response", () => {
    expect(groupMonthlyCashflow([])).toEqual({ months: [], dataByMonth: {} });
    expect(groupMonthlyCashflow(undefined)).toEqual({ months: [], dataByMonth: {} });
  });
});

describe("investment classification", () => {
  const investments = [
    { name: "WORLD", eur: 12450 },
    { name: "GOLD", eur: 4910 },
    { name: "BTC", eur: 1850 },
  ];

  it("separates ETFs, gold and crypto", () => {
    expect(isGold("GOLD")).toBe(true);
    expect(isCrypto("BTC")).toBe(true);
    expect(isGold("WORLD")).toBeFalsy();

    const result = classifyInvestments(investments);
    expect(result.etfs.map(i => i.name)).toEqual(["WORLD"]);
    expect(result.gold.map(i => i.name)).toEqual(["GOLD"]);
    expect(result.crypto.map(i => i.name)).toEqual(["BTC"]);
    expect(result.etfsValue).toBe(12450);
    expect(result.cryptoValue).toBe(1850);
    expect(result.goldValue).toBe(4910);
  });

  it("merges value, units and cost into one row per asset", () => {
    const merged = mergeInvestmentData(
      [{ name: "WORLD", eur: 12450 }],
      [{ name: "WORLD", amount: 154.32 }],
      [{ name: "WORLD", cost: 10800 }],
    );
    expect(merged[0]).toMatchObject({ name: "WORLD", value: 12450, amount: 154.32, cost: 10800 });
  });
});

describe("groupExpensesByCategory", () => {
  it("aggregates subcategories under a stable colour", () => {
    const groups = groupExpensesByCategory([
      { account: "expenses:food:grocery", label: "grocery", value: 42000, currency: "JPY" },
      { account: "expenses:food:dining", label: "dining", value: 18500, currency: "JPY" },
      { account: "expenses:rent", label: "rent", value: 118000, currency: "JPY" },
    ]);
    expect(groups[0]).toMatchObject({ category: "rent", value: 118000 });
    const food = groups.find(g => g.category === "food");
    expect(food.value).toBe(60500);
    expect(food.subcategories).toHaveLength(2);
    expect(food.color).toMatch(/^#/);
  });

  it("converts to the display currency when a converter is given", () => {
    const groups = groupExpensesByCategory(
      [{ account: "expenses:rent", label: "rent", value: 160000, currency: "JPY" }],
      (value, currency) => (currency === "JPY" ? value / 160 : value),
    );
    expect(groups[0].value).toBe(1000);
  });
});

describe("safePct", () => {
  it("avoids dividing by zero", () => {
    expect(safePct(10, 0)).toBe("0.0");
    expect(safePct(1, 4, 1)).toBe("25.0");
  });
});
