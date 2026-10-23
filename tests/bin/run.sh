#!/usr/bin/env bash
# Run every tests/bin/*.test.sh and fail if any suite fails.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
rc=0; n=0
for t in "$DIR"/*.test.sh; do
  [ -f "$t" ] || continue
  n=$((n+1))
  echo "== $(basename "$t") =="
  bash "$t" || rc=1
done
# An empty glob would otherwise pass with nothing tested.
[ "$n" -gt 0 ] || { echo "no *.test.sh suites found in $DIR" >&2; exit 1; }
exit "$rc"
