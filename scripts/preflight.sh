#!/usr/bin/env bash
# preflight.sh — score your submission against the win conditions, before judging.
#
# Run it EARLY (hour 2) and again at the freeze. It checks the things that
# actually decide placements, which are almost never the code.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

PASS=0; WARN=0; FAIL=0
BLOCKERS=()

ok()   { printf "  \033[32mv\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; WARN=$((WARN+1)); }
bad()  { printf "  \033[31mx\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); BLOCKERS+=("$1"); }
hdr()  { printf "\n\033[1m%s\033[0m\n" "$1"; }

R=README.md
has() { [ -f "$R" ] && grep -qiE "$1" "$R"; }

hdr "1. The judge's scorecard"
if [ ! -f "$R" ]; then bad "No README.md — this alone costs you the event"; else
  has '\| *Criterion *\|' && ok "README has the judging-criteria table" \
                          || bad "README has no criterion table — judges score what they can find"
  if grep -qE '\([0-9]+ *pts?\)|[0-9]+ *%|equally weighted' "$R"; then
    ok "Criteria carry weights (points, % or 'equally weighted')"
  else warn "Criteria have no weights — state them, even if equally weighted"; fi
  has 'track|prize|sponsor prize' && ok "Tracks / prize targeting addressed" \
                                  || warn "No track or prize-targeting section"
fi

hdr "2. Evidence, not adjectives"
if grep -qE '^\|.*[0-9].*\|' "$R" 2>/dev/null; then ok "Results table present (table rows carry numbers)"
else bad "No results table — a measured number is the pitch"; fi
grep -qE '[0-9]+(\.[0-9]+)? ?(ms|s|%|\$|x|MB|req)' "$R" 2>/dev/null \
  && ok "README contains measured figures" || warn "No measured figures found in README"
has 'before|after|v1|baseline' && ok "Before/after progression shown" \
                               || warn "No before/after progression (v1 -> v3 is the strongest format)"

hdr "3. Honest limits"
if has 'honest limits|^## *limits'; then
  n=$(sed -n "/[Hh]onest limits/,/^## /p" "$R" | grep -E "^\\s*[-*] .{20,}" | grep -vcE ":\\**\\s*$" || true)
  [ "$n" -ge 2 ] && ok "Limits section has $n real entries" \
                 || bad "Limits section is empty — fill it, it WINS points"
else bad "No 'Honest limits' section — judges will find the hole themselves"; fi

hdr "4. A demo that cannot break"
for s in demo-up demo-reset demo-status; do
  if [ -x "scripts/$s.sh" ]; then
    ok "scripts/$s.sh present and executable"
  else bad "scripts/$s.sh missing or not executable"; fi
done
if [ -f DEMO-RUNBOOK.md ]; then
  beats=$(grep -vE '\{\{' DEMO-RUNBOOK.md | grep -cE '^\| *[0-9]+ *\|.*[A-Za-z]{4}' || true)
  [ "$beats" -ge 3 ] \
    && ok "90-second beat sheet filled ($beats beats)" \
    || bad "DEMO-RUNBOOK beat sheet has only $beats filled beats — write it before rehearsing"
else bad "No DEMO-RUNBOOK.md"; fi

hdr "5. Reachable by a judge"
grep -qE 'https?://[a-z0-9.-]+\.[a-z]{2,}' "$R" 2>/dev/null \
  && ok "A live URL is in the README" || bad "No live URL — judges click, they don't clone"
has 'mermaid|architecture' && ok "Architecture diagram present" || warn "No architecture diagram"
has 'for ai agents|repo map' && ok "Repo map / agent nav table present" \
                             || warn "No repo map — judges verify claims in 10 seconds or not at all"
ls docs/img/* >/dev/null 2>&1 && ok "Screenshot(s) committed" || warn "No screenshots in docs/img/"

hdr "6. Nothing left as a placeholder"
LEFT=$(grep -rlE '\{\{[A-Z_0-9]+\}\}' --include='*.md' --include='*.html' . 2>/dev/null | grep -v node_modules || true)
if [ -n "$LEFT" ]; then
  bad "Unfilled {{PLACEHOLDERS}} in: $(echo "$LEFT" | tr '\n' ' ')"
else ok "No template placeholders left"; fi

hdr "7. Submission requirements (the disqualifiers)"
E=docs/EVENT.md
ev() { [ -f "$E" ] && grep -qiE "$1" "$E"; }

if ls LICENSE* >/dev/null 2>&1 || ls COPYING* >/dev/null 2>&1; then ok "LICENSE file present at repo root"
else bad "No LICENSE file — many events require an open-source licence, and it is a 30-second fix"; fi

if ev 'video'; then
  if grep -qiE 'youtube\.com|youtu\.be|vimeo\.com|loom\.com' "$R" 2>/dev/null; then
    ok "Demo video link is in the README"
  else bad "EVENT.md says a video is required, and there is no video link in the README"; fi
  if [ -f VIDEO.md ]; then
    vb=$(grep -vE '\{\{' VIDEO.md | grep -cE '^\| *[0-9]+:[0-9]{2}' || true)
    [ "$vb" -ge 3 ] && ok "VIDEO.md script filled ($vb beats)" \
                    || warn "VIDEO.md script is empty — two criteria are often judged off the video"
  else warn "No VIDEO.md — script the video, don't improvise it"; fi
else warn "docs/EVENT.md doesn't mention a video — confirm whether one is required"; fi

if grep -qiE '^#+ .*(run it|getting started|quick ?start|setup)' "$R" 2>/dev/null; then
  ok "README has run instructions for judges"
else bad "No run instructions — 'judges must be able to run it' is a common hard requirement"; fi

if ev 'credential|sandbox|test account|api key'; then
  grep -qiE 'credential|sandbox|test account|login|password' "$R" 2>/dev/null \
    && ok "Test credentials / sandbox access documented" \
    || bad "Event needs test credentials in the repo; README has none"
fi

if ev 'new|significantly updated'; then
  grep -qiE 'newly created|significantly updated' "$R" 2>/dev/null \
    && ok "States the project is new / what was updated" \
    || warn "Event asks whether the project is new — say so explicitly"
fi

hdr "8. Repo hygiene"
if git rev-parse --git-dir >/dev/null 2>&1; then
  [ -z "$(git status --porcelain)" ] && ok "Working tree clean (everything committed)" \
                                     || warn "Uncommitted changes — commit before submitting"
  c=$(git rev-list --count HEAD 2>/dev/null || echo 0); ok "$c commits on record"
  if ls .lanes/*.lane >/dev/null 2>&1; then
    warn "$(ls .lanes/*.lane | wc -l | tr -d ' ') lane(s) still unmerged — land or drop them"
  fi
  git ls-files | grep -qE '(^|/)\.env$' && bad "A .env file is committed — remove it now" \
                                        || ok "No .env committed"
else warn "Not a git repo"; fi

hdr "Result"
TOTAL=$((PASS+WARN+FAIL))
printf "  %d passed · %d warnings · %d blockers  (of %d checks)\n" "$PASS" "$WARN" "$FAIL" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "  Fix these before you submit:"
  for b in "${BLOCKERS[@]}"; do echo "    - $b"; done
  echo
  exit 1
fi
[ "$WARN" -gt 0 ] && echo "  No blockers. Clear the warnings if you have minutes left." \
                  || echo "  Clean. Go rehearse the demo three times."
exit 0
