#!/usr/bin/env bash
# Return the *video* demo to a known state, and prove it is the state we think.
#
# The recording uses two surfaces that scripts/demo-reset.sh does not touch:
# the hosted static console, and an AWS CloudShell tab. Nothing here mutates
# anything — it checks, and prints the two commands to paste into CloudShell.
set -uo pipefail
cd "$(dirname "$0")/.."

SITE="${SITE:-https://webrizz.dev/nightshift}"
# Respect TMPDIR: /tmp is not writable under every sandbox or CI image.
TMP="${TMPDIR:-/tmp}"; TMP="${TMP%/}"
fail=0
say() { printf '  %s %s\n' "$1" "$2"; }

echo "1. Code"
if npm test >"$TMP/ns-test.log" 2>&1; then
  n=$(grep -Eo '(pass|# pass) [0-9]+' "$TMP/ns-test.log" | grep -Eo '[0-9]+' | head -1)
  say "ok" "${n:-?} tests pass"
else
  say "XX" "tests FAILED — see "$TMP/ns-test.log""; fail=1
fi

echo "2. The deployed site matches the committed run data"
expected_nw=$(python3 -c "import json;print(json.load(open('dist-runs/run-northwind-msp.json'))['metrics']['runId'])" 2>/dev/null || echo "?")
expected_ac=$(python3 -c "import json;print(json.load(open('dist-runs/run-acme-retail.json'))['metrics']['runId'])" 2>/dev/null || echo "?")
for pair in "northwind-msp:$expected_nw" "acme-retail:$expected_ac"; do
  t="${pair%%:*}"; want="${pair##*:}"
  got=$(curl -fsS --max-time 10 "$SITE/index-$t.html" 2>/dev/null | grep -o 'run [0-9a-f]\{8\}' | head -1 | cut -d' ' -f2)
  if [ -z "$got" ]; then
    say "--" "$t: could not reach $SITE (check by hand)"
  elif [ "$got" = "$want" ]; then
    say "ok" "$t: live run $got matches dist-runs"
  else
    say "XX" "$t: live shows $got, dist-runs has $want — REDEPLOY"; fail=1
  fi
done

echo "3. The site regenerates from the saved runs, byte for byte"
rm -rf "$TMP/ns-verify"
if PRIMARY_TENANT=northwind-msp node src/export.js --from dist-runs --out "$TMP/ns-verify" >/dev/null 2>&1 \
   && diff -r dist-live "$TMP/ns-verify" >/dev/null 2>&1; then
  say "ok" "identical, no model call"
else
  say "XX" "regeneration differs from dist-live"; fail=1
fi

echo
echo "4. Paste into the AWS CloudShell tab, in order:"
cat <<'SNIP'

  cd ~/ns && clear; aws bedrock-runtime invoke-model --region us-east-2 \
    --model-id us.amazon.nova-pro-v1:0 --cli-binary-format raw-in-base64-out \
    --content-type application/json \
    --body '{"messages":[{"role":"user","content":[{"text":"Reply with exactly: NIGHTSHIFT LIVE"}]}],"inferenceConfig":{"maxTokens":32,"temperature":0}}' \
    /dev/stdout

  rm -rf /tmp/verify && PRIMARY_TENANT=northwind-msp node src/export.js --from dist-runs --out /tmp/verify >/dev/null \
    && diff -r dist /tmp/verify \
    && echo '*** REGENERATED FROM SAVED RUN DATA - BYTE IDENTICAL, NO MODEL CALL ***'

SNIP

echo "5. Browser"
say "--" "NightShift tab: $SITE/  (scroll to top)"
say "--" "CloudShell tab open, account visible — required by the rules"
say "--" "hide bookmarks, Do Not Disturb on, close every other tab"

echo
[ "$fail" -eq 0 ] && echo "Ready to record." || { echo "NOT ready — fix the XX lines above."; exit 1; }
