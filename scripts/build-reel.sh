#!/usr/bin/env bash
# Build the NightShift captioned show reel from video/reel/cNN.jpg.
#
#   ./scripts/build-reel.sh
#
# Why a reel and not a voiceover: the event rules require the video to show the
# project functioning and to include the AWS account footage; they do not
# require narration, and they forbid copyrighted music. Only "compact" macOS
# voices are installed on the build machine, and those stitch recorded
# fragments together — the joins are audible as a broken, unsteady voice.
# Captions read cleanly, and most judges watch the first pass muted anyway.
#
# Captions are rendered by the browser over the live deployed page, so the
# type matches the product. Captures are tab-scoped: never capture the whole
# desktop for this.
#
# The bottom 74px of every frame is replaced with solid background. The Chrome
# extension paints a "Claude is active in this tab group" pill there, which is
# a live indicator for the operator, not part of the product. Captions sit
# above that line by design.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=video/reel
OUT=video
BG=0x0d1117
XF=0.5                 # crossfade seconds between captions
CUT=74                 # bottom strip replaced with solid background
mkdir -p "$OUT"

# caption : seconds — the nine beats of docs/video-teleprompter.md
SHOTS=(
  c01:7  c02:7  c03:7                 # 1-2  the problem, and the design position
  c04:8  c05:9                        # 3    deterministic suppression
  c06:6  c07:6                        # 4a   the evidence bundle
  c08:7  c09:6                        # 4b   the four agents
  c10:6  c11:7  c12:7  c13:7  c14:7   # 5    the fabricated citation, caught
  c15:9  c16:10 c17:11 c18:11         # 6-7  live Bedrock, reproducible output
  c19:7  c20:5  c21:4                 # 8    the number that counts against us
  c22:6  c23:5                        # 9    limits
)

n=${#SHOTS[@]}
inputs=(); filter=""; total=0
for i in $(seq 0 $((n-1))); do
  s="${SHOTS[$i]}"; name="${s%%:*}"; secs="${s##*:}"
  f="$SRC/$name.jpg"
  [ -f "$f" ] || { echo "missing frame: $f" >&2; exit 1; }
  inputs+=(-loop 1 -t "$secs" -i "$f")
  filter+="[$i:v]crop=1568:$((764-CUT)):0:0,pad=1568:764:0:0:color=$BG,"
  filter+="scale=1920:936:flags=lanczos,pad=1920:1080:0:72:color=$BG,"
  filter+="format=yuv420p,fps=30,setsar=1[v$i];"
  total=$((total + secs))
done

# xfade overlaps each pair, so clip i+1 starts XF earlier than its own cut
cum=0; prev="[v0]"
for i in $(seq 0 $((n-2))); do
  d="${SHOTS[$i]##*:}"; cum=$((cum + d))
  off=$(awk -v c="$cum" -v x="$XF" -v k="$((i+1))" 'BEGIN{printf "%.3f", c - k*x}')
  out="[x$((i+1))]"; [ "$i" -eq $((n-2)) ] && out="[out]"
  filter+="${prev}[v$((i+1))]xfade=transition=fade:duration=$XF:offset=$off$out;"
  prev="$out"
done
filter="${filter%;}"

dur=$(awk -v t="$total" -v x="$XF" -v k="$((n-1))" 'BEGIN{printf "%.2f", t - k*x}')
printf 'building %s captions, %ss of video\n' "$n" "$dur"
awk -v d="$dur" 'BEGIN{if(d>180){print "OVER THE 3:00 CAP"; exit 1}}'

ffmpeg -y -loglevel error "${inputs[@]}" \
  -filter_complex "$filter" -map "[out]" \
  -r 30 -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  "$OUT/nightshift_reel.mp4"

printf '%-30s %ss  %s\n' "nightshift_reel.mp4" \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/nightshift_reel.mp4" | cut -d. -f1)" \
  "$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$OUT/nightshift_reel.mp4")"
