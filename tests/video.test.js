import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CAP_SECONDS = 180; // the event's 3:00 limit

const prompter = readFileSync("docs/video-teleprompter.md", "utf8");
const buildVideo = readFileSync("scripts/build-video.sh", "utf8");
const buildReel = readFileSync("scripts/build-reel.sh", "utf8");
const reelPrompter = readFileSync("docs/reel-teleprompter.md", "utf8");

const toSeconds = (mmss) => {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
};

/* The teleprompter is what a person reads aloud; the build script decides when
   the picture actually cuts. They are two files, so they drift. These bind them. */

test("the teleprompter's last beat ends exactly where the narration window does", () => {
  const beats = [...prompter.matchAll(/^### \d+ · (\d+:\d\d) → (\d+:\d\d) ·/gm)];
  assert.ok(beats.length >= 9, `expected at least 9 beats, found ${beats.length}`);

  const narrationEnd = toSeconds(beats[beats.length - 1][2]);

  const durations = [...buildVideo.matchAll(/^\s+"[a-z0-9_]+:(\d+)"/gm)].map((m) => Number(m[1]));
  assert.ok(durations.length > 0, "found no beat durations in build-video.sh");
  const pictureEnd = durations.reduce((a, b) => a + b, 0);

  assert.equal(
    pictureEnd,
    narrationEnd,
    `the script ends at ${narrationEnd}s but the narration window is ${pictureEnd}s`,
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
  /* The picture is longer than the narration: a title card runs before anyone
     speaks and an end card holds after the last word. The cap applies to the
     whole file, so count all three. */
  const narration = [...buildVideo.matchAll(/^\s+"[a-z0-9_]+:(\d+)"/gm)]
    .map((m) => Number(m[1]))
    .reduce((a, b) => a + b, 0);
  const leadIn = Number(buildVideo.match(/^LEAD_IN=(\d+)/m)[1]);
  const tail = Number(buildVideo.match(/^TAIL=(\d+)/m)[1]);
  const video = leadIn + narration + tail;
  assert.ok(
    video <= CAP_SECONDS,
    `picture is ${video}s (${leadIn} title + ${narration} narration + ${tail} end), over the ${CAP_SECONDS}s cap`,
  );

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

test("the title and end cards exist as frames", async () => {
  const { existsSync } = await import("node:fs");
  for (const card of ["b00_title", "b10_end"]) {
    assert.ok(
      buildVideo.includes(card),
      `build-video.sh no longer uses ${card}`,
    );
    assert.ok(existsSync(`video/frames/${card}.jpg`), `video/frames/${card}.jpg is missing`);
  }
});

/* The reel's narration script carries a timecode per caption. Those come from
   `build-reel.sh --timeline`, so the two files must agree or the reader is
   cueing to cuts that no longer exist. Recompute and compare. */

const reelShots = () => {
  const num = (re) => Number(buildReel.match(re)[1]);
  const leadIn = num(/^LEAD_IN=(\d+)/m);
  const tail = num(/^TAIL=(\d+)/m);
  const xf = num(/^XF=([\d.]+)/m);
  const caps = [...buildReel.matchAll(/\b(c\d\d):(\d+)/g)].map((m) => ({ name: m[1], secs: Number(m[2]) }));
  const shots = [{ name: "b00_title", secs: leadIn }, ...caps, { name: "b10_end", secs: tail }];
  let cum = 0;
  return shots.map((shot, i) => {
    const start = cum - i * xf;
    cum += shot.secs;
    return { ...shot, start };
  });
};

test("every caption in the reel script is timed where the build puts it", () => {
  const shots = reelShots();
  const byName = new Map(shots.map((s) => [s.name, s.start]));

  const timed = [...reelPrompter.matchAll(/<sub>\d+ words · ([\d.]+)s<\/sub>/g)].map((m) => Number(m[1]));
  const caps = shots.filter((s) => /^c\d\d$/.test(s.name));
  assert.equal(timed.length, caps.length, `script has ${timed.length} timed lines, the build has ${caps.length} captions`);

  caps.forEach((cap, i) => {
    assert.ok(
      Math.abs(timed[i] - byName.get(cap.name)) < 0.01,
      `${cap.name}: script says ${timed[i]}s, the build puts it at ${byName.get(cap.name).toFixed(2)}s`,
    );
  });
});

test("the reel's narration window leaves room for the end card", () => {
  const shots = reelShots();
  const first = shots.find((s) => /^c\d\d$/.test(s.name)).start;
  const endCard = shots[shots.length - 1].start;
  assert.ok(first > 0, "narration starts at or before the title card");
  assert.ok(endCard > first, "the end card starts before the narration does");

  const stated = Number(reelPrompter.match(/the \*\*?([\d.]+)?-?second narration window|against the (\d+)-second narration window/)?.[2] ?? NaN);
  if (!Number.isNaN(stated)) {
    assert.ok(
      Math.abs(stated - (endCard - first)) < 1,
      `script quotes a ${stated}s window, the build gives ${(endCard - first).toFixed(1)}s`,
    );
  }
});

test("the finished reel stays inside the three-minute cap", () => {
  const shots = reelShots();
  const xf = Number(buildReel.match(/^XF=([\d.]+)/m)[1]);
  const raw = shots.reduce((a, s) => a + s.secs, 0);
  const total = raw - (shots.length - 1) * xf;
  assert.ok(total <= CAP_SECONDS, `reel is ${total}s, over the ${CAP_SECONDS}s cap`);
});

/* The README's test count has drifted three times, always by hand. Let it be
   checked like anything else. Counting `test(` at line start matches what the
   runner reports; if that ever stops being true, this test is the thing that
   is wrong, not the README. */
test("the README states the real number of tests", async () => {
  const { readdirSync } = await import("node:fs");
  const declared = readdirSync("tests")
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => readFileSync(`tests/${f}`, "utf8"))
    .reduce((n, src) => n + (src.match(/^test\(/gm) ?? []).length, 0);

  const readme = readFileSync("README.md", "utf8");
  const claims = [...readme.matchAll(/(\d+) tests/g)].map((m) => Number(m[1]));
  assert.ok(claims.length > 0, "README no longer states a test count");

  for (const claim of claims) {
    assert.equal(claim, declared, `README says ${claim} tests, tests/ declares ${declared}`);
  }
});

/* docs/narration-script.txt is what gets pasted into a voice service, and
   docs/reel-teleprompter.md is what the captions are timed against. They are
   the same words in two files, which is exactly how two files stop being the
   same words. */
test("the voice-service script is the teleprompter's lines, verbatim", () => {
  const spoken = reelPrompter
    .split("\n")
    .reduce((acc, line, i, all) => {
      if (/^### \d+:\d\d {2}·/.test(line)) acc.push(all[i + 2]?.trim());
      return acc;
    }, [])
    .filter(Boolean);

  const pasteable = readFileSync("docs/narration-script.txt", "utf8")
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  assert.equal(
    pasteable.length,
    spoken.length,
    `narration-script.txt has ${pasteable.length} lines, the teleprompter has ${spoken.length}`,
  );
  pasteable.forEach((line, i) => {
    assert.equal(line, spoken[i], `line ${i + 1} differs between the script and the teleprompter`);
  });
});

test("the voice-service script has one line per caption", () => {
  const captions = [...buildReel.matchAll(/\bc\d\d:\d+/g)].length;
  const lines = readFileSync("docs/narration-script.txt", "utf8")
    .split(/\n\s*\n/)
    .filter((s) => s.trim()).length;
  assert.equal(lines, captions, `${lines} narration lines for ${captions} captions`);
});

/* make-narration.sh runs under whatever /usr/bin/env bash resolves to, and on
   macOS that is bash 3.2. Bash-4 builtins fail at runtime, after the script
   has already looked like it started working. */
test("the narration generator uses nothing newer than bash 3.2", () => {
  const src = readFileSync("scripts/make-narration.sh", "utf8")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))   // comments may name these; code may not
    .join("\n");
  const bashFour = [
    [/\bmapfile\b|\breadarray\b/, "mapfile/readarray"],
    [/\[-1\]/, "negative array subscript"],
    [/declare\s+-A|local\s+-A/, "associative array"],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*\^\^|\$\{[A-Za-z_][A-Za-z0-9_]*,,/, "case-modification expansion"],
  ];
  for (const [re, name] of bashFour) {
    assert.ok(!re.test(src), `scripts/make-narration.sh uses ${name}, which bash 3.2 does not have`);
  }
});

test("the narration generator never puts the key on a command line", () => {
  const src = readFileSync("scripts/make-narration.sh", "utf8");
  // the key must reach curl through a header file, not -H "xi-api-key: $KEY"
  assert.ok(
    !/-H\s+["']xi-api-key:/.test(src),
    "the key would appear in the process list; pass it with -H @file instead",
  );
  assert.ok(src.includes('-H @"$HDR"'), "expected curl to read its headers from a file");
  assert.ok(
    !/echo[^\n]*ELEVENLABS_API_KEY|printf[^\n]*ELEVENLABS_API_KEY[^\n]*>&?[12]?\s*$/m.test(src),
    "the key must never be echoed",
  );
});
