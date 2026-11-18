#!/usr/bin/env bash
# Is every piece of the demo actually alive? Run this before you present.
set -uo pipefail
cd "$(dirname "$0")/.."
printf "%-12s %-7s %s\n" SERVICE PORT STATE
ok=0; bad=0
check() { # check <name> <port>
  if curl -fsS --max-time 1 "http://127.0.0.1:$2/health" >/dev/null 2>&1; then
    printf "%-12s %-7s %s\n" "$1" "$2" "up"; ok=$((ok+1))
  else
    printf "%-12s %-7s %s\n" "$1" "$2" "DOWN"; bad=$((bad+1))
  fi
}
# --- edit these for your project -------------------------------------------
# check api 8000
# check web 3000
# ---------------------------------------------------------------------------
echo
[ "$bad" -eq 0 ] && echo "All $ok services up." || { echo "$bad service(s) DOWN — logs in .runtime/logs/"; exit 1; }
