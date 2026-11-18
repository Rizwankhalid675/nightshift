#!/usr/bin/env bash
# Build the NightShift demo video from the committed beat frames.
#
#   ./scripts/build-video.sh                 -> video/nightshift_silent.mp4
#   ./scripts/build-video.sh narration.wav   -> also video/nightshift_narrated.mp4
#
# Beat durations come straight from docs/video-teleprompter.md and total 2:45,
# against the event's 3:00 cap. Change a duration here and change it there too.
#
# Frames are captured tab-scoped from the deployed site; recapture instructions
# are in docs/video-teleprompter.md. Never capture the whole desktop for this.
set -euo pipefail
cd "$(dirname "$0")/.."

FRAMES=video/frames
OUT=video
BG=0x0d1117          # --bg from the console stylesheet, so the pad blends in
mkdir -p "$OUT"

for f in b01_dash_top b03_suppressed b04a_evidence b04b_agents b05a_dissent b06_cloudshell b08_acme; do
  [ -f "$FRAMES/$f.jpg" ] || { echo "missing frame: $FRAMES/$f.jpg" >&2; exit 1; }
done

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

LIST="$OUT/concat.txt"
: > "$LIST"
total=0
for b in "${BEATS[@]}"; do
  frame="${b%%:*}"; secs="${b##*:}"
  printf "file '%s'\nduration %s\n" "$PWD/$FRAMES/$frame.jpg" "$secs" >> "$LIST"
  total=$((total + secs))
done
# concat demuxer needs the last frame repeated for its duration to apply
printf "file '%s'\n" "$PWD/$FRAMES/${BEATS[$((${#BEATS[@]}-1))]%%:*}.jpg" >> "$LIST"

printf 'building %dm%02ds of video from %d beats\n' $((total/60)) $((total%60)) "${#BEATS[@]}"
[ "$total" -le 180 ] || { echo "OVER THE 3:00 CAP: ${total}s" >&2; exit 1; }

VF="scale=1920:-2:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG,format=yuv420p"

ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -vf "$VF" -r 30 -t "$total" -c:v libx264 -preset slow -crf 20 \
  "$OUT/nightshift_silent.mp4"
echo "wrote $OUT/nightshift_silent.mp4"

if [ "${1:-}" != "" ]; then
  [ -f "$1" ] || { echo "narration file not found: $1" >&2; exit 1; }
  ffmpeg -y -loglevel error -i "$OUT/nightshift_silent.mp4" -i "$1" \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUT/nightshift_narrated.mp4"
  echo "wrote $OUT/nightshift_narrated.mp4"
fi

for f in "$OUT"/nightshift_*.mp4; do
  [ -f "$f" ] || continue
  printf '%-34s %s  %s\n' "$(basename "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -d. -f1)s" \
    "$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$f")"
done
