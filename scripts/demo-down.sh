#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
RUN=.runtime
[ -d "$RUN/pids" ] || { echo "nothing running"; exit 0; }
for f in "$RUN"/pids/*.pid; do
  [ -e "$f" ] || continue
  pid=$(cat "$f"); name=$(basename "$f" .pid)
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null && echo "  - stopped $name ($pid)"; fi
  rm -f "$f"
done
echo "Demo stopped."
