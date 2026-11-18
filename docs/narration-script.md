# Narration script — for a voice service

23 lines, **376 words**, target **154 seconds** of speech (about
147 words a minute). `docs/narration-script.txt` next to this file is the
same text with nothing else in it, ready to paste.

## Direction

- **Calm and level.** This is an engineer showing you something that worked, not an advert. No
  rising inflection, no emphasis on every clause.
- **Unhurried.** ~147 wpm is slower than conversation. Let the full stops land.
- Lines 10 to 14 are the turn of the film — the model fabricates a citation and gets caught.
  Read them *plainer* than the rest, not bigger. The content is the drama.
- Line 19 to 21 admits a fault in our own system. Matter-of-fact, no apology.

## Pronunciation

| Written | Say |
|---|---|
| us-east-2 | "U-S-east-two" |
| NightShift | one word, even stress |
| MSP | "M-S-P" |
| 203 | "two hundred and three" |
| 117 | "a hundred and seventeen" |
| Bedrock | as in the AWS service, "BED-rock" |

## Leave a gap between lines

**Please put roughly half a second of silence between each of the 23 lines.** Each line is timed
to a caption on screen. With the gaps I can detect where every line starts and align the picture
to the voice exactly; without them I can only stretch the whole thing proportionally and the
later captions drift.

## The lines

| # | Target | Words | Line | Caption on screen |
|---|---|---|---|---|
| 1 | 0:03 | 20 | This is three days of alerts from one customer of a managed service provider. Two hundred and three of them. | Three days of alerts from one MSP tenant |
| 2 | 0:10 | 18 | Twelve actually mattered. On-call stopped reading these weeks ago — and that is how real outages get missed. | 203 ingested · 12 paged to a human |
| 3 | 0:16 | 19 | NightShift. Rules decide what deserves attention. Bedrock decides what is wrong. And code decides whether a robot may act. | The model proposes. Deterministic code decides. |
| 4 | 0:23 | 20 | A hundred and seventeen of these never reach the model at all. A benign pattern a library logs at error. | 117 alerts never reach the model |
| 5 | 0:30 | 20 | A nightly maintenance window. A probe flapping. Each one says why, in writing — so suppression is auditable, not magic. | Every suppression states its reason, in writing |
| 6 | 0:39 | 15 | One real incident. Five alerts, one payments outage. This is everything the model was shown. | Exactly what the model was shown — and nothing else |
| 7 | 0:44 | 16 | And nothing else. Every item is hashed, so the evidence cannot be altered after the fact. | Every item hashed |
| 8 | 0:50 | 16 | Four agents run in sequence. Triage, then diagnosis, then a proposed remediation, and finally a reviewer. | Four agents: triage, diagnosis, remediation, review |
| 9 | 0:56 | 14 | That reviewer cannot see the first agent's confidence. Its only job is to disagree. | The reviewer's only job is to disagree |
| 10 | 1:02 | 15 | Now the part we did not plan for. The reviewer came back and said: confirmed. | The reviewer said: confirmed |
| 11 | 1:07 | 12 | And it supplied a quote from the evidence to justify that verdict. | and supplied a quote to justify it |
| 12 | 1:14 | 14 | Code checked the quote against the source. It is not there. It never was. | That quote is not in the evidence |
| 13 | 1:20 | 12 | The model fabricated its own citation, and then offered it as proof. | The model fabricated its own citation |
| 14 | 1:27 | 19 | The check caught it. The verdict was downgraded to a dissent, and the action is held for a human. | Code caught it — the action is held for a human |
| 15 | 1:33 | 20 | This is the account it runs in. Region us-east-2, Amazon Bedrock — a live call going out and coming back. | Live Amazon Bedrock call · us-east-2 |
| 16 | 1:42 | 20 | There are no static credentials anywhere in this path. Every request is signed with the task role it runs under. | No static credentials — signed with the task role |
| 17 | 1:51 | 20 | The numbers are measured on both tenants, and read straight from committed run artefacts — not retyped onto a slide. | Measured on both tenants, from committed artefacts |
| 18 | 2:02 | 24 | And the console you just saw regenerates from that saved data, byte for byte, with no model call at all. Every figure is reproducible. | The console regenerates byte for byte — no model call |
| 19 | 2:12 | 15 | Same binary, a different customer, a different rule pack. And this one is not clean. | Same binary, different customer |
| 20 | 2:19 | 11 | One unattended action, on an incident our own labels call noise. | One unattended action on an incident labelled noise |
| 21 | 2:23 | 10 | It changed no infrastructure. We still count it against ourselves. | We count it against ourselves |
| 22 | 2:27 | 15 | Traffic is synthetic and seeded, so every number here reproduces. Execution is dry-run by default. | Synthetic seeded traffic · execution dry-run by default |
| 23 | 2:32 | 11 | The limits are written in the README — before anyone asked. | The limits are in the README |

Total 376 words. If the finished audio is longer or shorter than 154s, send it
anyway — the captions get retimed to the voice, not the other way round.
