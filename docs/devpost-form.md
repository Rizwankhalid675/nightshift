# Devpost form — every field, ready to paste

Nothing here is submitted. This is the text to paste once eligibility is settled.
Rules read from https://aws-agentic-msp.devpost.com/rules on 18 Nov 2026.

---

## Registration fields

| Field | Value |
|---|---|
| Devpost account email | may be any address — the rules say it need not match the corporate one |
| **Corporate email on the APN domain** | **you must supply this — see docs/SUBMISSION.md** |
| **AWS Partner organization name** | **you must supply this** |

---

## Project name

NightShift

## Elevator pitch (one line)

Agentic on-call triage for MSPs: the model proposes, deterministic code decides, and nothing
executes without a receipt.

## Track

**Track 1 — Run Your MSP Better.** Automated triage and multi-agent incident response.

## AWS AI service used

**Amazon Bedrock**, through the Converse API, called at runtime in `src/agent/bedrock.js`.
Four agents per incident: triage, diagnosis, remediation, and an adversarial reviewer.
Requests are signed with SigV4 implemented in `node:crypto`; credentials come from the
container credential chain (a CloudShell task role), with no static keys anywhere in the path.

## Links

| | |
|---|---|
| Publicly hosted project | https://webrizz.dev/nightshift/ |
| Code repository (private) | https://github.com/Rizwankhalid675/nightshift |
| Demo video | **paste the YouTube URL once uploaded, public** |
| Architecture diagram | `docs/img/architecture.svg` (PNG at 2960px beside it) |
| HLD document | `docs/HLD.md` |

**Before submitting, share the repository with `testing@devpost.com` and `aws-msp@amazon.com`.**

---

## Description

An MSP network operations centre does not have a detection problem. It has a volume problem.
Three days of one tenant's traffic here is 203 alerts, of which 12 are incidents a human should
see. The rest are duplicates, known-benign patterns third-party libraries log at ERROR,
maintenance windows, and flapping probes. The failure mode is not that the signal is missed in
the noise — it is that on-call stops reading, and then misses it entirely.

The obvious fix is to ask a language model what to do and then do it. That is unacceptable when
an MSP holds production credentials for other companies. NightShift is built the other way round:

**The model proposes. Deterministic code decides. Nothing executes without a receipt.**

Three layers, each with a different trust level. Correlation is deterministic and fully trusted:
it decides what deserves attention at all, and closes 117 of those 203 alerts with a written
reason for each. The agents are Amazon Bedrock and are untrusted: they decide what is wrong and
what to do about it, and are load-bearing — delete them and there is no diagnosis — but they are
never the authority. The policy gate and executor are deterministic and fully trusted: eleven
rules decide whether a robot may act, and the executor re-derives permission from the tenant's
rule pack and ignores the verdict it was handed, so a forged verdict cannot cause an action.

**What the demo shows that most entries cannot.** On a live Bedrock run the adversarial reviewer
returned "confirm" and supplied a quote to justify it — a quote that is not in the evidence. The
model fabricated its own citation. `quoteIsReal()` checked it against source evidence only (never
another agent's output, because quoting a diagnosis back is not corroboration), did not find it,
downgraded the verdict to a dissent, and the action was held for a human. That is in the video,
on the live console, and in the committed run artefact. It is the design working against a real
model, not a claim about one.

**And a number that counts against us.** The second tenant, acme-retail, reports 1 false
auto-action: an unattended ticket opened on an incident our own ground truth labels noise. It
changed no infrastructure. It is on the dashboard, in the docs, and in the video. It was never
narrowed away — narrowing a safety metric to exclude the case that triggered it is tuning the
measurement to the result.

**Measured, on two tenants, from committed artefacts:**

| | northwind-msp | acme-retail |
|---|---|---|
| alerts ingested | 203 | 203 |
| paged to a human | 12 | 18 |
| noise removed | 94.1% | 91.1% |
| false auto-actions | 0 | 1 (disclosed) |
| real incidents missed | 0 | 0 |

Multi-tenancy is not a feature bolted on: a tenant *is* a rule pack, two ship, and they behave
differently on identical traffic. Onboarding a customer is authoring a rule pack, not changing
code. The console regenerates from saved run data byte for byte with no model call, so every
figure on it is reproducible from an artefact rather than retyped.

Zero runtime dependencies — no npm install — and 125 tests, including regression tests for
incorrect auto-actions, missed incidents, reviewer quote verification and tenant-specific rules.

## Built with

Node.js (ESM, `node:test`, `node:crypto`), Amazon Bedrock Converse API, AWS SigV4 signed by hand,
AWS Systems Manager (composed and signed in dry-run), AWS CloudShell.

## How it was built / significant update

Built new during the submission period. The four live-AWS defects found and fixed along the way
are listed in `NEXT-STEPS.md`: SigV4 signed a singly-encoded path where AWS requires double
encoding; temporary credentials were captured once and expired mid-run; `--set=holdout` was
silently ignored so a run measured the training set and labelled itself `train`; and the report
printed an impossible ratio from mismatched populations.

## Honest limits (also in the README)

Traffic is synthetic and seeded. Ground-truth labels come from the same generator that produces
the traffic — the main limitation on every accuracy number here. The live model was Amazon Nova
Pro because Anthropic models are not enabled on the available account. Systems Manager has never
been exercised live, only composed and signed in dry-run. The live figures are one run per
dataset, which at temperature 0 still varies run to run.
