# aws-msp-ai-hackathon

**{{ONE_LINE}}**

Built at AWS MSP AI Hackathon · 2026-11-17 · Tracks: {{TRACKS}}

**Live:** {{LIVE_URL}} · **Demo:** [90-second walkthrough](#the-90-second-demo) · **Limits:** [what doesn't work yet](#honest-limits)

![screenshot](docs/img/hero.png)

---

## How aws-msp-ai-hackathon meets the judging criteria

| Criterion | Points | How we meet it | Where to see it |
|---|---:|---|---|
| {{CRITERION_1}} | {{PTS_1}} | | §1 |
| {{CRITERION_2}} | {{PTS_2}} | | §2 |
| {{CRITERION_3}} | {{PTS_3}} | | §3 |
| {{CRITERION_4}} | {{PTS_4}} | | §4 |

> Replace every cell with a specific, checkable claim and a link to where the judge can verify it.
> If a cell says something vague like "great UX", you have lost those points already.

---

## 1. {{CRITERION_1}} ({{PTS_1}} pts)

### The problem, in numbers

| Number | What it means | Source |
|---|---|---|
| | | |

### Who it's for

### Before and after

| | Today | With aws-msp-ai-hackathon |
|---|---|---|
| | | |

---

## 2. {{CRITERION_2}} ({{PTS_2}} pts)

### Architecture

```mermaid
flowchart LR
  U[User] --> API[API]
  API --> E[Deterministic check]
  API --> L[LLM]
  L --> E
  E --> D[(Evidence store)]
```

### Results

_Measured, with provenance. No adjectives._

| Run | Metric | Value | How it was measured |
|---|---|---|---|
| | | | |

### The before/after progression

| Version | What changed | Result |
|---|---|---|
| v1 | | |
| v2 | | |
| v3 | | |

---

## 3. {{CRITERION_3}} ({{PTS_3}} pts)

---

## 4. {{CRITERION_4}} ({{PTS_4}} pts)

---

## Track requirements

- **{{TRACK_1}}:** how we satisfy it, and the file that proves it
- **{{TRACK_2}}:** how we satisfy it, and the file that proves it

## Sponsor tech, in detail

| Sponsor | What we use it for | Where in the code |
|---|---|---|
| | | |

---

## The 90-second demo

| Step | Do | Watch for |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |

## Run it

```bash
./scripts/demo-up.sh       # one command, everything up
./scripts/demo-status.sh   # health
./scripts/demo-reset.sh    # back to a pristine demo state
./scripts/demo-down.sh
```

## For AI agents

Start with [`AGENTS.md`](AGENTS.md).

| Need | Where |
|---|---|
| Contracts and shared types | `contracts.ts` |
| Entry point | |
| Deterministic checks | |
| Demo seed data | `demo/seed/` |

## Repo map

```
contracts.ts     frozen types and API shapes
src/             application code
demo/            seed data + runbook
scripts/         demo + preflight tooling
docs/            architecture, screenshots
```

---

## Honest limits

_Name your own weaknesses here, before a judge finds them. This section wins points._

- **What is simulated:**
- **Sample size:**
- **What we did not build:**
- **Where it would break in production:**

## Sources

