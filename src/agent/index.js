/**
 * agent/index.js — the proposal step.
 *
 * The model's job: read the evidence for one incident and propose a diagnosis
 * plus one remediation from the tenant's catalogue. It executes nothing, and
 * everything it says is graded by src/policy.js before anything happens.
 *
 * Two providers:
 *   bedrock  — Amazon Bedrock InvokeModel (the real path)
 *   offline  — a deterministic rule-based proposer, used as the published
 *              baseline and so the repo runs with no AWS credentials
 *
 * Having both is the point: the eval runs the same benchmark through each, so
 * the README can show what the model adds over rules alone instead of asserting it.
 */
import { evidence } from "../receipts.js";
import { converse, converseText } from "./bedrock.js";
import { applyFault } from "../eval/faults.js";

// An inference profile id, not a bare foundation-model id: current Bedrock
// models are served cross-region and reject the bare form. Override with
// BEDROCK_MODEL_ID to run any other family — Converse keeps the call identical.
export const DEFAULT_MODEL = process.env.BEDROCK_MODEL_ID || "us.amazon.nova-pro-v1:0";

/**
 * Build the evidence bundle for an incident. This is the ONLY thing the model
 * sees, and the same array is handed to the gate, so "what it was shown" and
 * "what it was graded against" cannot drift apart.
 * @param {import("../../contracts.js").Incident} incident
 * @param {import("../../contracts.js").RulePack} pack
 */
export function buildEvidence(incident, pack) {
  const sample = incident.alerts.slice(0, 6).map((a) => `[${a.at}] ${a.severity.toUpperCase()} ${a.message}`).join("\n");
  const items = [
    evidence(
      "alerts",
      `incident:${incident.id}`,
      `service=${incident.service} severity=${incident.severity} count=${incident.alerts.length}\n` +
        `window=${incident.openedAt}..${incident.lastSeenAt}\n${sample}`
    ),
    evidence(
      "runbook",
      `tenant:${pack.tenantId}`,
      pack.remediations.map((r) => `${r.id}: ${r.description} (reversible=${r.reversible}, blast=${r.blastRadius})`).join("\n")
    ),
  ];
  if (incident.notes.length) {
    items.push(evidence("prior_incident", `correlator:${incident.id}`, incident.notes.join("\n")));
  }
  return items;
}

const PROMPT = (incident, ev) => `You are an on-call engineer for a managed service provider.

Read ONLY the evidence below. Do not invent facts.

EVIDENCE
${ev.map((e, i) => `--- [${i}] ${e.kind} from ${e.source} (digest ${e.digest})\n${e.observed}`).join("\n")}

Choose exactly one remediation id from the runbook evidence above.

Reply with ONLY a JSON object, no prose, no code fence:
{
  "diagnosis": "<one sentence, plain language>",
  "rootCauseHypothesis": "<one sentence>",
  "remediationId": "<id from the runbook>",
  "params": {},
  "confidence": <number between 0 and 1>,
  "citations": [<the digest strings of the evidence items you actually used>]
}`;

/**
 * Deterministic baseline proposer. No model, no network. Published as the
 * control in the evaluation so the Bedrock numbers mean something.
 * @param {import("../../contracts.js").Incident} incident
 * @param {import("../../contracts.js").RulePack} pack
 * @param {import("../../contracts.js").Evidence[]} ev
 * @returns {import("../../contracts.js").Proposal}
 */
export function offlineProposer(incident, pack, ev) {
  const msg = incident.alerts[0].message.toLowerCase();
  const has = (id) => pack.remediations.some((r) => r.id === id);
  const pick = (...ids) => ids.find(has) ?? pack.remediations[0].id;

  let remediationId = pick("open-ticket");
  let diagnosis = `${incident.service} raised ${incident.alerts.length} alerts in one window.`;
  let confidence = 0.6;

  if (/disk usage|\/var\/log/.test(msg)) {
    remediationId = pick("rotate-logs", "open-ticket");
    diagnosis = `Disk pressure on ${incident.service}: the log volume is above its threshold.`;
    confidence = 0.9;
  } else if (/batch <state>|sync batch|batch failed/.test(msg) || /sync/.test(incident.service)) {
    remediationId = pick("rerun-failed-batch", "open-ticket");
    diagnosis = `A scheduled batch on ${incident.service} failed repeatedly and has not self-recovered.`;
    confidence = 0.82;
  }
  if (/connection refused|100% of requests/.test(msg)) {
    remediationId = pick("restart-service", "open-ticket");
    diagnosis = `${incident.service} is refusing connections; upstream appears down.`;
    confidence = 0.86;
  } else if (/latency|p95/.test(msg)) {
    remediationId = pick("scale-out", "open-ticket");
    diagnosis = `Latency on ${incident.service} is climbing toward the timeout ceiling.`;
    confidence = 0.72;
  }

  return {
    incidentId: incident.id,
    diagnosis,
    rootCauseHypothesis: "Derived from alert text by the deterministic baseline, not a model.",
    remediationId,
    params: {},
    confidence,
    citations: ev.map((e) => e.digest),
    model: "offline:rules-v1",
  };
}

/** Parse model output strictly. A model that cannot return JSON gets rejected, not patched up. */
export function parseProposal(text, incident, modelId) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model did not return a JSON object");
  const raw = JSON.parse(text.slice(start, end + 1));
  for (const k of ["diagnosis", "remediationId", "confidence", "citations"]) {
    if (raw[k] === undefined) throw new Error(`model response missing "${k}"`);
  }
  return {
    incidentId: incident.id,
    diagnosis: String(raw.diagnosis),
    rootCauseHypothesis: String(raw.rootCauseHypothesis ?? ""),
    remediationId: String(raw.remediationId),
    params: raw.params ?? {},
    confidence: Math.max(0, Math.min(1, Number(raw.confidence))),
    citations: Array.isArray(raw.citations) ? raw.citations.map(String) : [],
    model: `bedrock:${modelId}`,
  };
}

/**
 * Propose a remediation for one incident.
 * @param {import("../../contracts.js").Incident} incident
 * @param {import("../../contracts.js").RulePack} pack
 * @param {{provider?:string, modelId?:string}} [opts]
 * @returns {Promise<{proposal: import("../../contracts.js").Proposal, shown: import("../../contracts.js").Evidence[], ms:number}>}
 */
export async function propose(incident, pack, opts = {}) {
  const provider = opts.provider || process.env.AGENT_PROVIDER || "offline";
  const modelId = opts.modelId || DEFAULT_MODEL;
  const shown = buildEvidence(incident, pack);
  const t0 = Date.now();

  if (provider === "offline") {
    const proposal = offlineProposer(incident, pack, shown);
    if (opts.inject) proposal.remediationId = applyFault(opts.inject, proposal.remediationId, pack);
    return { proposal, shown, ms: Date.now() - t0 };
  }
  if (provider !== "bedrock") throw new Error(`Unknown AGENT_PROVIDER "${provider}" (use bedrock or offline)`);

  const res = await converse({ modelId, prompt: PROMPT(incident, shown) });
  const proposal = parseProposal(converseText(res), incident, modelId);
  if (opts.inject) proposal.remediationId = applyFault(opts.inject, proposal.remediationId, pack);
  return { proposal, shown, ms: Date.now() - t0 };
}
