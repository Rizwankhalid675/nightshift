/**
 * roles.js — the specialists.
 *
 * Four narrow agents instead of one broad one, in the shape the Strands
 * "agents as tools" pattern describes: each has one job, one prompt, and hands
 * a case file to the next.
 *
 *   triage       what kind of failure is this, and who should own it
 *   diagnosis    what is actually wrong (prompt specialised per category)
 *   remediation  which action from THIS tenant's runbook, and why
 *   reviewer     adversarial: does the action follow from the evidence?
 *
 * Why four rather than one: the reviewer is the point. A single agent that
 * proposes and justifies its own proposal will justify anything. A separate
 * agent whose only job is to disagree, given the same evidence, catches the
 * cases where the diagnosis and the action have quietly come apart — and it
 * cannot see the first agent's confidence, so it cannot be anchored by it.
 *
 * Every role ships an offline implementation so the whole pipeline runs with
 * no AWS credentials, and so the published baseline is a real baseline.
 */

export const CATEGORIES = /** @type {const} */ ([
  "capacity",      // disk, memory, connections
  "availability",  // refused, unreachable, 5xx
  "performance",   // latency, saturation, timeouts
  "job_failure",   // batch, cron, sync
  "unknown",
]);

// --------------------------------------------------------------- prompts

const evidenceBlock = (ev) =>
  ev.map((e, i) => `--- [${i}] ${e.kind} from ${e.source} (digest ${e.digest})\n${e.observed}`).join("\n");

export const PROMPTS = {
  triage: (ev) => `You triage incidents for a managed service provider.

Read ONLY this evidence:
${evidenceBlock(ev)}

Reply with ONLY JSON:
{"category":"capacity|availability|performance|job_failure|unknown",
 "urgency":"low|medium|high",
 "summary":"<one sentence>",
 "citations":[<digest strings you used>]}`,

  diagnosis: (ev, triage) => `You are a ${triage.category} specialist for a managed service provider.

Triage says: ${triage.category}, urgency ${triage.urgency}. "${triage.summary}"

Read ONLY this evidence:
${evidenceBlock(ev)}

State what is wrong, not what to do about it. If the evidence does not support a
specific cause, say so plainly rather than guessing.

Reply with ONLY JSON:
{"rootCause":"<one sentence>",
 "confidence":<0..1>,
 "evidenceGaps":"<what you would need to be sure, or empty>",
 "citations":[<digest strings you used>]}`,

  remediation: (ev, triage, diag) => `You choose remediations for a managed service provider.

Diagnosis: "${diag.rootCause}" (confidence ${diag.confidence})
${diag.evidenceGaps ? `Known gaps: ${diag.evidenceGaps}` : ""}

Read ONLY this evidence, which includes the tenant's runbook:
${evidenceBlock(ev)}

Choose exactly one remediation id from the runbook. If nothing in the runbook
addresses this diagnosis, choose the ticket-opening action rather than the
closest-looking fix.

Reply with ONLY JSON:
{"remediationId":"<id from the runbook>",
 "params":{},
 "rationale":"<why this action follows from the diagnosis>",
 "confidence":<0..1>,
 "citations":[<digest strings you used>]}`,

  reviewer: (ev, diag, prop) => `You are reviewing another agent's work before it is allowed to change
production infrastructure. Assume it is wrong until the evidence shows otherwise.

Proposed diagnosis: "${diag.rootCause}"
Proposed action: "${prop.remediationId}" because "${prop.rationale}"

Read ONLY this evidence:
${evidenceBlock(ev)}

Answer two questions:
1. Does the diagnosis follow from the evidence?
2. Does the action address THAT diagnosis?

To confirm, you must quote the evidence verbatim. If you cannot quote evidence
that supports both, dissent. Dissenting is the safe answer; say so freely.

Reply with ONLY JSON:
{"verdict":"confirm|dissent",
 "reason":"<one sentence>",
 "quote":"<verbatim text copied from the evidence above, or empty if dissenting>",
 "unsafe":<true only if carrying out the action could make things worse>,
 "citations":[<digest strings you used>]}`,
};

// ------------------------------------------------- offline implementations

const text = (ev) => ev.map((e) => e.observed).join("\n").toLowerCase();
const all = (ev) => ev.map((e) => e.digest);

/**
 * Evidence the agents did NOT write. A reviewer that "verifies" a diagnosis by
 * quoting that same diagnosis back has verified nothing, so confirmations may
 * only be supported by source evidence: the alerts, the runbook, real metrics.
 */
export const SOURCE_KINDS = new Set(["alerts", "runbook", "metric", "prior_incident"]);
export const sourceEvidence = (ev) => ev.filter((e) => SOURCE_KINDS.has(e.kind));

/** Terms worth looking for in the raw alerts, per diagnosis category. */
const KEYWORDS = {
  capacity: ["disk usage", "/var/log", "volume", "memory", "connections"],
  availability: ["connection refused", "refused", "unreachable", "requests failing"],
  performance: ["latency", "p95", "timeout", "exceeds threshold"],
  job_failure: ["batch", "sync", "failed", "attempt"],
  unknown: [],
};

/** @returns {{category:string, urgency:string, summary:string, citations:string[]}} */
export function offlineTriage(incident, ev) {
  const t = text(ev);
  let category = "unknown";
  if (/disk usage|\/var\/log|memory|connections/.test(t)) category = "capacity";
  else if (/connection refused|unreachable|100% of requests|5\d\d/.test(t)) category = "availability";
  else if (/latency|p95|timeout|saturat/.test(t)) category = "performance";
  else if (/batch|sync|job|cron/.test(t)) category = "job_failure";

  const urgency = incident.severity === "critical" ? "high" : incident.severity === "error" ? "medium" : "low";
  return {
    category,
    urgency,
    summary: `${incident.service}: ${incident.alerts.length} alerts in one window, classified ${category}.`,
    citations: all(ev),
  };
}

export function offlineDiagnosis(incident, ev, triage) {
  const t = text(ev);
  const by = {
    capacity: `The log volume on ${incident.service} is filling and has crossed its threshold.`,
    availability: `${incident.service} is refusing connections; its upstream appears to be down.`,
    performance: `Latency on ${incident.service} is climbing toward the timeout ceiling.`,
    job_failure: `A scheduled batch on ${incident.service} is failing repeatedly and not self-recovering.`,
    unknown: `${incident.service} is alerting repeatedly, but the evidence does not identify a specific cause.`,
  };
  const confident = triage.category !== "unknown";
  return {
    rootCause: by[triage.category],
    confidence: confident ? (/disk usage/.test(t) ? 0.9 : 0.82) : 0.4,
    evidenceGaps: confident ? "" : "No metric or trace evidence, only alert text.",
    citations: all(ev),
  };
}

export function offlineRemediation(incident, pack, ev, triage, diag) {
  const has = (id) => pack.remediations.some((r) => r.id === id);
  const pick = (...ids) => ids.find(has) ?? pack.remediations[0].id;
  const byCategory = {
    capacity: pick("rotate-logs", "open-ticket"),
    availability: pick("restart-service", "open-ticket"),
    performance: pick("scale-out", "open-ticket"),
    job_failure: pick("rerun-failed-batch", "open-ticket"),
    unknown: pick("open-ticket"),
  };
  const remediationId = byCategory[triage.category];
  return {
    remediationId,
    params: {},
    rationale: `${triage.category} incidents on ${incident.service} are addressed by "${remediationId}" in this tenant's runbook.`,
    confidence: Math.min(diag.confidence, remediationId === "open-ticket" ? 0.6 : 0.88),
    citations: all(ev),
  };
}

/**
 * The offline reviewer genuinely disagrees. It is not a rubber stamp: it checks
 * that the action's category matches the diagnosis the evidence supports, and
 * it refuses to confirm anything it cannot quote.
 */
export function offlineReviewer(incident, ev, diag, prop, pack, triage) {
  const expectedFor = {
    "rotate-logs": /disk|log volume|capacity/i,
    "restart-service": /refus|unreachable|down|availability/i,
    "scale-out": /latency|saturat|timeout|performance/i,
    "rerun-failed-batch": /batch|sync|job|failing/i,
    "open-ticket": /.*/,
  };
  // Strip the service name before matching. Without this, a service called
  // "order-sync" makes every batch-shaped remediation look relevant to every
  // diagnosis about it — which is how a wrong action slips through.
  const causeText = diag.rootCause.replace(new RegExp(incident.service, "gi"), " ");
  const pattern = expectedFor[prop.remediationId];
  const matches = pattern ? pattern.test(causeText) : false;

  // Find a verbatim line that supports the diagnosis — from SOURCE evidence
  // only, never from what another agent wrote earlier in this same pipeline.
  const lines = sourceEvidence(ev)
    .flatMap((e) => e.observed.split("\n"))
    .filter((l) => l.trim().length > 20);
  // Only the curated per-category terms count. Matching any long word from the
  // root cause was too loose: it happily "supported" a diagnosis by quoting the
  // header line of the evidence bundle, which supports nothing.
  const terms = KEYWORDS[triage?.category] ?? [];
  const hits = lines.filter((l) => terms.some((k) => l.toLowerCase().includes(k)));
  // An actual observation beats the evidence bundle's own header line.
  const quote = hits.find((l) => /^\s*\[\d{4}-\d{2}-\d{2}T/.test(l)) ?? hits[0] ?? "";

  if (!matches) {
    return {
      verdict: "dissent",
      reason: `the diagnosis describes "${diag.rootCause}" but "${prop.remediationId}" does not address that`,
      quote: "",
      unsafe: false,
      citations: all(ev),
    };
  }
  if (!quote) {
    return {
      verdict: "dissent",
      reason: "no line in the evidence directly supports the stated root cause",
      quote: "",
      unsafe: false,
      citations: all(ev),
    };
  }
  if (diag.confidence < 0.5) {
    return {
      verdict: "dissent",
      reason: `the diagnosis itself is low confidence (${diag.confidence.toFixed(2)})`,
      quote: quote.trim(),
      unsafe: false,
      citations: all(ev),
    };
  }
  return {
    verdict: "confirm",
    reason: `the evidence supports the diagnosis and "${prop.remediationId}" addresses it`,
    quote: quote.trim(),
    unsafe: false,
    citations: all(ev),
  };
}

/**
 * A reviewer's confirmation only counts if the quote it offers is really in the
 * evidence. Code checks this; the reviewer does not get to be trusted either.
 */
export function quoteIsReal(quote, ev) {
  if (!quote) return false;
  // Only source evidence counts. Quoting another agent's output back is not
  // corroboration, and a Bedrock reviewer is just as capable of doing it.
  const hay = sourceEvidence(ev).map((e) => e.observed).join("\n");
  const needle = quote.trim();
  return needle.length >= 12 && hay.includes(needle);
}
