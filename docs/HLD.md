# NightShift — High Level Design

Agentic on-call triage for managed service providers.
Document owner: Rizwan Khalid · Version 1.0 · 18 November 2026

This is the production design document required by the hackathon's Project Requirements. It
describes what exists today, what is deliberately not built yet, and what changes between the demo
deployment and a real MSP rollout.

---

## 1. Problem

An MSP NOC receives alerts from every monitoring system across every customer. Volume is the
problem, not detection. In the benchmark here, three days of one tenant's traffic is 203 alerts, of
which 12 are incidents a human should see. The rest are duplicates of each other, known-benign
patterns logged at ERROR by third-party libraries, maintenance windows, and flapping probes.

The failure mode is not that the NOC misses the signal in the noise. It is that on-call stops
reading, and then misses the signal entirely.

Existing tooling addresses this with static suppression rules that nobody maintains, or with
"AI incident response" that asks a language model to decide what to do and then does it. The first
decays. The second is unacceptable in an environment where an MSP holds production credentials for
other companies.

## 2. Design position

**The model proposes. Deterministic code decides. Nothing executes without a receipt.**

Three layers, in order, each with a different trust level:

| Layer | Trust | Responsibility |
|---|---|---|
| Correlation | Deterministic, fully trusted | What deserves attention at all |
| Agents (Bedrock) | Untrusted, graded | What is wrong, and what to do about it |
| Policy gate + executor | Deterministic, fully trusted | Whether a robot may act, and proof it did |

The model is load-bearing — delete it and there is no diagnosis and no proposal — but it is never
the authority. Every model output is bounded by code that can refuse it, and every refusal states a
reason drawn from the tenant's own rule pack.

## 3. System context

```
 Monitoring sources            NightShift                       AWS
 ─────────────────             ──────────────                   ───────────────
 CloudWatch alarms  ─┐                                      ┌─ Amazon Bedrock
 Datadog / Zabbix   ─┼─ ingest ─► correlate ─► agents ──────┤   (Converse API)
 Synthetic probes   ─┤              │            │          │
 Ticketing webhooks ─┘              │            ▼          │
                                    │        policy gate    │
                                    │            │          │
                                    │            ▼          └─ AWS Systems Manager
                                    │        executor ─────────  SendCommand
                                    │            │                StartAutomationExecution
                                    ▼            ▼
                                 console     receipts (sha256 chain)
```

Today the ingest side is a seeded synthetic generator (`src/synth/generate.js`) producing
CloudWatch-shaped alerts. The `Alert` contract is the integration boundary; a real deployment
replaces the generator with collectors and changes nothing downstream.

## 4. Components

| Component | File | Responsibility |
|---|---|---|
| Contracts | `contracts.js` | Every type and API shape. Frozen; changed only by the integrator. |
| Correlator | `src/correlate.js` | Signature normalisation, windowing, flap detection, benign-pattern and maintenance-window suppression |
| Agents | `src/agent/` | Four Bedrock specialists: triage, diagnosis, remediation, adversarial reviewer |
| Bedrock client | `src/agent/bedrock.js` | Converse API, one request shape for every model family |
| Signer | `src/aws/sigv4.js` | SigV4 in `node:crypto`; credential chain with refresh |
| Policy gate | `src/policy.js` | Eleven rules deciding auto / hold / reject |
| Executor | `src/execute/` | Systems Manager, independent re-authorisation, idempotency, verification |
| Receipts | `src/receipts.js` | sha256 evidence digests and a tamper-evident decision chain |
| Console | `src/server.js` | Operator UI and approval surface |
| Evaluation | `src/eval/` | Benchmark, fault injection, held-out set, impact model |

### 4.1 Correlation

Alerts are normalised to a *signature* with variable parts removed — counts, timestamps, attempt
numbers — and state verbs collapsed, so `failed` and `recovered` share a signature and a flapping
probe stays one incident rather than ten. Alerts sharing a signature inside the tenant's correlation
window become one incident. Tenant isolation is enforced here: an alert is never correlated into
another tenant's incident.

Suppression classes are `known_benign`, `suppressed_window`, `flapping`, `duplicate`. Every
suppressed incident carries a written reason, shown in the console. Suppression never silently
discards: the evaluation asserts that no incident labelled actionable in ground truth was
suppressed, and the gate fails the build if that number moves.

### 4.2 Agents

Four narrow agents, in the shape of the Strands "agents as tools" pattern, each handing a case file
to the next. The SDK is not imported — the project is dependency-free by design — and the README
says so plainly.

The reviewer is the reason there are four rather than one. An agent that proposes and justifies its
own proposal will justify anything. A separate agent whose only job is to disagree, which cannot see
the first agent's confidence, catches cases where the diagnosis and the action have come apart. It
must quote the evidence to confirm anything, and `quoteIsReal()` checks that quote against **source**
evidence only — alerts, runbook, metrics — never another agent's output, because quoting a diagnosis
back is not corroboration.

This is not theoretical. On a live Bedrock run the reviewer returned "confirm" with a quote that was
not in the evidence; the check caught the fabricated citation and downgraded the verdict to a
dissent, which costs the unattended path at the gate.

### 4.3 Policy gate

Eleven rules, each phrased as something an MSP would be asked in a post-incident review. Rejections:
citations that do not match the evidence shown, a remediation absent from the tenant's rule pack, a
non-actionable incident, a reviewer flag of `unsafe`. Holds: reviewer dissent, irreversible action,
high blast radius, action not opted into unattended execution by this tenant, hourly rate limit
reached, model confidence below the floor (0.75), critical severity.

The gate derives its decision from the rule pack and the incident, never from the model's own
assessment of its authority.

### 4.4 Execution

Approved remediations reach AWS Systems Manager — `SendCommand` for documents,
`StartAutomationExecution` for runbooks — polled to a terminal state, because "sent" is not "worked".
The executor **re-derives permission from the rule pack and ignores the verdict it was handed**, so a
forged or mutated verdict cannot cause an action. An idempotency ledger prevents duplicate execution
for the same incident and action. Post-execution verification checks whether the alert recurred, and
is labelled observational rather than causal when nothing was executed.

Default mode is `dry-run`, which composes and signs the exact call without sending it. Live
execution requires `EXECUTOR_MODE=live`, credentials, and a tenant opt-in — three independent
conditions.

### 4.5 Evidence and receipts

Every item the model is shown is hashed. A receipt binds the input digest, the actor, the action and
the timestamp, and re-verifies on load; altering evidence after the fact breaks verification, as does
reordering or substituting it. The console shows the evidence bundle, the agent handoff, the gate's
reasons and the receipt on one page.

## 5. Multi-tenancy

A tenant is a rule pack: `data/tenants/<id>.json`, carrying correlation window, flap threshold,
benign patterns, maintenance windows, and the remediation catalogue with `reversible`,
`blastRadius`, `autoApprove` and `maxPerHour` per action. Two tenants ship and behave differently on
identical traffic.

Nothing in the code is specific to an environment. Onboarding a customer is authoring a rule pack,
not changing code — which is the reproducibility the Design criterion asks about.

## 6. Deployment

| Concern | Demo today | Production |
|---|---|---|
| Compute | Static export on a CDN; console runs on Node ≥20 | ECS Fargate or Lambda behind an ALB |
| Credentials | Container credential chain — task role, no static keys | Same; IAM role per environment |
| Model | `us.amazon.nova-pro-v1:0` (inference profile), `BEDROCK_MODEL_ID` to change | Same; model choice per tenant if needed |
| State | In-process ledger + durable approvals on disk | DynamoDB behind the same interface (`src/execute/index.js`) |
| Ingest | Seeded synthetic generator | EventBridge from CloudWatch, vendor webhooks |
| Execution | `dry-run` | `live` with per-tenant opt-in and tagged-instance scoping |
| Config | Rule pack JSON in repo | Versioned per tenant, reviewed like code |

Horizontal scaling is straightforward because nothing is held between incidents except the
idempotency ledger; point that at DynamoDB and the console scales out.

IAM: `bedrock:InvokeModel` for Converse, plus the four SSM actions. A tightened policy scoping
Bedrock to Anthropic and Nova inference profiles and SSM to instances tagged `nightshift-managed` is
in [`iam-policy.json`](iam-policy.json).

## 7. Failure modes and behaviour

| Failure | Behaviour |
|---|---|
| A specialist agent fails | Degrade to the single-agent path, flagged `degraded`; a degraded run can never auto-remediate |
| Bedrock unavailable | Offline rules-based proposer; the published baseline runs with no credentials at all |
| Credentials expire mid-run | Resolved per request and refreshed before expiry from the container endpoint |
| Model returns non-JSON | Turn recorded as failed; pipeline degrades rather than guessing |
| Model fabricates a citation | Quote check fails, verdict downgraded to dissent, action held |
| Model proposes an unknown action | Gate rejects: not in this tenant's rule pack |
| Verdict tampered with | Executor re-derives permission from the rule pack and refuses |
| Same incident actioned twice | Idempotency ledger refuses the second |
| SSM call fails | Polled to terminal state; failure recorded, never reported as success |

## 8. Security

No customer, employer or production data in the repository; all traffic synthetic and seeded. No
static credentials anywhere in the deployed path. Execution is off by default and requires three
independent conditions. Evidence is tamper-evident. The console's approval action re-enters the
executor rather than merely recording a decision. Prompt content is bounded to the evidence bundle,
and model output is parsed into a closed set of remediation ids — a model cannot invent an action.

## 9. Known limits

Stated in full in the README's Honest limits section. The material ones: traffic is synthetic;
ground-truth labels come from the same generator that produces the traffic; the live model was
Amazon Nova Pro because Anthropic models are not enabled on the available account; Systems Manager
has not been exercised live; and the live figures are one run per dataset, which at temperature 0
still varies run to run.

## 10. Roadmap

Nearest first: a live Systems Manager execution against a tagged instance; a second,
independently-authored ground-truth set; DynamoDB for the ledger; EventBridge ingest; per-tenant
model selection; and a feedback loop where operator approvals and rejections tune the confidence
floor per remediation.
