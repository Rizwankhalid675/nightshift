#!/usr/bin/env bash
# Is the demo actually alive, and is it in a safe configuration?
# Run this before presenting.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3100}"

health=$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" 2>/dev/null || true)
if [ -z "$health" ]; then
  echo "  x console DOWN on :$PORT  (./scripts/demo-up.sh, logs in .runtime/logs/)"
  exit 1
fi
echo "  v console up on :$PORT"
echo "$health" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try{const j=JSON.parse(s);console.log("    tenants: "+(j.tenants||[]).join(", "));}catch{}
});'

m=$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/metrics" 2>/dev/null || true)
[ -n "$m" ] && echo "$m" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try{
    const j=JSON.parse(s);
    console.log(`    ${j.tenantId}: ${j.alertsIn} alerts -> ${j.actionable} pages, ${j.missedActionable} missed`);
    console.log(`    agents: ${j.agentMode}  model: ${j.model}`);
    const mode=j.executorMode;
    console.log(`    executor: ${mode}` + (mode==="live" ? "   *** LIVE: this can change infrastructure ***" : "   (composes calls, sends nothing)"));
  }catch(e){}
});'
