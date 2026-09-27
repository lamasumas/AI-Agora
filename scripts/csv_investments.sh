#!/usr/bin/env bash
# Generate the seven finance CSVs that the dashboard reads, from an hledger journal.
#
#   cd /path/to/finance              # directory holding main.journal
#   OUT=/path/to/ai_agora/data/finance ./scripts/csv_investments.sh
#
# Every path is overridable:
#   JOURNAL=main.journal   the journal to read (default: main.journal)
#   OUT=./data/finance     output directory (default: ./data/finance)
#   HLEDGER=hledger        binary (default: hledger)
#   START=YYYY-MM END=YYYY-MM   monthly statement range (default: last 12 months)
#
# Always pass -f. Without it hledger falls back to ~/.hledger.journal and every
# number in the dashboard is either empty or wrong.
set -euo pipefail

JOURNAL="${JOURNAL:-main.journal}"
OUT="${OUT:-./data/finance}"
HLEDGER="${HLEDGER:-hledger}"

# hledger's CSV writer and non-ASCII account names (Japanese merchant names end up
# in the income statement) need a UTF-8 locale.
export LANG=C.utf8

# The monthly statement needs the last 12 complete months. -e is EXCLUSIVE, so the
# current month is the right end bound: on 2026-09-27, -b 2025-09 -e 2026-09 gives
# 2025-09 through 2026-08 inclusive.
START="${START:-$(date -d '-11 months' +%Y-%m)}"
END="${END:-$(date +%Y-%m)}"

mkdir -p "$OUT"

# Units held per investment: "154.3200 WORLD", "0.0212 BTC"
"$HLEDGER" -f "$JOURNAL" bal assets:investments \
  --output-format csv > "$OUT/investments_amount.csv"

# The same holdings valued in EUR at the latest known price
"$HLEDGER" -f "$JOURNAL" bal assets:investments -V \
  --output-format csv > "$OUT/investment_value.csv"

# Cost basis, for the unrealised gain
"$HLEDGER" -f "$JOURNAL" bal assets:investments --cost \
  --output-format csv > "$OUT/investments_cost.csv"

# Bank balances, every currency
"$HLEDGER" -f "$JOURNAL" bal ^assets:bank \
  --output-format csv > "$OUT/bank_savings.csv"

# Last month's income statement. Use "last month", never "this month": run
# mid-month against a journal with no imported transactions yet and the CSV comes
# back empty, which blanks the whole dashboard.
"$HLEDGER" -f "$JOURNAL" is -p "last month" \
  --output-format csv > "$OUT/last_month.csv"

# Multi-month statement. This drives the cashflow trend, the year to date figures
# and the savings rate.
"$HLEDGER" -f "$JOURNAL" is --monthly -b "$START" -e "$END" \
  --output-format csv > "$OUT/monthly_income.csv"

# Daily portfolio value in EUR, one column per day (the balance sheet chart)
"$HLEDGER" -f "$JOURNAL" bal assets:investments --market -X EUR --daily --historical \
  --output-format csv > "$OUT/investments-history-daily.csv"

echo "wrote 7 CSVs to $OUT (monthly statement $START to $END, end exclusive)"
