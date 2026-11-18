#!/usr/bin/env bash
# Start the NightShift console. Idempotent: safe to run twice.
#
#   ./scripts/demo-up.sh              # offline proposer, dry-run executor
#   PORT=3100 ./scripts/demo-up.sh    # pick a port
#   AGENT_PROVIDER=bedrock ./scripts/demo-up.sh   # needs AWS credentials
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"
RUN=.runtime
mkdir -p "$RUN/logs" "$RUN/pids"

if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  echo "  = console already up on :$PORT"
else
  echo "  + starting console on :$PORT"
  PORT="$PORT" node src/server.js >"$RUN/logs/console.log" 2>&1 &
  echo $! > "$RUN/pids/console.pid"

  i=0
  until curl -fsS --max-time 1 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "  x console did not become ready in 30s — see $RUN/logs/console.log"
      tail -5 "$RUN/logs/console.log" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
  echo "  v console ready"
fi

./scripts/demo-status.sh
echo
echo "  Open http://127.0.0.1:$PORT"
