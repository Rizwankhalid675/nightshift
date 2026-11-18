#!/usr/bin/env bash
# Build the NightShift captioned show reel.
#
#   ./scripts/build-reel.sh                   -> video/nightshift_reel.mp4
#   ./scripts/build-reel.sh narration.m4a     -> also video/nightshift_reel_narrated.mp4
#   ./scripts/build-reel.sh --timeline        -> print when each shot appears
#
# Shape of the cut: a title card, 23 captions that crossfade into each other,
# an end card. Captions stay even under narration — they carry the film when a
# judge watches the first pass muted, and they are the accessible track.
#
# Captions are rendered by the browser over the live deployed page, so the type
# matches the product's. Captures are tab-scoped: never capture the whole
# desktop for this. The bottom 74px of every frame is replaced with solid
# background, where the Chrome extension paints its "Claude is active" pill.
#
# The narration script is docs/reel-teleprompter.md and its timecodes come from
# --timeline here; tests/video.test.js fails if the two drift apart.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=video
BG=0x0d1117
XF=0.5             # crossfade seconds between shots
CUT=74             # bottom strip replaced with solid background
LEAD_IN=4          # title card, before anyone speaks
TAIL=6             # end card, after the last word
CAP=180            # the event's 3:00 limit
mkdir -p "$OUT"

# caption : seconds — the nine beats of docs/video-teleprompter.md
CAPS=(
  c01:7  c02:7  c03:7                 # 1-2  the problem, and the design position
  c04:8  c05:9                        # 3    deterministic suppression
  c06:6  c07:6                        # 4a   the evidence bundle
  c08:7  c09:6                        # 4b   the four agents
  c10:6  c11:7  c12:7  c13:7  c14:7   # 5    the fabricated citation, caught
  c15:9  c16:10 c17:11 c18:11         # 6-7  live Bedrock, reproducible output
  c19:7  c20:5  c21:4                 # 8    the number that counts against us
  c22:6  c23:5                        # 9    limits
)
SHOTS=("b00_title:$LEAD_IN" "${CAPS[@]}" "b10_end:$TAIL")

frame_for() {  # cards live with the other cut's frames; captions have their own dir
  case "$1" in
    c*) echo "video/reel/$1.jpg" ;;
    *)  echo "video/frames/$1.jpg" ;;
  esac
}

n=${#SHOTS[@]}
# start time of shot i, given every pair overlaps by XF
start_of() {
  awk -v i="$1" -v x="$XF" -v list="${SHOTS[*]}" 'BEGIN{
    split(list, s, " "); cum = 0
    for (k = 1; k <= i; k++) { split(s[k], p, ":"); cum += p[2] }
    printf "%.2f", cum - i * x
  }'
}

if [ "${1:-}" = "--timeline" ]; then
  for i in $(seq 0 $((n-1))); do
    printf '%-10s %7ss\n' "${SHOTS[$i]%%:*}" "$(start_of "$i")"
  done
  exit 0
fi

for s in "${SHOTS[@]}"; do
  f=$(frame_for "${s%%:*}")
  [ -f "$f" ] || { echo "missing frame: $f" >&2; exit 1; }
done

inputs=(); filter=""; raw=0
for i in $(seq 0 $((n-1))); do
  s="${SHOTS[$i]}"; secs="${s##*:}"
  inputs+=(-loop 1 -t "$secs" -i "$(frame_for "${s%%:*}")")
  filter+="[$i:v]fps=30,crop=1568:$((764-CUT)):0:0,pad=1568:764:0:0:color=$BG,"
  filter+="scale=1920:936:flags=lanczos,pad=1920:1080:0:72:color=$BG,"
  filter+="format=yuv420p,setsar=1[v$i];"
  raw=$((raw + secs))
done

prev="[v0]"
for i in $(seq 0 $((n-2))); do
  off=$(start_of "$((i+1))")
  out="[x$((i+1))]"; [ "$i" -eq $((n-2)) ] && out="[out]"
  filter+="${prev}[v$((i+1))]xfade=transition=fade:duration=$XF:offset=$off$out;"
  prev="$out"
done
filter="${filter%;}"

dur=$(awk -v r="$raw" -v x="$XF" -v k="$((n-1))" 'BEGIN{printf "%.2f", r - k*x}')
speak_from=$(start_of 1)                       # when the first caption appears
speak_to=$(start_of $((n-1)))                  # when the end card starts
window=$(awk -v a="$speak_from" -v b="$speak_to" 'BEGIN{printf "%.1f", b-a}')
printf 'reel: %s shots, %ss total, narration window %ss (%ss to %ss)\n' \
  "$n" "$dur" "$window" "$speak_from" "$speak_to"
awk -v d="$dur" -v c="$CAP" 'BEGIN{if(d>c){print "OVER THE 3:00 CAP"; exit 1}}'

ffmpeg -y -loglevel error "${inputs[@]}" \
  -filter_complex "$filter" -map "[out]" \
  -r 30 -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  "$OUT/nightshift_reel.mp4"
echo "wrote $OUT/nightshift_reel.mp4"

# Check the OUTPUT. A frame file can be perfect while the shot still renders
# black — that is exactly how the title card failed in the other cut.
bad=0
for i in $(seq 0 $((n-1))); do
  s="${SHOTS[$i]}"
  mid=$(awk -v a="$(start_of "$i")" -v d="${s##*:}" -v x="$XF" 'BEGIN{printf "%.2f", a + (d-x)/2}')
  hex=$(ffmpeg -v error -i "$OUT/nightshift_reel.mp4" -ss "$mid" -frames:v 1 \
        -vf "format=gray,scale=1:1:flags=area" -f rawvideo - 2>/dev/null | xxd -p | head -1 | cut -c1-2)
  luma=$((16#${hex:-0}))
  [ "$luma" -ge 2 ] || { printf '  BLANK  %s at %ss\n' "${s%%:*}" "$mid" >&2; bad=1; }
done
[ "$bad" -eq 0 ] || { echo "a shot rendered blank — refusing to ship this cut" >&2; exit 1; }
echo "  every shot renders"

if [ "${1:-}" != "" ]; then
  if [ ! -f "$1" ]; then
    echo "narration file not found: $1" >&2
    case "$1" in
      *path/to/*|*your-recording*|*yourvoice*)
        cat >&2 <<'HINT'

That is the placeholder from the instructions, not a file. Record the take first:

  1. docs/reel-teleprompter.md is the script — 23 lines, about 2m34s of speaking.
  2. Play video/nightshift_reel.mp4 and read along. First word when the FIRST
     CAPTION appears at 0:03 — not over the title card.
  3. QuickTime Player > File > New Audio Recording, one continuous take.
     Save it, then pass that file's real path to this script.

HINT
        ;;
    esac
    exit 1
  fi
  alen=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
  awk -v a="$alen" -v w="$window" 'BEGIN{
    printf "  your take %.1fs   narration window %.1fs   drift %+.1fs\n", a, w, a-w
    if (a > w + 2)      print "  your take overruns the captions and will run into the end card"
    else if (a < w - 8) print "  your take ends early — the rest is silence"
  }'
  # adelay puts the voice after the title card; apad before -shortest so a
  # short take can never truncate the picture.
  ffmpeg -y -loglevel error -i "$OUT/nightshift_reel.mp4" -i "$1" \
    -filter_complex "[1:a]adelay=$(awk -v s="$speak_from" 'BEGIN{printf "%d", s*1000}'):all=1,apad[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUT/nightshift_reel_narrated.mp4"
  echo "wrote $OUT/nightshift_reel_narrated.mp4"
fi

for f in "$OUT"/nightshift_reel*.mp4; do
  [ -f "$f" ] || continue
  printf '%-34s %ss  %s\n' "$(basename "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -d. -f1)" \
    "$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$f")"
done
