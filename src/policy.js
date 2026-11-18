/**
 * policy.js — the gate. Code decides; the model only proposes.
 *
 * Every rule here is a thing an MSP would be asked in a post-incident review:
 * "could it have done that without us?", "what stopped it doing it twice?",
 * "how do you know it read the right logs?". Each one is a pure function of
 * (proposal, incident, rule pack, recent history).
 */

/** Below this, the model's own confidence is not enough to act unattended. */
export const CONFIDENCE_FLOOR = 0.75;

/**
 * Did the model cite evidence it was actually shown? A model that invents a
 * citation is hallucinating its justification, and nothing it says is usable.
 * @param {import("../contracts.js").Proposal} proposal
 * @param {import("../contracts.js").Evidence[]} shown
 */
export function citationsValid(proposal, shown) {
  if (!proposal.citations?.length) return false;
  const seen = new Set(shown.map((e) => e.digest));
  return proposal.citations.every((c) => seen.has(c));
}

/**
 * @param {Object} o
 * @param {import("../contracts.js").Proposal} o.proposal
 * @param {import("../contracts.js").Incident} o.incident
 * @param {import("../contracts.js").RulePack} o.pack
 * @param {import("../contracts.js").Evidence[]} o.shown     Exactly what the model saw.
 * @param {{remediationId:string, at:string}[]} [o.recent]   Actions already taken, for rate limits.
 * @param {string} [o.now]
 * @returns {import("../contracts.js").Verdict}
 */
export function decide({ proposal, incident, pack, shown, recent = [], now }) {
  /** @type {string[]} */
  const reasons = [];
  const valid = citationsValid(proposal, shown);
  const rem = pack.remediations.find((r) => r.id === proposal.remediationId);

  const reject = (why) => {
    reasons.push(why);
    return { decision: /** @type {const} */ ("reject"), reasons, citationsValid: valid, remediationId: proposal.remediationId };
  };

  // 1. The model must have read what it claims to have read.
  if (!valid) return reject("citations do not match the evidence the model was shown");

  // 2. It may only name an action this tenant has actually defined.
  if (!rem) return reject(`remediation "${proposal.remediationId}" is not in this tenant's rule pack`);

  // 3. Nothing acts on something the deterministic layer already called noise.
  if (incident.class !== "actionable") {
    return reject(`incident is classified "${incident.class}", not actionable`);
  }

  // From here the action is legitimate; the question is who authorises it.
  let needsApproval = false;
  const hold = (why) => {
    reasons.push(why);
    needsApproval = true;
  };

  // 4. Irreversible actions are never unattended. No exceptions, no override.
  if (!rem.reversible) hold(`"${rem.id}" is irreversible`);

  // 5. Blast radius.
  if (rem.blastRadius === "high") hold(`"${rem.id}" has a high blast radius`);

  // 6. Tenant opt-in.
  if (!rem.autoApprove) hold(`tenant has not opted "${rem.id}" into unattended execution`);

  // 7. Rate limit: an agent in a loop is worse than no agent.
  const hourAgo = Date.parse(now ?? new Date().toISOString()) - 3_600_000;
  const used = recent.filter((r) => r.remediationId === rem.id && Date.parse(r.at) >= hourAgo).length;
  if (used >= rem.maxPerHour) hold(`rate limit reached for "${rem.id}" (${used}/${rem.maxPerHour} in the last hour)`);

  // 8. The model's own uncertainty.
  if (proposal.confidence < CONFIDENCE_FLOOR) {
    hold(`model confidence ${proposal.confidence.toFixed(2)} is below the floor ${CONFIDENCE_FLOOR}`);
  }

  // 9. A customer-facing outage is a human's call, however confident the model is.
  if (incident.severity === "critical") hold("incident is critical; a human confirms customer-facing actions");

  if (needsApproval) {
    return { decision: "needs_approval", reasons, citationsValid: valid, remediationId: rem.id };
  }
  reasons.push(`"${rem.id}" is reversible, low blast radius, opted in, within rate limit and above the confidence floor`);
  return { decision: "auto_remediate", reasons, citationsValid: valid, remediationId: rem.id };
}
