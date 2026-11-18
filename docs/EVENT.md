# AWS MSP AI Hackathon — the scorecard

Source: https://aws-agentic-msp.devpost.com/rules (read 2026-11-17).

| | |
|---|---|
| **Submission deadline** | **Thu Dec 11, 2026, 12:00 pm PT** |
| Judging | Jan 5 – Jan 22, 2027 |
| Winners announced | ~Jan 28, 2027 |
| Prize pool | $64,000 |
| Field at time of writing | 405 registrants |

---

## STAGE ONE — pass/fail, before anyone scores you

> "The first stage will determine via pass/fail whether the ideas meet a baseline level of
> viability, in that the Project reasonably fits the theme and reasonably applies the required
> APIs/SDKs featured in the Hackathon."

Two things must be unarguable in the README and the video:

- [ ] It fits the theme: **AI for MSP operations**
- [ ] It genuinely uses a **required AWS AI service** — Amazon Bedrock, AgentCore, Strands Agents,
      Amazon Quick, Kiro, or AWS Frontier Agents — as a *working, essential part*, not an add-on

**Design rule:** if you could delete Bedrock and the product still works, we fail stage one.
Our answer: the agent's diagnosis and remediation proposal *is* the Bedrock call. The deterministic
layer grades and gates it, but there is nothing to grade without the model.

---

## STAGE TWO — four criteria, 25% each

| # | Criterion | Verbatim ask | Our answer | Where |
|---|---|---|---|---|
| 1 | **Technological Implementation** (25%) | "How well is the solution built? How deeply does it use the required AWS AI services? Is the AWS service a working, essential part of the solution rather than a surface-level add-on? Does the project show technical depth and production readiness?" | Bedrock/Strands agent in the live path; deterministic correlation + policy gate around it; evidence receipts; eval harness; tests | §1 |
| 2 | **Design** (25%) | "Does the project deliver a complete product experience ready for production, not a proof of concept? Is it built to scale? **Can it be reproduced across different partner and customer environments?**" | Multi-tenant from the contracts up: per-tenant rule packs, no hardcoded environment; one console covering the whole on-call loop | §2 |
| 3 | **Potential Impact** (25%) | "Does the project make a credible case for solving a real MSP problem, backed by **measurable business outcomes**? Does the solution actually deliver those outcomes **based on what's demonstrated**?" | Measured alert→incident reduction and MTTA on a reproducible benchmark, shown running in the video | §3 |
| 4 | **Innovation/Idea** (25%) | "Is this a creative use of AWS AI services in MSP operations or customer delivery? Is the approach novel?" | The novelty is *where the model sits*: it proposes, deterministic code decides, and no action executes without a receipt | §4 |

Note criterion 3's "based on what's demonstrated" and criterion 2's "reproduced across different
partner and customer environments". Those two phrases decide half the score:
**the numbers must be shown running, and the system must not be hardcoded to one environment.**

---

## Hard requirements

- [ ] A **working, publicly hosted** solution (hosting is a requirement, not a nice-to-have)
- [ ] Uses at least one required AWS AI service
- [ ] Public repo with an open-source licence
- [ ] Demo video (check length cap on the submission form; assume 3:00)
- [ ] Must run consistently and function as depicted in the video
- [ ] New, or significantly updated during the submission period

## Tracks

**Track 1 — Run Your MSP Better.** "Show how AI improves your internal MSP operations with
measurable efficiency gains. Examples include automated triage and self-healing, multi-agent
incident response, and AI-driven FinOps."

**Track 2 — External: Deliver AI-Driven Outcomes for Customers.**

**We are entering Track 1.** The named example *is* the project: multi-agent incident response
with automated triage.

---

## Where entries will lose points here, and our counter

1. **"An LLM reads my logs" with no measurement.** Criterion 3 is 25% and asks for measurable
   outcomes demonstrated. Counter: a reproducible benchmark with a published baseline.
2. **Hardcoded to one company's stack.** Criterion 2 explicitly asks about reproducibility across
   environments. Counter: tenants and rule packs are first-class in the contracts; the demo ships
   two different synthetic tenants.
3. **Bedrock bolted on.** Stage one risk. Counter: the agent is the proposal engine, and the
   README says so in the first paragraph.
4. **Not actually hosted.** Counter: deploy early, not on Dec 10.

---

## Data policy for this repo

This repository is **public**. It contains **no** real customer, employer or production data.
Every alert, incident and log line in `data/` is **synthetically generated** by
`src/synth/generate.js` from published MSP failure patterns. The generator is seeded, so the
numbers in the README are reproducible by anyone who clones the repo.
