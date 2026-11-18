# Teleprompter — read this, nothing else

Nine beats, **2:45** against a 3:00 cap. ~410 words, so ~150 a minute. Open on a phone or second
screen. If you finish a beat early, pause; do not improvise.

**Reset first:** `./scripts/video-reset.sh` — it checks the tests, confirms the deployed site matches
the committed run data, proves the site regenerates byte for byte, and prints the two commands to
paste into CloudShell. It exits non-zero if anything is off. Do not record until it says
*Ready to record.*

**Two keystrokes are yours:** `cmd+2` at **1:37**, `cmd+1` at **2:18**. Claude drives everything else.

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

### 3 · 0:21 → 0:38 · *scrolls to the suppressed panel*

A hundred and seventeen of these never reach the model. A benign pattern a library logs at ERROR. A
nightly maintenance window. A probe flapping. Each says why, in writing — so suppression is
auditable, not magic.

---

### 4 · 0:38 → 1:03 · *opens the payments-gateway incident, scrolls evidence and the agent table*

One real incident. Five alerts, one payments outage. This is everything the model was shown and
nothing else — every item hashed. Four agents in sequence: triage, diagnosis, remediation, and a
reviewer whose only job is to disagree.

---

### 5 · 1:03 → 1:37 · *scrolls to the reviewer verdict and the gate — THE SHOT*

Now the part I did not plan.

The reviewer said *confirmed*, and supplied a quote to justify it — which is not in the evidence.
The model fabricated its own citation.

Code checked that quote against the source, did not find it, and says so here: the quote it offered
is **not** in the source evidence. Verdict downgraded to a dissent, action held for a human.

That is the design working against a real model, not a claim about one.

---

### 6 · 1:37 → 2:01 · *`cmd+2` — AWS console, live Bedrock call*

This is the account it runs in. Region us-east-2, Amazon Bedrock, Nova Pro — a live call going out
and coming back. No static credentials anywhere; it signs with the task role.

---

### 7 · 2:01 → 2:18 · *same screen, the line below*

And the console you just saw regenerates from the saved run data — byte for byte, no model call.
Every number on it is reproducible from an artefact, not retyped.

---

### 8 · 2:18 → 2:34 · *`cmd+1`, click the acme-retail tab — show the red number*

Same binary, different customer. And this one is not clean. One unattended action on an incident
our own labels call noise. It opened a ticket — it changed nothing — but we count it against
ourselves, and the dashboard says so without being asked.

---

### 9 · 2:34 → 2:45 · *click northwind-msp, scroll to top*

Traffic is synthetic and seeded, so every number reproduces. Execution is dry-run by default. The
limits are in the README, written before you asked.

---

## Before you hit record

- `./scripts/video-reset.sh` until it says **Ready to record**
- Full-screen Chrome, bookmarks hidden (`cmd+shift+B`), Do Not Disturb on
- **Close every other tab** — titles are legible at 1080p and some are personal
- Leave the **CloudShell tab open**; beat 6 needs it
- If Claude is driving, Chrome shows a *"Claude is debugging this browser"* banner. Either cancel it
  and click through yourself, or crop everything above the page header in the edit — the AWS
  account sits inside the page header, so the crop keeps what the rules require

## Why beats 5 and 8 are the submission

Criterion 3 scores outcomes *"based on what's demonstrated"*. Beat 5 shows a real model fabricating
a citation and being caught by code. Beat 8 volunteers a number that counts against us, before a
judge can find it by clicking. Most entries will assert their guardrails work.
