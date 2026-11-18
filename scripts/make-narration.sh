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

[ -f .env ] || die "No .env file yet. Create it by pasting this, with your key in place
of the placeholder:

  cat > .env <<'EOF'
  ELEVENLABS_API_KEY=paste-your-key-here
  ELEVENLABS_VOICE_ID=
  ELEVENLABS_MODEL_ID=eleven_multilingual_v2
  EOF
  chmod 600 .env

Then run this again with --voices to pick a voice. .env is git-ignored."

# shellcheck disable=SC1091
set -a; . ./.env; set +a
: "${ELEVENLABS_API_KEY:=}"
: "${ELEVENLABS_VOICE_ID:=}"
: "${ELEVENLABS_MODEL_ID:=eleven_multilingual_v2}"
[ -n "$ELEVENLABS_API_KEY" ] || die "ELEVENLABS_API_KEY is empty in .env"

# curl reads the key from a file rather than argv, so it never appears in `ps`
HDR="$(mktemp)"; trap 'rm -f "$HDR"' EXIT
( umask 077; printf 'xi-api-key: %s\n' "$ELEVENLABS_API_KEY" > "$HDR" )

# Describe the key WITHOUT revealing it, for when the API rejects it.
key_shape() {
  python3 - <<'PY'
import os
k = os.environ.get("ELEVENLABS_API_KEY", "")
bits = [f"{len(k)} characters"]
if k != k.strip():            bits.append("has leading/trailing whitespace")
if any(c in k for c in "\r\n"):bits.append("contains a newline")
if k.startswith("sk_"):       bits.append("starts with sk_")
elif k:                       bits.append("does NOT start with sk_")
if k.lower() in ("paste_key_here", "paste-your-key-here", "your-key-here"):
    bits.append("IS STILL THE PLACEHOLDER")
print("  key: " + ", ".join(bits))
PY
}

# Speak the opening line in several voices, back to back, so the voice can be
# chosen by ear rather than from a one-word description in a list.
if [ "${1:-}" = "--samples" ]; then
  shift
  CANDS=("$@")
  if [ "${#CANDS[@]}" -eq 0 ]; then
    CANDS=(SAz9YHcvj6GT2YYXdXww cjVigY5qzO86Huf0OWal nPczCjzI2devNBz1zQrb onwK4e9ZLuTAKqWW03F9)
  fi
  LINE=$(python3 -c 'print(open("docs/narration-script.txt").read().split("\n\n")[0].strip().replace("\n"," "))')
  mkdir -p video/voice-samples
  rm -f video/voice-samples/*.mp3
  ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 0.9 \
    -c:a libmp3lame -b:a 128k video/voice-samples/gap.mp3
  : > video/voice-samples/concat.txt
  i=0
  for vid in "${CANDS[@]}"; do
    i=$((i+1))
    out="video/voice-samples/$(printf '%02d' "$i")_$vid.mp3"
    code=$(curl -sS -o "$out" -w '%{http_code}' -X POST \
      -H @"$HDR" -H 'Content-Type: application/json' \
      --data-binary "$(python3 -c '
import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": sys.argv[2]}))' "$LINE" "$ELEVENLABS_MODEL_ID")" \
      "$API/text-to-speech/$vid?output_format=$FORMAT" || echo 000)
    if [ "$code" = "200" ]; then
      printf '  %s  %s  %ss\n' "$i" "$vid" \
        "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | cut -d. -f1-2)"
      printf "file '%s'\n" "$PWD/$out" >> video/voice-samples/concat.txt
      printf "file '%s'\n" "$PWD/video/voice-samples/gap.mp3" >> video/voice-samples/concat.txt
    else
      printf '  %s  %s  refused (HTTP %s)\n' "$i" "$vid" "$code" >&2
      rm -f "$out"
    fi
  done
  ffmpeg -y -loglevel error -f concat -safe 0 -i video/voice-samples/concat.txt \
    -c:a libmp3lame -b:a 192k video/voice-samples.mp3
  echo "wrote video/voice-samples.mp3 — the same opening line in each voice, in the order above"
  exit 0
fi

# Does this key have text-to-speech permission at all? A key can be scoped so
# narrowly that --voices fails while generation still works, so test the thing
# we actually need rather than inferring it from the voices call.
if [ "${1:-}" = "--probe" ]; then
  vid="${2:-${ELEVENLABS_VOICE_ID:-}}"
  [ -n "$vid" ] || die "Usage: $0 --probe <voice_id>
No voice id given and ELEVENLABS_VOICE_ID is empty in .env. Copy a voice id
from the ElevenLabs dashboard (Voices, then the id under a voice's name)."
  body_file="$(mktemp)"; trap 'rm -f "$HDR" "$body_file"' EXIT
  code=$(curl -sS -o "$body_file" -w '%{http_code}' -X POST \
    -H @"$HDR" -H 'Content-Type: application/json' \
    --data-binary '{"text":"Testing.","model_id":"'"$ELEVENLABS_MODEL_ID"'"}' \
    "$API/text-to-speech/$vid?output_format=$FORMAT" || echo 000)
  if [ "$code" = "200" ]; then
    echo "text-to-speech works with voice $vid ($(wc -c < "$body_file" | tr -d ' ') bytes of audio)."
    echo "Put that id in ELEVENLABS_VOICE_ID and run this script with no arguments."
    exit 0
  fi
  echo "text-to-speech refused (HTTP $code)." >&2
  head -c 300 "$body_file" >&2; echo >&2
  exit 1
fi

if [ "${1:-}" = "--voices" ]; then
  body_file="$(mktemp)"; trap 'rm -f "$HDR" "$body_file"' EXIT
  code=$(curl -sS -o "$body_file" -w '%{http_code}' -H @"$HDR" "$API/voices" || echo 000)
  if [ "$code" != "200" ]; then
    echo "ElevenLabs refused the request (HTTP $code)." >&2
    key_shape >&2
    case "$code" in
      401) echo "  401 means the key was not accepted. Check for a stray space or a truncated paste." >&2 ;;
      429) echo "  429 means rate-limited or out of quota." >&2 ;;
    esac
    head -c 300 "$body_file" >&2; echo >&2
    exit 1
  fi
  python3 - "$body_file" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
voices = data.get("voices", [])
if not voices:
    print("  (no voices on this account)")
for v in voices:
    print("  %-24s %s" % (v.get("voice_id", "?"), v.get("name", "?")))
PY
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
