import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CAP_SECONDS = 180; // the event's 3:00 limit

const prompter = readFileSync("docs/video-teleprompter.md", "utf8");
const buildVideo = readFileSync("scripts/build-video.sh", "utf8");
const buildReel = readFileSync("scripts/build-reel.sh", "utf8");

const toSeconds = (mmss) => {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
};

/* The teleprompter is what a person reads aloud; the build script decides when
   the picture actually cuts. They are two files, so they drift. These bind them. */

test("the teleprompter's last beat ends exactly where the picture does", () => {
  const beats = [...prompter.matchAll(/^### \d+ · (\d+:\d\d) → (\d+:\d\d) ·/gm)];
  assert.ok(beats.length >= 9, `expected at least 9 beats, found ${beats.length}`);

  const narrationEnd = toSeconds(beats[beats.length - 1][2]);

  const durations = [...buildVideo.matchAll(/^\s+"[a-z0-9_]+:(\d+)"/gm)].map((m) => Number(m[1]));
  assert.ok(durations.length > 0, "found no beat durations in build-video.sh");
  const pictureEnd = durations.reduce((a, b) => a + b, 0);

  assert.equal(
    pictureEnd,
    narrationEnd,
    `the script ends at ${narrationEnd}s but the picture runs ${pictureEnd}s`,
  );
});

test("the teleprompter's beats run back to back, with no gap or overlap", () => {
  const beats = [...prompter.matchAll(/^### \d+ · (\d+:\d\d) → (\d+:\d\d) ·/gm)];
  for (let i = 1; i < beats.length; i++) {
    const prevEnd = toSeconds(beats[i - 1][2]);
    const thisStart = toSeconds(beats[i][1]);
    assert.equal(thisStart, prevEnd, `beat ${i + 1} starts at ${thisStart}s, beat ${i} ended at ${prevEnd}s`);
  }
});

test("neither cut can be built over the three-minute cap", () => {
  const video = [...buildVideo.matchAll(/^\s+"[a-z0-9_]+:(\d+)"/gm)]
    .map((m) => Number(m[1]))
    .reduce((a, b) => a + b, 0);
  assert.ok(video <= CAP_SECONDS, `narrated cut is ${video}s, over the ${CAP_SECONDS}s cap`);

  const shots = [...buildReel.matchAll(/\bc\d\d:(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(shots.length > 0, "found no caption durations in build-reel.sh");
  const xfade = Number(buildReel.match(/^XF=([\d.]+)/m)[1]);
  const reel = shots.reduce((a, b) => a + b, 0) - (shots.length - 1) * xfade;
  assert.ok(reel <= CAP_SECONDS, `reel is ${reel}s, over the ${CAP_SECONDS}s cap`);
});

test("every caption the reel names has a frame on disk", async () => {
  const { existsSync } = await import("node:fs");
  const names = [...buildReel.matchAll(/\b(c\d\d):\d+/g)].map((m) => m[1]);
  assert.ok(names.length > 0, "found no captions in build-reel.sh");
  for (const n of names) {
    assert.ok(existsSync(`video/reel/${n}.jpg`), `build-reel.sh names ${n} but video/reel/${n}.jpg is missing`);
  }
});
