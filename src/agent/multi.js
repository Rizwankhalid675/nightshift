/**
 * multi.js — multi-agent incident response.
 *
 * Four specialists hand a case file along: triage → diagnosis → remediation →
 * review. Each turn's output becomes evidence for the next, with its own
 * sha256, so the console can show the handoff rather than asserting it happened.
 *
 * Note on Strands: this implements the Strands "agents as tools" handoff
 * pattern directly on Bedrock rather than importing the Strands SDK, because
 * the whole project is dependency-free by design — a judge clones it and runs
 * it with nothing but node. The orchestration shape is the same: narrow agents,
 * explicit handoff, a reviewer that can refuse.
 *
 * Degradation is a feature, not an afterthought. If any specialist fails to
 * return usable JSON, the pipeline falls back to the single-agent proposer and
 * records that it did. An on-call system that stops working when a model has a
 * bad night is not an on-call system.
 */
import { evidence } from "../receipts.js";
import { invokeModel, anthropicBody, extractText } from "./bedrock.js";
import { buildEvidence, offlineProposer, DEFAULT_MODEL } from "./index.js";
import {
  PROMPTS, offlineTriage, offlineDiagnosis, offlineRemediation, offlineReviewer, quoteIsReal,
} from "./roles.js";
import { applyFault } from "../eval/faults.js";

const parseJson = (raw, role) => {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error(`${role} did not return JSON`);
  return JSON.parse(raw.slice(s, e + 1));
};

/**
 * One agent turn. Returns the parsed output plus a record of the turn.
 * @returns {Promise<{out:object, turn:import("../../contracts.js").AgentTurn}>}
 */
async function turn({ role, prompt, offline, provider, modelId }) {
  const t0 = Date.now();
  if (provider === "offline") {
    const out = offline();
    return { out, turn: { role, model: "offline:rules-v1", ms: Date.now() - t0, ok: true, output: out } };
  }
  try {
    const res = await invokeModel({ modelId, body: anthropicBody(prompt) });
    const out = parseJson(extractText(res), role);
    return { out, turn: { role, model: `bedrock:${modelId}`, ms: Date.now() - t0, ok: true, output: out } };
  } catch (err) {
    return {
      out: null,
      turn: { role, model: `bedrock:${modelId}`, ms: Date.now() - t0, ok: false, error: String(err.message).slice(0, 200), output: null },
    };
  }
}

/**
 * Run the full multi-agent pipeline for one incident.
 *
 * @param {import("../../contracts.js").Incident} incident
 * @param {import("../../contracts.js").RulePack} pack
 * @param {{provider?:string, modelId?:string}} [opts]
 * @returns {Promise<{proposal:import("../../contracts.js").Proposal, shown:import("../../contracts.js").Evidence[], review:object, caseFile:import("../../contracts.js").CaseFile, ms:number}>}
 */
export async function proposeMulti(incident, pack, opts = {}) {
  const provider = opts.provider || process.env.AGENT_PROVIDER || "offline";
  const modelId = opts.modelId || DEFAULT_MODEL;
  const t0 = Date.now();

  const base = buildEvidence(incident, pack);
  /** @type {import("../../contracts.js").AgentTurn[]} */
  const turns = [];
  let shown = [...base];

  const degrade = (why) => {
    const proposal = offlineProposer(incident, pack, shown);
    proposal.model = `${provider === "offline" ? "offline:rules-v1" : `bedrock:${modelId}`} (degraded: single agent)`;
    return {
      proposal,
      shown,
      review: { verdict: "dissent", reason: why, quote: "", unsafe: false, quoteVerified: false, degraded: true },
      caseFile: { incidentId: incident.id, turns, degraded: true, degradedReason: why },
      ms: Date.now() - t0,
    };
  };

  // 1. Triage ---------------------------------------------------------------
  const tri = await turn({
    role: "triage", provider, modelId,
    prompt: PROMPTS.triage(shown),
    offline: () => offlineTriage(incident, shown),
  });
  turns.push(tri.turn);
  if (!tri.out) return degrade(`triage agent failed: ${tri.turn.error}`);
  shown = [...shown, evidence("triage", "agent:triage",
    `category=${tri.out.category} urgency=${tri.out.urgency}\n${tri.out.summary}`)];

  // 2. Diagnosis ------------------------------------------------------------
  const dia = await turn({
    role: "diagnosis", provider, modelId,
    prompt: PROMPTS.diagnosis(shown, tri.out),
    offline: () => offlineDiagnosis(incident, shown, tri.out),
  });
  turns.push(dia.turn);
  if (!dia.out) return degrade(`diagnosis agent failed: ${dia.turn.error}`);
  shown = [...shown, evidence("diagnosis", "agent:diagnosis",
    `rootCause=${dia.out.rootCause}\nconfidence=${dia.out.confidence}\ngaps=${dia.out.evidenceGaps || "none"}`)];

  // 3. Remediation ----------------------------------------------------------
  const rem = await turn({
    role: "remediation", provider, modelId,
    prompt: PROMPTS.remediation(shown, tri.out, dia.out),
    offline: () => offlineRemediation(incident, pack, shown, tri.out, dia.out),
  });
  turns.push(rem.turn);
  if (!rem.out) return degrade(`remediation agent failed: ${rem.turn.error}`);

  // Fault injection happens here, BEFORE the reviewer runs, so the reviewer is
  // given a genuinely wrong proposal and has to catch it on the evidence alone.
  if (opts.inject) rem.out.remediationId = applyFault(opts.inject, rem.out.remediationId, pack);

  // 4. Review ---------------------------------------------------------------
  const rev = await turn({
    role: "reviewer", provider, modelId,
    prompt: PROMPTS.reviewer(shown, dia.out, rem.out),
    offline: () => offlineReviewer(incident, shown, dia.out, rem.out, pack, tri.out),
  });
  turns.push(rev.turn);
  if (!rev.out) return degrade(`reviewer agent failed: ${rev.turn.error}`);

  // The reviewer does not get to be trusted either: a confirmation only counts
  // if the quote it offered is genuinely present in the evidence.
  const quoteVerified = quoteIsReal(rev.out.quote, shown);
  const review = {
    verdict: rev.out.verdict === "confirm" && quoteVerified ? "confirm" : "dissent",
    reason:
      rev.out.verdict === "confirm" && !quoteVerified
        ? "reviewer confirmed but its supporting quote is not present in the evidence"
        : rev.out.reason,
    quote: rev.out.quote ?? "",
    unsafe: Boolean(rev.out.unsafe),
    quoteVerified,
    degraded: false,
  };

  shown = [...shown, evidence("review", "agent:reviewer",
    `verdict=${review.verdict} quoteVerified=${quoteVerified}\n${review.reason}`)];

  /** @type {import("../../contracts.js").Proposal} */
  const proposal = {
    incidentId: incident.id,
    diagnosis: dia.out.rootCause,
    rootCauseHypothesis: dia.out.evidenceGaps ? `${dia.out.rootCause} (gaps: ${dia.out.evidenceGaps})` : dia.out.rootCause,
    remediationId: rem.out.remediationId,
    params: rem.out.params ?? {},
    // The pipeline's confidence is the weakest link, not the loudest voice.
    confidence: Math.min(Number(dia.out.confidence) || 0, Number(rem.out.confidence) || 0),
    citations: shown.map((e) => e.digest),
    model: provider === "offline" ? "offline:multi-agent-v1" : `bedrock:${modelId} (4 agents)`,
  };

  return {
    proposal,
    shown,
    review,
    caseFile: {
      incidentId: incident.id,
      turns,
      degraded: false,
      triage: tri.out,
      diagnosis: dia.out,
      remediation: rem.out,
      review,
    },
    ms: Date.now() - t0,
  };
}
