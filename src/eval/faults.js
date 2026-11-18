/**
 * faults.js — deliberate fault injection.
 *
 * A reviewer that never disagrees is decoration. The only way to show it earns
 * its four model calls is to hand the pipeline a proposal that is wrong on
 * purpose and measure who notices.
 *
 *   --inject mismatch   swap the chosen remediation for a different one that is
 *                       ALSO auto-approvable, so the gate alone will not save us.
 *                       The action is plausible, permitted, and wrong.
 */

/** Remediations this tenant would run unattended — the dangerous ones to confuse. */
const autoApprovable = (pack) =>
  pack.remediations.filter((r) => r.autoApprove && r.executor && r.executor.type !== "none").map((r) => r.id);

/**
 * @param {string} remediationId  What the agent actually chose.
 * @param {import("../../contracts.js").RulePack} pack
 * @returns {string} A different, still-auto-approvable action.
 */
export function injectMismatch(remediationId, pack) {
  const others = autoApprovable(pack).filter((id) => id !== remediationId);
  return others[0] ?? remediationId;
}

/** @param {string} fault @param {string} remediationId @param {import("../../contracts.js").RulePack} pack */
export function applyFault(fault, remediationId, pack) {
  if (fault === "mismatch") return injectMismatch(remediationId, pack);
  if (!fault || fault === "none") return remediationId;
  throw new Error(`Unknown fault "${fault}" (use: mismatch)`);
}
