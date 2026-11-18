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
| **The dissent, live** | https://webrizz.dev/nightshift/ → any incident held for approval | `verdict=dissent · quoteVerified=false` and the gate reason |
| **Live Bedrock run** (optional) | AWS CloudShell: `cd ~/ns && AWS_REGION=us-east-2 AGENT_PROVIDER=bedrock node src/eval/run.js` | the run producing those numbers |

**The hosted console is now live model output.** Its footer reads
`bedrock:us.amazon.nova-pro-v1:0 (4 agents) · run 72a81c1b`, the diagnoses are Nova's own prose,
and the dissent reasons are on the incident pages. You can narrate it as live, because it is.

Two honest details to keep straight. The hosted pages are a **static snapshot** of a real Bedrock
run, not inference on page load — say "this run" rather than "watch it call Bedrock now". And the
hosted snapshot is a *different* run from the two in the README table (`72a81c1b`, not `537d1b89`),
which is why it shows 1 auto-remediation where the README shows 3. Same model, same temperature 0,
different run. If a judge asks, that variation is the honest answer and it is in the README.

---

## The script — say it word for word

Roughly 410 words at a normal pace. Read it; improvising always runs long.

| Time | Say (verbatim) | Show |
|---|---|---|
| **0:00–0:12** | "This is three days of alerts from a managed service provider's NOC. Two hundred and three of them. Twelve actually mattered. On-call stopped reading these weeks ago — and that is how real outages get missed." | alert flood scrolling, fast |
| **0:12–0:22** | "NightShift. Rules decide what deserves attention. Amazon Bedrock decides what is wrong and what to do. And deterministic code decides whether a robot is allowed to touch anything." | dashboard, six tiles |
| **0:22–0:42** | "A hundred and seventeen of these alerts never reach the model at all. Seventy-one are a benign pattern the sync library logs at ERROR. Sixteen fall inside a nightly maintenance window. Thirty are one probe flapping. Every one of them says why, in writing — so suppression is auditable instead of magic." | suppressed panel, scroll the reasons |
| **0:42–1:15** | "Here is one real incident. Four alerts, one payments outage. This is everything the model was shown — and nothing else. Every item is hashed. Four agents run in sequence: triage, diagnosis, remediation, and a reviewer whose only job is to disagree. The reviewer must quote the evidence to confirm anything. Then the gate holds it anyway: this tenant never opted restart-service into unattended execution, and the incident is customer-facing. Every decision leaves a receipt that re-verifies on load." | incident page — scroll evidence → handoff table → gate reasons → receipt |
| **1:15–1:55** | "Now the part I did not plan. Everything you are looking at came from Amazon Nova on Bedrock — the footer names the model and the run. Open the payments outage and look at why it was held back. The reviewer said *confirmed* — and supplied a quote that was not in the evidence. The model fabricated its own citation. Code checked that quote against the source, found it missing, and downgraded the verdict to a dissent, which costs the unattended path at the gate. That is the entire design working against a real model, not a claim about one." | incident page: `verdict=dissent · quoteVerified=false`, then the gate reason `reviewer confirmed but its supporting quote is not present in the evidence`; footer model line |
| **1:55–2:15** | "Measured, live, on two datasets. Ninety-four per cent of volume gone on the training set. Eighty-seven on a held-out set with services and failures no rule was written for. Zero wrong actions taken unattended. Zero real incidents missed. And on the unfamiliar data it automated less, not more — eleven per cent against twenty-five." | terminal: both summary blocks side by side |
| **2:15–2:28** | "Same binary, different customer. A second tenant with its own rule pack, its own maintenance windows, its own idea of what a robot may do unsupervised. Nothing here is hardcoded to one environment." | click the `acme-retail` tab |
| **2:28–2:45** | "The traffic is synthetic and seeded, so you can reproduce every number. Execution is dry-run by default. The limits are in the README, written before you asked. It is public, it is hosted, and it runs on your laptop with nothing but node." | README limits section, then the live URL on screen |

---

## Recording rules that save the take

- **Record the live Bedrock run first** and keep the raw file. It takes about two minutes end to
  end — cut the waiting, keep the result. If the account loses Bedrock access later, that footage
  is the only proof you have.
- Reset to seed state before each take: `./scripts/demo-reset.sh`.
- Hide notifications, bookmarks, extensions and anything personal. The AWS console shows an account
  name and an account ID — **crop or blur the top bar** in the CloudShell shot.
- Full screen, 1080p, UI at ~125%. Judges watch on laptops, sometimes a phone.
- Never narrate a spinner. If a step is slow, cut.
- Say the headline number out loud inside the first fifteen seconds. Most entries bury it.
- Three takes. The third is the good one.

## Fallback

If live capture keeps breaking, record the happy path once and narrate over it. A smooth recorded
run beats a stuttering live one — the rule asks for footage of the project *functioning*, not a
live stream.
