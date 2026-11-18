# Teleprompter — read this, nothing else

Open this on a phone or second screen. Claude drives the browser; you read.
Each block is one beat. The cue tells you what Claude is doing while you talk.

Pace: ~150 words a minute. If you finish a block early, pause — do not improvise.

---

### 1 · 0:00 → 0:12 · *cue: dashboard, top of page*

This is three days of alerts from a managed service provider's network operations
centre. Two hundred and three of them. Twelve actually mattered. On-call stopped
reading these weeks ago — and that is how real outages get missed.

---

### 2 · 0:12 → 0:22 · *cue: still on dashboard*

NightShift. Rules decide what deserves attention. Amazon Bedrock decides what is
wrong and what to do. And deterministic code decides whether a robot is allowed to
touch anything.

---

### 3 · 0:22 → 0:42 · *cue: scrolls to the suppressed panel*

A hundred and seventeen of these alerts never reach the model at all. Seventy-one
are a benign pattern the sync library logs at ERROR. Sixteen fall inside a nightly
maintenance window. Thirty are one probe flapping. Every one of them says why, in
writing — so suppression is auditable, not magic.

---

### 4 · 0:42 → 1:12 · *cue: opens the payments-gateway incident, scrolls through evidence and the agent table*

Here is one real incident. Four alerts, one payments outage. This is everything the
model was shown, and nothing else — every item hashed. Four agents run in sequence:
triage, diagnosis, remediation, and a reviewer whose only job is to disagree. The
reviewer has to quote the evidence to confirm anything.

---

### 5 · 1:12 → 1:50 · *cue: scrolls to the reviewer verdict and the gate — THE SHOT*

Now the part I did not plan. Everything here came from Amazon Nova on Bedrock — the
footer names the model and the run.

Look at the reviewer. It said *confirmed*. And it supplied a quote to justify that,
which was not in the evidence. The model fabricated its own citation.

Code checked the quote against the source, found it missing, and downgraded the
verdict to a dissent — which costs the unattended path at the gate. The action was
held for a human.

That is the whole design working against a real model, not a claim about one.

---

### 6 · 1:50 → 2:12 · *cue: switches to the GitHub README, live results table*

Measured on two datasets. Ninety-four per cent of volume gone on the first.
Eighty-seven on a held-out set with services and failures no rule was written for.
Zero wrong actions taken unattended. Zero real incidents missed. And on the
unfamiliar data it automated less, not more.

---

### 7 · 2:12 → 2:28 · *cue: back to the console, clicks the acme-retail tab*

Same binary, different customer. A second tenant with its own rule pack, its own
maintenance windows, its own idea of what a robot may do unsupervised. Nothing here
is hardcoded to one environment.

---

### 8 · 2:28 → 2:45 · *cue: back to the dashboard, settles on the hero numbers*

The traffic is synthetic and seeded, so every number reproduces. Execution is
dry-run by default. The limits are in the README, written before you asked. It is
public, it is hosted, and it runs on your laptop with nothing but node.

---

## Before you hit record

- Chrome on the NightShift tab, full screen. Close other tabs — the titles show.
- Hide bookmarks (`cmd+shift+B`), turn on Do Not Disturb.
- Nothing in this run touches the AWS console, so there is no account id on screen.
- Start recording, then type **go** to Claude. Claude waits 3 seconds, then drives
  the whole path on a timer. You just read.
- If you fluff a line, keep going — fix it in the edit, or run it again. Takes are cheap.
