#!/usr/bin/env bash
# Return the demo to a pristine, reproducible state.
#
# This is the script that saves your demo. Rehearsal #3 must look exactly like
# rehearsal #1 — most demos die because the third run is on dirty state.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Resetting demo state..."
# --- edit these for your project -------------------------------------------
# rm -f .runtime/app.db
# npm run db:migrate >/dev/null
# npm run db:seed -- demo/seed/demo.json >/dev/null
# curl -fsS -XPOST http://127.0.0.1:8000/admin/reset >/dev/null
# ---------------------------------------------------------------------------
echo "  v state reset from demo/seed/"
echo "Ready to rehearse."
