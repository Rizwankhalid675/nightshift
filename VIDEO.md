# Demo video — NightShift

Two of the four judging criteria are scored partly off this video. Criterion 3 says
**"based on what's demonstrated"** — a number that is only in the README does not count for it.
Criterion 2 asks whether the system can be **"reproduced across different partner and customer
environments"**, which is why the tenant switch gets its own ten seconds.

**Cap: 3:00. Target 2:45.** Judges are not required to watch past the cap.

---

## The one thing this video must land

The reviewer agent said *"confirmed"*, supplied a quote to justify it, and the quote was not in the
evidence. Deterministic code caught the fabricated citation and blocked the unattended path.

Everyone else's video will *claim* their guardrails work. This one shows a real model failing and
being caught, with the run output on screen. Lead the back half with it, and do not bury it.

---

## Rules check

- [ ] Under 3:00
- [ ] Uploaded and **public** on YouTube — unlisted usually fails the rule
- [ ] Link in the README **and** on the Devpost submission form
- [ ] Shows the project actually functioning
- [ ] No copyrighted music, no third-party trademarks
- [ ] In English, or subtitled

---

## What exists to film, and where

| Shot | Where | Shows |
|---|---|---|
| Dashboard, six headline tiles | https://webrizz.dev/nightshift/ | 203 / 21 / 12 / 94.1% / 0 / 0 |
| "Suppressed by the deterministic layer — never shown to the model" | same page, lower panel | per-incident reason text |
| Incident detail | click any incident | evidence with sha256 per item, agent handoff table, gate reasons, receipt |
| Tenant tabs | header: `northwind-msp` / `acme-retail` | same code, different rule pack |
| **The dissent** | https://webrizz.dev/nightshift/incident-northwind-msp-inc_9cf104a9917a538c.html | `verdict=dissent · quoteVerified=false` and the gate reason |
| **Both datasets** | the GitHub README, "Measured against live Bedrock" | 94.1% / 87.1%, zeros on both |

Everything above is a browser tab. **Nothing in the recording needs the AWS console**, so there is
no account id to crop and no terminal to tidy.

**The hosted console is now live model output.** Its footer reads
`bedrock:us.amazon.nova-pro-v1:0 (4 agents) · run 72a81c1b`, the diagnoses are Nova's own prose,
and the dissent reasons are on the incident pages. You can narrate it as live, because it is.

Two honest details to keep straight. The hosted pages are a **static snapshot** of a real Bedrock
run, not inference on page load — say "this run" rather than "watch it call Bedrock now". And the
hosted snapshot is a *different* run from the two in the README table (`72a81c1b`, not `537d1b89`),
which is why it shows 1 auto-remediation where the README shows 3. Same model, same temperature 0,
different run. If a judge asks, that variation is the honest answer and it is in the README.

---

## The script

The words live in **[`docs/video-teleprompter.md`](docs/video-teleprompter.md)** — eight beats,
~410 words, 2:45, with a cue on each beat saying what the browser is doing while you talk. Open it
on a phone or second screen and read it. Do not improvise; improvising always runs long.

Beat map, for reference:

| Beat | Time | Shot |
|---|---|---|
| 1 | 0:00–0:12 | dashboard, the 203 / 12 numbers |
| 2 | 0:12–0:22 | what it is, in one sentence |
| 3 | 0:22–0:42 | the suppressed panel and its reasons |
| 4 | 0:42–1:12 | one incident: evidence, hashes, four agents |
| 5 | **1:12–1:50** | **the fabricated citation, caught** |
| 6 | 1:50–2:12 | README: both datasets, zeros |
| 7 | 2:12–2:28 | the second tenant |
| 8 | 2:28–2:45 | limits, and the live URL |

## Recording rules that save the take

- The hosted pages are static, so there is nothing to reset and nothing that can fail mid-take.
- Hide notifications and bookmarks (`cmd+shift+B`), close other tabs — tab titles are readable.
- Claude can drive the browser through the whole path on a timer while you read, so you are not
  clicking and narrating at the same time. Start recording, then tell Claude to go.
- Full screen, 1080p, UI at ~125%. Judges watch on laptops, sometimes a phone.
- Never narrate a spinner. If a step is slow, cut.
- Say the headline number out loud inside the first fifteen seconds. Most entries bury it.
- Three takes. The third is the good one.

## Fallback

If live capture keeps breaking, record the happy path once and narrate over it. A smooth recorded
run beats a stuttering live one — the rule asks for footage of the project *functioning*, not a
live stream.
