# AWS MSP AI Hackathon — the scorecard

Source: https://aws-agentic-msp.devpost.com/rules — **re-read in full 2026-11-18**.
An earlier version of this file was written from the overview page and was wrong on three
submission-critical points. They are marked **CORRECTED** below.

| | |
|---|---|
| Registration + Submission close | **Thu Dec 11, 2026, 12:00 pm PT** |
| Judging | Jan 5 – Jan 22, 2027 |
| Winners announced | ~Jan 28, 2027 (2:00 pm PT) |
| Track 1 prizes | $10,000 / $7,000 / $5,000 |
| Special prizes | $2,000 each — incl. **Best Amazon Bedrock Application** |
| Note | Top three in a track are **not** eligible for the special prizes. One prize per project. |

---

## ELIGIBILITY — read this before building anything else

> "Individuals who are at least the age of majority where they reside as of the time of entry, and
> who are **employed by or authorized to act on behalf of an organization that has registered with
> the AWS Partner Network (APN) and signed the APN Terms & Conditions**"

And at registration:

> "Entrants must provide the **corporate email address on the domain associated with your
> organization's APN registration**, along with your AWS Partner organization name."

**This is not an open public hackathon.** Entry requires an APN-registered organization and a
corporate email on that organization's domain. A personal Gmail address will not satisfy
registration. This gate is outside the code and has to be settled first.

---

## STAGE ONE — pass/fail

> "whether the ideas meet a baseline level of viability, in that the Project reasonably fits the
> theme and reasonably applies the required APIs/SDKs featured in the Hackathon."

Required AWS AI services (at least one): Amazon Bedrock, AgentCore, Strands Agents, Amazon Quick,
Kiro, AWS Frontier Agents. **Ours: Amazon Bedrock**, called at runtime through the Converse API.

---

## STAGE TWO — four criteria, 25% each

| # | Criterion | Verbatim ask | Our answer | Where |
|---|---|---|---|---|
| 1 | **Technological Implementation** | "How well is the solution built? How deeply does it use the required AWS AI services? Is the AWS service a working, essential part of the solution rather than a surface-level add-on? Does the project show technical depth and production readiness?" | Bedrock Converse in the live path, SigV4 signed from scratch; correlation, policy gate, receipts, eval harness, 92 tests | §1 |
| 2 | **Design** | "Does the project deliver a complete product experience ready for production, not a proof of concept? Is it built to scale? Can it be reproduced across different partner and customer environments?" | Multi-tenant from the contracts up; two tenants ship; no hardcoded environment; HLD doc | §2, [HLD](HLD.md) |
| 3 | **Potential Impact** | "backed by measurable business outcomes? Does the solution actually deliver those outcomes **based on what's demonstrated**?" | Live measured numbers on two datasets, shown running | §3 |
| 4 | **Innovation/Idea** | "creative use of AWS AI services... Is the approach novel, and does the project show a real understanding of the MSP problem space?" | The model proposes, deterministic code decides, nothing executes without a receipt | §4 |

Tie-break order is the order above, so **Technological Implementation breaks ties first.**

---

## Hard submission requirements

- [ ] Working, **publicly hosted** project — link required
- [ ] At least one required AWS AI service, **called at runtime in the code**, "imported and actually
      called ... not just named in the README"
- [ ] **CORRECTED — the repository must be PRIVATE**, on GitHub or GitLab, and **shared with
      `testing@devpost.com` and `aws-msp@amazon.com`**. The earlier note in this file said "public
      repo with an open-source licence". That was wrong and is the opposite of the rule.
- [ ] Identify the **Track** (ours: Track 1) and the **AWS AI Service** (Bedrock)
- [ ] Text description of features and functionality
- [ ] **Architecture Diagram**
- [ ] **CORRECTED — an HLD (High Level Design) Document.** Listed twice: under Project Requirements
      ("must be ready to be delivered in a production environment by providing a High level Design
      Doc") and again under Submission Requirements. See [HLD.md](HLD.md).
- [ ] Demo video:
      - about **three minutes**; judges need not watch beyond
      - shows the project **functioning on the device for which it was built**
      - **CORRECTED — "must include footage that shows the internal accounts including all
        upstream/downstream environments."** This is a *must*. The AWS console and the environments
        the solution touches belong **in** the video. An earlier revision of our script deliberately
        removed the AWS console to avoid showing an account id; that would have failed this rule.
      - **public on YouTube** (unlisted does not satisfy "publicly visible")
      - no third-party trademarks or copyrighted music
- [ ] New, or significantly updated during the submission period, and explain how
- [ ] English, or translated

## Also available

$200 in AWS promotional credits per AWS Partner AWS Account ID, by form, while supplies last;
credits expire Dec 31, 2026.

---

## Where entries lose points, and our counter

1. **An LLM reading logs with no measurement.** Criterion 3 asks for outcomes *demonstrated*.
   Counter: a reproducible benchmark, live numbers, shown on screen.
2. **Hardcoded to one company's stack.** Criterion 2 asks about reproducibility across environments.
   Counter: tenants and rule packs are first-class; two ship.
3. **Bedrock bolted on.** Stage-one risk. Counter: the proposal *is* the Bedrock call, and the repo
   shows it imported and invoked.
4. **Not actually hosted.** Counter: deployed, and the hosted console renders a real Bedrock run.
5. **Missing paperwork.** HLD and architecture diagram are explicit requirements that are easy to
   skip and cost a whole criterion.

---

## Data policy for this repo

No real customer, employer or production data. Every alert is generated by `src/synth/generate.js`
from published MSP failure patterns, seeded so the numbers reproduce.
