#!/usr/bin/env bash
# Demo fixture: prints the disk usage of the data directory.
# It only speaks up when the volume is more than 80% full, which is the
# watchdog pattern: silence means everything is fine.
set -euo pipefail

THRESHOLD=80
TARGET="${1:-/data}"

usage=$(df -P "$TARGET" | awk 'NR==2 {gsub("%", "", $5); print $5}')

if [ "$usage" -gt "$THRESHOLD" ]; then
  echo "WARNING: $TARGET is ${usage}% full"
fi
