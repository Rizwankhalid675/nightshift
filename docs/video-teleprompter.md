# Teleprompter — read this, nothing else

Nine beats, **2:45** against a 3:00 cap. ~410 words, so ~150 a minute. Open on a phone or second
screen. If you finish a beat early, pause; do not improvise.

**The picture is already finished.** You are recording voice only, over a locked cut. There is no
browser to drive and no keystrokes to hit — those were needed when the demo was captured live, and
they are not any more. Play `video/nightshift_silent.mp4` on one screen and read from the other.

**A 4-second title card runs first.** Do not speak over it. Start on beat 1 when the dashboard
appears; the build script offsets your take by those four seconds automatically. An end card holds
for six seconds after your last word. The whole file is 2:55, the spoken part 2:45.

**Reset first:** `./scripts/video-reset.sh` — it checks the tests, confirms the deployed site matches
the committed run data, and proves the site regenerates byte for byte. It exits non-zero if anything
is off. Do not record until it says *Ready to record.*

> **Rules note.** The official rules require footage that shows *"the internal accounts including
> all upstream/downstream environments."* That is beats 6–7. **Do not crop or blur the account
> name or id** — showing it is the requirement, not a mistake.

---

### 1 · 0:00 → 0:12 · *dashboard, top*

This is three days of alerts from a managed service provider's network operations centre. Two
hundred and three of them. Twelve actually mattered. On-call stopped reading these weeks ago — and
that is how real outages get missed.

---

### 2 · 0:12 → 0:21 · *still on the dashboard*

NightShift. Rules decide what deserves attention. Amazon Bedrock decides what is wrong. And
deterministic code decides whether a robot may touch anything.

---

### 3 · 0:21 → 0:38 · *the suppressed panel*

A hundred and seventeen of these never reach the model. A benign pattern a library logs at ERROR. A
nightly maintenance window. A probe flapping. Each says why, in writing — so suppression is
auditable, not magic.

---

### 4 · 0:38 → 1:03 · *the payments-gateway incident: evidence, then the agent table*

One real incident. Five alerts, one payments outage. This is everything the model was shown and
nothing else — every item hashed. Four agents in sequence: triage, diagnosis, remediation, and a
reviewer whose only job is to disagree.

---

### 5 · 1:03 → 1:37 · *the reviewer verdict and the gate — THE SHOT*

Now the part I did not plan.

The reviewer said *confirmed*, and supplied a quote to justify it — which is not in the evidence.
The model fabricated its own citation.

Code checked that quote against the source, did not find it, and says so here: the quote it offered
is **not** in the source evidence. Verdict downgraded to a dissent, action held for a human.

That is the design working against a real model, not a claim about one.

---

### 6 · 1:37 → 2:01 · *cut to the AWS console — the live Bedrock call*

This is the account it runs in. Region us-east-2, Amazon Bedrock, Nova Pro — a live call going out
and coming back. No static credentials anywhere; it signs with the task role.

---

### 7 · 2:01 → 2:18 · *same screen, the line below*

And the console you just saw regenerates from the saved run data — byte for byte, no model call.
Every number on it is reproducible from an artefact, not retyped.

---

### 8 · 2:18 → 2:34 · *cut to the acme-retail dashboard — the red number*

Same binary, different customer. And this one is not clean. One unattended action on an incident
our own labels call noise. It opened a ticket — it changed nothing — but we count it against
ourselves, and the dashboard says so without being asked.

---

### 9 · 2:34 → 2:45 · *back to northwind-msp, top of the dashboard*

Traffic is synthetic and seeded, so every number reproduces. Execution is dry-run by default. The
limits are in the README, written before you asked.

---

## Recording

1. Play `video/nightshift_silent.mp4` once through without speaking, to learn where the cuts land.
2. Record with QuickTime Player (**File → New Audio Recording**) or Voice Memos. Quiet room, mic
   close in, **one continuous take** — do not stop between beats.
3. Start recording, start the video, and begin beat 1 when the dashboard appears — not on the
   title card. Read to the timecodes from there.
4. Lay the take over the picture:

   ```bash
   ./scripts/build-video.sh ~/path/to/your-recording.m4a
   ```

   It prints the drift between your take and the picture, then writes
   `video/nightshift_narrated.mp4`.

**Do not mux it by hand with `-shortest`.** A take shorter than the picture makes `-shortest` end
the file at the end of the *audio*: a 30-second take against this cut produced a 37-second video,
with the live AWS footage gone and exit status 0. The script pads the audio first, so a short take
can only ever leave silence at the end.

If a beat runs long, do not speed up to catch the next one. The cut arrives on time either way, and
a calm voice over a slightly late line reads better than a rushed one.

## Why beats 5 and 8 are the submission

Criterion 3 scores outcomes *"based on what's demonstrated"*. Beat 5 shows a real model fabricating
a citation and being caught by code. Beat 8 volunteers a number that counts against us, before a
judge can find it by clicking. Most entries will assert their guardrails work.
