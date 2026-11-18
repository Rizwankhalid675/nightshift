#!/usr/bin/env bash
# Build the NightShift demo video from the committed beat frames.
#
#   ./scripts/build-video.sh                 -> video/nightshift_silent.mp4
#   ./scripts/build-video.sh narration.m4a   -> also video/nightshift_narrated.mp4
#
# Shape of the cut:
#
#   LEAD_IN   title card, before anyone speaks
#   BEATS     the nine narration beats of docs/video-teleprompter.md, 2:45
#   TAIL      end card, after the last word
#
# The narration maps onto BEATS only. A reader starts speaking when the
# dashboard appears, not when the file starts — the teleprompter says so, and
# tests/video.test.js checks that BEATS still totals what the script totals.
#
# Cuts between beats are hard, deliberately: a crossfade would slide content
# away from the timecode the reader is reading to.
#
# Frames are captured tab-scoped from the deployed site, with the element each
# beat is about ringed in the browser before capture. Recapture instructions
# are in docs/video-teleprompter.md. Never capture the whole desktop for this.
set -euo pipefail
cd "$(dirname "$0")/.."

FRAMES=video/frames
OUT=video
BG=0x0d1117
LEAD_IN=4          # title card
TAIL=6             # end card
FADE_IN=0.8
FADE_OUT=1.0
CAP=180            # the event's 3:00 limit
mkdir -p "$OUT"

# beat -> frame, seconds   (teleprompter beats 1+2 share a shot, as do 6+7)
BEATS=(
  "b01_dash_top:21"      # 1 the problem      + 2 what NightShift is
  "b03_suppressed:17"    # 3 deterministic suppression, each with a reason
  "b04a_evidence:12"     # 4a what the model was shown, every item hashed
  "b04b_agents:13"       # 4b four agents in sequence
  "b05a_dissent:34"      # 5  THE SHOT: fabricated citation caught, action held
  "b06_cloudshell:41"    # 6 live Bedrock call + 7 byte-identical regeneration
  "b08_acme:16"          # 8 the number that counts against us
  "b01_dash_top:11"      # 9 limits
)

SHOTS=("b00_title:$LEAD_IN" "${BEATS[@]}" "b10_end:$TAIL")

for s in "${SHOTS[@]}"; do
  f="$FRAMES/${s%%:*}.jpg"
  [ -f "$f" ] || { echo "missing frame: $f" >&2; exit 1; }
done

LIST="$OUT/concat.txt"
: > "$LIST"
narration=0; total=0
for s in "${BEATS[@]}";  do narration=$((narration + ${s##*:})); done
for s in "${SHOTS[@]}"; do
  printf "file '%s'\nduration %s\n" "$PWD/$FRAMES/${s%%:*}.jpg" "${s##*:}" >> "$LIST"
  total=$((total + ${s##*:}))
done
# concat demuxer needs the last frame repeated for its duration to apply
printf "file '%s'\n" "$PWD/$FRAMES/${SHOTS[$((${#SHOTS[@]}-1))]%%:*}.jpg" >> "$LIST"

printf 'title %ss + narration %dm%02ds + end card %ss = %dm%02ds\n' \
  "$LEAD_IN" $((narration/60)) $((narration%60)) "$TAIL" $((total/60)) $((total%60))
[ "$total" -le "$CAP" ] || { echo "OVER THE 3:00 CAP: ${total}s" >&2; exit 1; }

FADE_OUT_AT=$(awk -v t="$total" -v d="$FADE_OUT" 'BEGIN{printf "%.2f", t-d}')
# fps=30 FIRST, and it is load-bearing. The concat demuxer emits one frame per
# still image, so without it the filter graph sees ~11 frames in total and
# fade=t=in blacks out frame zero — which IS the whole title card, duplicated
# afterwards by the frame-rate conversion. The card came out uniformly black.
VF="fps=30,scale=1920:-2:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG"
VF="$VF,fade=t=in:st=0:d=$FADE_IN,fade=t=out:st=$FADE_OUT_AT:d=$FADE_OUT,format=yuv420p"

ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -vf "$VF" -r 30 -t "$total" -c:v libx264 -preset slow -crf 20 \
  "$OUT/nightshift_silent.mp4"
echo "wrote $OUT/nightshift_silent.mp4"

# Check the OUTPUT, not the inputs. The frame files were fine while the title
# card still came out uniformly black in the video; nothing but sampling the
# built file would have caught it.
at=0; bad=0
for s in "${SHOTS[@]}"; do
  secs="${s##*:}"
  mid=$(awk -v a="$at" -v d="$secs" 'BEGIN{printf "%.2f", a + d/2}')
  hex=$(ffmpeg -v error -i "$OUT/nightshift_silent.mp4" -ss "$mid" -frames:v 1 \
        -vf "format=gray,scale=1:1:flags=area" -f rawvideo - 2>/dev/null | xxd -p | head -1 | cut -c1-2)
  luma=$((16#${hex:-0}))
  if [ "$luma" -lt 2 ]; then
    printf '  BLANK  %-18s at %ss\n' "${s%%:*}" "$mid" >&2
    bad=1
  else
    printf '  ok     %-18s at %-6ss luma %s\n' "${s%%:*}" "$mid" "$luma"
  fi
  at=$((at + secs))
done
[ "$bad" -eq 0 ] || { echo "a shot rendered blank — refusing to ship this cut" >&2; exit 1; }

# An interrupted ffmpeg leaves a file with no moov atom: right size, unreadable.
got=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/nightshift_silent.mp4" 2>/dev/null || true)
awk -v g="${got:-0}" -v w="$total" 'BEGIN{
  if (g+0 < w-1 || g+0 > w+1) { printf "output is %ss, expected %ss — truncated or unreadable\n", (g==""?"unreadable":g), w; exit 1 }
}' >&2 || exit 1
echo "  output reads back at ${got%.*}s"

if [ "${1:-}" != "" ]; then
  [ -f "$1" ] || { echo "narration file not found: $1" >&2; exit 1; }
  vlen=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/nightshift_silent.mp4")
  alen=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
  awk -v v="$vlen" -v a="$alen" -v n="$narration" -v l="$LEAD_IN" 'BEGIN{
    printf "  picture %.1fs   narration %.1fs   spoken part is %ds\n", v, a, n
    if (a > n + 1.5)      print "  your take is longer than the narration window; it will run into the end card"
    else if (a < n - 8)   print "  your take is shorter than the narration window; the rest is silence"
  }'
  # The narration starts when the dashboard does, so delay it past the title card.
  # apad before -shortest: with -shortest alone a short take TRUNCATES THE PICTURE.
  ffmpeg -y -loglevel error -i "$OUT/nightshift_silent.mp4" -i "$1" \
    -filter_complex "[1:a]adelay=${LEAD_IN}s:all=1,apad[a]" -map 0:v -map "[a]" \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUT/nightshift_narrated.mp4"
  echo "wrote $OUT/nightshift_narrated.mp4"
fi

for f in "$OUT"/nightshift_*.mp4; do
  [ -f "$f" ] || continue
  printf '%-30s %ss  %s\n' "$(basename "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -d. -f1)" \
    "$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$f")"
done
