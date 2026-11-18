# Metrics — definitions and how each one is computed

Every number on the dashboard, in the README and in the exported report comes from one place:
`runEval()` in [`src/eval/run.js`](../src/eval/run.js). Nothing is typed by hand anywhere.

Reproduce any of them:

```bash
npm run eval                                   # northwind-msp, training set, offline provider
node src/eval/run.js --tenant acme-retail      # the other tenant
node src/eval/run.js --set holdout             # the held-out set
AGENT_PROVIDER=bedrock AWS_REGION=us-east-2 npm run eval   # against live Bedrock
```

The run writes a complete artefact to `runs/<tenant>-<provider>-<mode>-<runId>.json`, and
`src/export.js --save-runs <dir>` writes the same structure next to a rendered site. A rendered
site regenerates from it byte for byte with `--from <dir>` and no model call.

---

## Ground truth

Every generated alert carries `_truth.label` — `actionable` or `noise` — assigned by the scenario
that produced it in [`src/synth/generate.js`](../src/synth/generate.js). `stripTruth()` removes it
before anything in the pipeline sees an alert; the labels are re-joined only when scoring. An
incident's truth is `actionable` if any alert in it is labelled actionable.

**This is the main limitation of every accuracy number here:** the labels come from the same
generator that produces the traffic. See the README's Honest limits.

---

## The six dashboard tiles

| Tile | Field | Computed as | Source |
|---|---|---|---|
| **alerts ingested** | `alertsIn` | `alerts.length` — every alert fed in, before anything is filtered | run.js |
| **incidents after correlation** | `incidentsOut` | `incidents.length` — alerts grouped by normalised signature inside the tenant's correlation window | run.js |
| **paged to a human** | `actionable` | count of incidents whose class is `actionable`; the rest are suppressed with a written reason | run.js |
| **noise removed** | — | `(1 − actionable / alertsIn) × 100`, one decimal | [`server.js:192`](../src/server.js) |
| **false auto-actions** | `falseAutoRemediations` | results where `truth === "noise"` **and** `verdict.decision === "auto_remediate"` | run.js |
| **real incidents missed** | `missedActionable` | suppressed incidents whose ground truth is `actionable` | run.js |

### On "noise removed"

It is a ratio of **pages to raw alerts**, not of incidents to alerts. 203 alerts becoming 12 pages
is 94.1%. It deliberately counts correlation *and* suppression together, because both are reasons
on-call does not get woken. The per-incident breakdown is in the suppressed panel beneath it.

### On "false auto-actions"

The definition is broad on purpose: **any** unattended decision on an incident ground truth calls
noise, including `open-ticket`, which the rule pack itself defines as "take no action". It was not
narrowed after it fired on `acme-retail`; narrowing a safety metric to exclude the case that
triggered it is tuning the measurement to the result.

What must never happen is separate and stronger, and is asserted in
[`tests/safety.test.js`](../tests/safety.test.js): an unattended action on noise must never touch
infrastructure. Every such action must resolve to a remediation whose `executor.type` is `none`,
and must not reach a terminal execution status other than `no_action` or `refused`.

---

## The rest of the run record

| Field | Meaning |
|---|---|
| `runId` | 8 hex chars, fresh per run; printed in the dashboard footer so a screenshot is traceable to an artefact |
| `tenantId`, `label` | which rule pack and provider produced this |
| `noiseSuppressed` | incidents the deterministic layer closed, by class: `known_benign`, `suppressed_window`, `flapping`, `duplicate` |
| `autoRemediated` | verdict `auto_remediate` |
| `needsApproval` | verdict `needs_approval` |
| `reviewerDissents` | reviews where the adversarial reviewer refused to confirm |
| `degradedRuns` | incidents where a specialist failed and the pipeline fell back to the single agent. A degraded run can never auto-remediate |
| `medianTimeToProposalMs` | median wall-clock from incident to proposal, including model latency. Offline runs are ~0 ms; live Bedrock runs are ~9,000 ms |
| `executed` | executions that actually touched something: not `refused`, not `no_action` |
| `executionRefused` | blocked by the executor's independent re-authorisation, which re-derives permission from the rule pack and ignores the verdict it was handed |
| `verifiedResolved` | of `executed`, those where the alert did not recur in the window. **Same population as `executed`** — counting it over every result once produced "4/3", a ratio that cannot exist |
| `executorMode` | `dry-run` (default) or `live` |
| `agentMode` | `multi` (four specialists) or `single` |
| `injectedFault` | `none`, or the fault injected to test the reviewer |
| `dataset` | `train` or `holdout` |
| `model` | the exact model string, e.g. `bedrock:us.amazon.nova-pro-v1:0 (4 agents)` |

---

## Release gates

`npm run eval` exits non-zero if `falseAutoRemediations > 0` or `missedActionable > 0`, so a
regression in the safety layer fails a build like a broken test. CI runs it for both tenants, both
agent modes and the held-out set, on Node 20 and 22.

`node src/eval/compare.js --assert` fails the build if the reviewer stops catching injected faults.

**Note on the gate and acme-retail:** the gate is evaluated per tenant. `acme-retail` reports
`falseAutoRemediations: 1` on live runs, for the reason documented in its rule pack `notes` field
and in the README. The CI gate runs the offline provider, where that tenant scores 0; the live
figure is disclosed rather than gated, because gating on a live model's run-to-run variation would
make the build non-deterministic.

---

## What is measured against live AWS, and what is not

| | |
|---|---|
| Bedrock Converse | **run live**, both tenants, both datasets |
| SigV4 signing | **run live** |
| Credential chain | **run live** on a CloudShell task role, no static keys |
| Systems Manager | **never run live** — composed, signed and polled in `dry-run` only |

So `executed`, `executionRefused` and `verifiedResolved` describe dry-run behaviour. The run record
contains the exact API call that would have been sent.
