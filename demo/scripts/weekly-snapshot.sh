#!/usr/bin/env bash
# Demo fixture: snapshot the ETF watchlist quotes once a week.
set -euo pipefail

OUT_DIR="${OUT_DIR:-/data/snapshots}"
mkdir -p "$OUT_DIR"

stamp=$(date -u +%Y-%m-%d)
out="$OUT_DIR/watchlist-$stamp.json"

curl -fsS "http://127.0.0.1:8000/api/finance/etf-tracker?period=1w" -o "$out"

count=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['etfs']))" "$out")
echo "saved $count quotes to $out"
