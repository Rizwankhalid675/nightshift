#!/usr/bin/env bash
# One command, everything up. Idempotent: safe to run twice.
set -euo pipefail
cd "$(dirname "$0")/.."
RUN=.runtime; mkdir -p "$RUN/logs" "$RUN/pids"

up() { # up <name> <port> <command...>
  local name=$1 port=$2; shift 2
  if curl -fsS --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
    echo "  = $name already up on :$port"; return
  fi
  echo "  + starting $name on :$port"
  ( "$@" >"$RUN/logs/$name.log" 2>&1 & echo $! > "$RUN/pids/$name.pid" )
}

wait_for() { # wait_for <name> <port> <seconds>
  local name=$1 port=$2 secs=${3:-30} i=0
  while [ $i -lt "$secs" ]; do
    curl -fsS --max-time 1 "http://127.0.0.1:$port/health" >/dev/null 2>&1 && { echo "  v $name ready"; return 0; }
    sleep 1; i=$((i+1))
  done
  echo "  x $name did not become ready in ${secs}s — see $RUN/logs/$name.log"; return 1
}

echo "Starting demo stack..."
# --- edit these for your project -------------------------------------------
# up api 8000 npm run dev:api
# up web 3000 npm run dev:web
# wait_for api 8000 40
# wait_for web 3000 40
# ---------------------------------------------------------------------------

if [ "${1:-}" = "--check" ]; then exec ./scripts/demo-status.sh; fi
[ "${1:-}" = "--no-reset" ] || ./scripts/demo-reset.sh
./scripts/demo-status.sh
echo
echo "Demo ready. Open http://127.0.0.1:3000"
