# Teleprompter — read this, nothing else

Open on a phone or second screen. Claude drives; you read.
Nine beats, ~2:55 against a 3:00 cap. Pace ~150 words a minute. Finish a beat early → pause, don't improvise.

> **Rules note.** The official rules say the video *"must include footage that shows the internal
> accounts including all upstream/downstream environments."* That is why beat 6 is the AWS console
> and a live Bedrock call. **Do not crop or blur the account name or id** — showing it is the
> requirement. If you are not willing to put the account on YouTube, that is a decision to make
> before recording, not after.

---

### 1 · 0:00 → 0:12 · *cue: dashboard, top*

This is three days of alerts from a managed service provider's network operations centre. Two
hundred and three of them. Twelve actually mattered. On-call stopped reading these weeks ago — and
that is how real outages get missed.

---

### 2 · 0:12 → 0:22 · *cue: still on the dashboard*

NightShift. Rules decide what deserves attention. Amazon Bedrock decides what is wrong and what to
do. And deterministic code decides whether a robot is allowed to touch anything.

---

### 3 · 0:22 → 0:40 · *cue: scrolls to the suppressed panel*

A hundred and seventeen of these alerts never reach the model. A benign pattern the sync library
logs at ERROR. A nightly maintenance window. A probe flapping. Every one says why, in writing — so
suppression is auditable, not magic.

---

### 4 · 0:40 → 1:06 · *cue: opens the payments-gateway incident, scrolls the evidence and agent table*

One real incident. Five alerts, one payments outage. This is everything the model was shown and
nothing else — every item hashed. Four agents in sequence: triage, diagnosis, remediation, and a
reviewer whose only job is to disagree.

---

### 5 · 1:06 → 1:42 · *cue: scrolls to the reviewer verdict and the gate — THE SHOT*

Now the part I did not plan.

The reviewer said *confirmed*. And it supplied a quote to justify that — which is not in the
evidence. The model fabricated its own citation.

Code checked that quote against the source, did not find it, and says so right here: the quote it
offered is **not** in the source evidence. The verdict is downgraded to a dissent, and the action is
held for a human.

That is the whole design working against a real model, not a claim about one.

---

### 6 · 1:42 → 2:08 · *cue: switches to the AWS console, runs a live Bedrock call*

This is the account it runs in. Region us-east-2, Amazon Bedrock, Nova Pro — and that is a live
call going out right now and coming back. The console you just saw is a snapshot of exactly this,
run across both tenants. No static credentials anywhere: it signs with the task role.

---

### 7 · 2:08 → 2:26 · *cue: GitHub README, live results table*

Measured on two datasets. Ninety-four per cent of volume gone on the first. Eighty-seven on a
held-out set with services and failures no rule was written for. Zero wrong actions taken
unattended, zero real incidents missed — and on the unfamiliar data it automated less, not more.

---

### 8 · 2:26 → 2:42 · *cue: back to the console, clicks the acme-retail tab — show the red number*

Same binary, different customer. And this one is not clean. One unattended action on an incident
our own labels call noise. It opened a ticket — it changed nothing — but we count it against
ourselves, and the dashboard says so without being asked. That tenant simply has not configured the
suppression the first one has.

---

### 9 · 2:42 → 2:55 · *cue: back to the dashboard, settles on the hero numbers*

The traffic is synthetic and seeded, so every number reproduces. Execution is dry-run by default.
The limits are in the README, written before you asked. It is hosted, it runs on your laptop with
nothing but node, and the whole site regenerates from the saved run data.

---

## Before you hit record

**Drive it yourself.** While Claude controls the browser, Chrome pins a
`"Claude" started debugging this browser` banner across the top of every tab — and that banner
lands in the recording. Click **Cancel** on it before you record. Claude then loses browser
control, which is the point: you get a clean frame.

Both tabs are already staged, so you only need nine simple actions.

| Beat | What you do |
|---|---|
| 1–2 | Nothing. Dashboard, top of page. |
| 3 | Scroll down to **"Suppressed by the deterministic layer"** |
| 4 | Click the **payments-gateway** row marked *critical · 5 alerts collapsed* (the second payments-gateway row) |
| 5 | Scroll down slowly through the agent table → reviewer dissent → gate → receipt |
| 6 | Switch to the **CloudShell** tab (`cmd+2`). The live Bedrock response is already on screen |
| 7 | Same screen — the line below it reads *REGENERATED FROM SAVED RUN DATA — BYTE IDENTICAL* |
| 8 | Back to the NightShift tab (`cmd+1`), click the **acme-retail** tab in the page header |
| 9 | Click **northwind-msp**, scroll to top, hold on the six numbers |

Also: hide bookmarks (`cmd+shift+B`), Do Not Disturb on, close the other tabs — several titles are
readable and some are personal.

If the CloudShell terminal is ever blank when you get to beat 6, the session reset. Ask Claude to
restore it; it is two commands.

## What beat 8 buys you

Most entries will claim their guardrails work. This one shows a model fabricating a citation and
being caught (beat 5), then volunteers its own failing number and explains it (beat 8). Judges are
scoring "does the solution actually deliver those outcomes **based on what's demonstrated**".
Demonstrated includes the part that did not go perfectly.
