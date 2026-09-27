#!/usr/bin/env bash
# Regenerate the screenshots in docs/screenshots/.
#
# Requires a running instance of the app with demo data, for example:
#
#   cd backend
#   DEMO_MODE=1 AGORA_DB_PATH=../data/agora.db UPLOAD_DIR=../data/uploads \
#   FINANCE_DATA_DIR=../demo/finance CRON_JSON_PATH=../demo/cron.json \
#   CRON_SCRIPTS_DIR=../demo/scripts REACT_DIST=../frontend/dist \
#   uvicorn main:app --port 8000
#
# Then:
#
#   ./docs/capture_screenshots.sh http://localhost:8000
#
# Set CHROME if the browser is not on the PATH, for example:
#   CHROME=/opt/hermes/.playwright/chromium_headless_shell-*/chrome-linux/headless_shell \
#     ./docs/capture_screenshots.sh http://localhost:8000
#
# Note: the finance headline figures animate on load. --virtual-time-budget
# fast-forwards timers but not requestAnimationFrame, so if you want settled
# numbers on finance.png, drive the page over CDP and wait a few real seconds
# before capturing, or simply rerun the script.
set -euo pipefail

BASE="${1:-http://localhost:8080}"
OUT="$(cd "$(dirname "$0")" && pwd)/screenshots"
CHROME="${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)}"

if [ -z "$CHROME" ]; then
  echo "No Chromium-family browser found. Set CHROME=/path/to/chrome" >&2
  exit 1
fi

mkdir -p "$OUT"

shoot() {
  local path="$1" name="$2" budget="${3:-12000}"
  echo "capturing $name from ${BASE}${path}"
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size=1440,1000 \
    --virtual-time-budget="$budget" \
    --screenshot="$OUT/$name.png" \
    "${BASE}${path}" >/dev/null 2>&1
}

shoot "/library" library
shoot "/finance" finance 20000
shoot "/"        calendar
shoot "/cron"    cron

echo "done, images in $OUT"
