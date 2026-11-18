#!/usr/bin/env bash
# lanes.sh — parallel agent lanes that cannot collide.
#
#   lanes.sh new   <owner> <feature> [path ...]   create a lane (claims file areas)
#   lanes.sh status                               show every lane and its state
#   lanes.sh land  <owner> <feature>              merge a finished lane into main
#   lanes.sh drop  <owner> <feature>              abandon a lane (at the freeze)
#   lanes.sh freeze                               list unmerged work, then stop
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
REG=.lanes
mkdir -p "$REG"

die() { echo "  x $*" >&2; exit 1; }
branch_of() { echo "lane/$1-$2"; }

cmd_new() {
  local owner="${1:-}" feat="${2:-}"; shift 2 || true
  [ -n "$owner" ] && [ -n "$feat" ] || die "usage: lanes.sh new <owner> <feature> [path ...]"
  local areas=("$@"); [ ${#areas[@]} -gt 0 ] || areas=("src/$feat/**")
  # refuse overlapping claims
  for f in "$REG"/*.lane; do
    [ -e "$f" ] || continue
    while read -r claimed; do
      [ -n "$claimed" ] || continue
      for a in "${areas[@]}"; do
        if [ "${a%%/\*\*}" = "${claimed%%/\*\*}" ]; then
          die "area '$a' is already owned by lane $(basename "$f" .lane) — pick a different file area"
        fi
      done
    done < <(tail -n +2 "$f")
  done
  local br; br=$(branch_of "$owner" "$feat")
  git rev-parse --verify "$br" >/dev/null 2>&1 && die "branch $br already exists"
  { echo "owner=$owner feature=$feat created=$(date +%H:%M)"; printf '%s\n' "${areas[@]}"; } > "$REG/$owner-$feat.lane"
  git branch "$br" >/dev/null 2>&1 || git checkout -qb "$br"
  echo "  + lane $owner/$feat  ->  branch $br"
  printf '    owns: %s\n' "${areas[@]}"
  echo "    brief the agent with prompts/lane-agent.md and this file area only"
}

cmd_status() {
  printf "%-22s %-20s %-7s %s\n" LANE BRANCH AHEAD AREAS
  local any=0
  for f in "$REG"/*.lane; do
    [ -e "$f" ] || continue
    any=1
    local n; n=$(basename "$f" .lane)
    local owner="${n%%-*}" feat="${n#*-}"
    local br; br=$(branch_of "$owner" "$feat")
    local ahead="-"
    git rev-parse --verify "$br" >/dev/null 2>&1 && \
      ahead=$(git rev-list --count "main..$br" 2>/dev/null || echo "?")
    local areas; areas=$(tail -n +2 "$f" | tr '\n' ' ')
    printf "%-22s %-20s %-7s %s\n" "$owner/$feat" "${br#lane/}" "$ahead" "$areas"
  done
  [ "$any" = 1 ] || echo "(no lanes yet — lanes.sh new <owner> <feature>)"
}

cmd_land() {
  local owner="${1:?owner}" feat="${2:?feature}"
  local br; br=$(branch_of "$owner" "$feat")
  git rev-parse --verify "$br" >/dev/null 2>&1 || die "no such branch $br"
  echo "  . checking $br builds before landing..."
  if [ -f package.json ] && command -v npm >/dev/null; then
    git stash -q --include-untracked 2>/dev/null || true
    git checkout -q "$br"
    npm run --if-present typecheck >/dev/null 2>&1 || die "$br fails typecheck — it does not land"
    npm test --if-present >/dev/null 2>&1 || echo "  ! tests failed or absent (landing anyway, note it)"
  fi
  git checkout -q main
  git merge --no-ff -m "Land lane $owner/$feat" "$br" || die "merge conflict — resolve, then re-run"
  mv "$REG/$owner-$feat.lane" "$REG/$owner-$feat.landed" 2>/dev/null || true
  echo "  v landed $owner/$feat into main"
}

cmd_drop() {
  local owner="${1:?owner}" feat="${2:?feature}"
  mv "$REG/$owner-$feat.lane" "$REG/$owner-$feat.dropped" 2>/dev/null || true
  echo "  - dropped $owner/$feat (branch kept: $(branch_of "$owner" "$feat"))"
}

cmd_freeze() {
  echo "FREEZE. Unmerged work below is abandoned, not rushed."
  echo
  cmd_status
  echo
  echo "Now: README to the rubric, results table, limits, slides, rehearse 3x."
  echo "Run ./scripts/preflight.sh"
}

case "${1:-status}" in
  new) shift; cmd_new "$@";;
  status) cmd_status;;
  land) shift; cmd_land "$@";;
  drop) shift; cmd_drop "$@";;
  freeze) cmd_freeze;;
  *) sed -n '2,10p' "$0";;
esac
