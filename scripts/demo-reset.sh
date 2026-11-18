#!/usr/bin/env bash
# Return the demo to a pristine, reproducible state.
#
# This is the script that saves the demo: rehearsal #3 must look exactly like
# rehearsal #1. It clears saved runs and every recorded approval, then restarts
# the console so its in-process state is rebuilt from the seeded generator.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"

echo "Resetting demo state..."
rm -rf runs
echo "  v cleared runs/"

if [ -f .runtime/approvals.json ]; then
  rm -f .runtime/approvals.json
  echo "  v cleared recorded approvals"
else
  echo "  = no recorded approvals to clear"
fi

if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  ./scripts/demo-down.sh >/dev/null 2>&1 || true
  sleep 1
  ./scripts/demo-up.sh >/dev/null
  echo "  v console restarted with fresh state"
else
  echo "  = console not running; nothing to restart"
fi

echo "Ready to rehearse."
