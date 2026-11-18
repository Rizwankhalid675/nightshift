#!/usr/bin/env bash
# Speak docs/narration-script.txt with ElevenLabs, one line at a time.
#
#   ./scripts/make-narration.sh --voices     list the voices on your account
#   ./scripts/make-narration.sh --dry-run    show what would be sent, call nothing
#   ./scripts/make-narration.sh              generate video/narration.mp3
#
# Why line by line rather than one long request: each of the 23 lines is tied
# to a caption in the reel. Generating them separately gives an exact silence
# between lines AND the true duration of each one, which is what lets the
# captions be aligned to the voice instead of the voice being squeezed to fit
# the captions. The durations are written to video/narration-timings.json.
#
# The key lives in .env, which is git-ignored. It is never echoed, never put on
# a command line where `ps` would show it, and never written to any file this
# script creates.
set -euo pipefail
cd "$(dirname "$0")/.."

SCRIPT_TXT=docs/narration-script.txt
OUTDIR=video/narration
GAP=0.5                      # silence between lines, seconds
API=https://api.elevenlabs.io/v1
FORMAT=mp3_44100_128

die() { echo "$*" >&2; exit 1; }

[ -f .env ] || die "No .env file. Copy .env.example to .env and put your ElevenLabs key in it.
If .env.example is missing too, create .env with these three lines:

  ELEVENLABS_API_KEY=your-key-here
  ELEVENLABS_VOICE_ID=
  ELEVENLABS_MODEL_ID=eleven_multilingual_v2"

# shellcheck disable=SC1091
set -a; . ./.env; set +a
: "${ELEVENLABS_API_KEY:=}"
: "${ELEVENLABS_VOICE_ID:=}"
: "${ELEVENLABS_MODEL_ID:=eleven_multilingual_v2}"
[ -n "$ELEVENLABS_API_KEY" ] || die "ELEVENLABS_API_KEY is empty in .env"

# curl reads the key from a file rather than argv, so it never appears in `ps`
HDR="$(mktemp)"; trap 'rm -f "$HDR"' EXIT
( umask 077; printf 'xi-api-key: %s\n' "$ELEVENLABS_API_KEY" > "$HDR" )

if [ "${1:-}" = "--voices" ]; then
  curl -fsS -H @"$HDR" "$API/voices" \
    | python3 -c 'import json,sys
for v in json.load(sys.stdin).get("voices", []):
    print(f"  {v.get(\"voice_id\",\"?\"):<24} {v.get(\"name\",\"?\")}")' \
    || die "Could not list voices. Check the key in .env."
  echo
  echo "Paste one of those ids into ELEVENLABS_VOICE_ID in .env."
  exit 0
fi

[ -n "$ELEVENLABS_VOICE_ID" ] || die "ELEVENLABS_VOICE_ID is empty in .env.
Run ./scripts/make-narration.sh --voices to see the ids on your account."

[ -f "$SCRIPT_TXT" ] || die "missing $SCRIPT_TXT"

# split the script on blank lines — one entry per caption.
# Read loop rather than mapfile: macOS ships bash 3.2, which has no mapfile.
LINES=()
while IFS= read -r __l; do [ -n "$__l" ] && LINES+=("$__l"); done < <(python3 - "$SCRIPT_TXT" <<'PY'
import sys, json
blocks = [b.strip().replace("\n", " ") for b in open(sys.argv[1]).read().split("\n\n")]
for b in [x for x in blocks if x]:
    print(json.dumps(b))
PY
)
n=${#LINES[@]}
[ "$n" -gt 0 ] || die "no lines parsed from $SCRIPT_TXT"
words=$(wc -w < "$SCRIPT_TXT" | tr -d ' ')
printf '%s lines, %s words, voice %s, model %s\n' "$n" "$words" "$ELEVENLABS_VOICE_ID" "$ELEVENLABS_MODEL_ID"

if [ "${1:-}" = "--dry-run" ]; then
  echo "dry run — nothing will be sent:"
  for i in $(seq 0 $((n-1))); do
    printf '  %2d  %s\n' "$((i+1))" "$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])[:72])' "${LINES[$i]}")"
  done
  exit 0
fi

mkdir -p "$OUTDIR"
rm -f "$OUTDIR"/line_*.mp3 "$OUTDIR"/concat.txt

# a single reusable gap of silence
ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t "$GAP" \
  -c:a libmp3lame -b:a 128k "$OUTDIR/gap.mp3"

for i in $(seq 0 $((n-1))); do
  idx=$(printf '%02d' "$((i+1))")
  out="$OUTDIR/line_$idx.mp3"
  body=$(python3 -c '
import json, sys
text = json.loads(sys.argv[1])
print(json.dumps({
  "text": text,
  "model_id": sys.argv[2],
  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True},
}))' "${LINES[$i]}" "$ELEVENLABS_MODEL_ID")

  if ! curl -fsS -X POST \
        -H @"$HDR" -H 'Content-Type: application/json' \
        --data-binary "$body" \
        "$API/text-to-speech/$ELEVENLABS_VOICE_ID?output_format=$FORMAT" \
        -o "$out"; then
    die "line $idx failed. Check the key, the voice id, and your quota."
  fi
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" 2>/dev/null | cut -d. -f1-2)
  printf '  line %s  %6ss\n' "$idx" "${dur:-?}"
done

# concatenate with a gap after every line except the last
: > "$OUTDIR/concat.txt"
for i in $(seq 0 $((n-1))); do
  idx=$(printf '%02d' "$((i+1))")
  printf "file '%s'\n" "$PWD/$OUTDIR/line_$idx.mp3" >> "$OUTDIR/concat.txt"
  [ "$i" -lt "$((n-1))" ] && printf "file '%s'\n" "$PWD/$OUTDIR/gap.mp3" >> "$OUTDIR/concat.txt"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUTDIR/concat.txt" -c:a libmp3lame -b:a 192k video/narration.mp3

# the manifest is what lets the captions be retimed to the voice
python3 - "$OUTDIR" "$GAP" "$n" <<'PY' > video/narration-timings.json
import json, subprocess, sys
outdir, gap, n = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
def dur(p):
    return float(subprocess.run(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p],
        capture_output=True, text=True).stdout.strip())
lines, t = [], 0.0
for i in range(1, n+1):
    d = dur(f"{outdir}/line_{i:02d}.mp3")
    lines.append({"line": i, "start": round(t, 3), "duration": round(d, 3)})
    t += d + (gap if i < n else 0)
json.dump({"gap": gap, "total": round(t, 3), "lines": lines}, sys.stdout, indent=1)
PY

total=$(ffprobe -v error -show_entries format=duration -of csv=p=0 video/narration.mp3 | cut -d. -f1)
echo
echo "wrote video/narration.mp3 (${total}s) and video/narration-timings.json"
echo "next:  ./scripts/build-reel.sh video/narration.mp3"
