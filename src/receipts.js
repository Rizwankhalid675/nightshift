/**
 * receipts.js — evidence hashing.
 *
 * Why this exists: an MSP has to answer "why did your robot restart my
 * production service at 4am?". A log line is not an answer. A receipt that
 * pins the exact inputs the decision was made from is.
 */
import { createHash, randomUUID } from "node:crypto";

/** @param {string} s */
export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Short form for display. Full digest always kept in the receipt. */
export const short = (d) => d.slice(0, 12);

/**
 * @param {string} kind @param {string} source @param {string} observed
 * @returns {import("../contracts.js").Evidence}
 */
export function evidence(kind, source, observed) {
  return { kind, source, observed, digest: sha256(observed) };
}

/**
 * Digest over an ordered evidence list. Order matters: reordering the inputs
 * is a different decision context, and the digest must say so.
 * @param {import("../contracts.js").Evidence[]} items
 */
export function inputDigest(items) {
  return sha256(items.map((e) => e.digest).join("\n"));
}

/**
 * @param {Object} o
 * @param {string} o.incidentId @param {string} o.actor @param {string} o.action
 * @param {import("../contracts.js").Evidence[]} o.evidence @param {string} [o.approvedBy]
 * @param {string} [o.at]
 * @returns {import("../contracts.js").Receipt}
 */
export function receipt({ incidentId, actor, action, evidence: ev, approvedBy, at }) {
  return {
    id: randomUUID(),
    incidentId,
    at: at ?? new Date().toISOString(),
    actor,
    action,
    evidence: ev,
    inputDigest: inputDigest(ev),
    ...(approvedBy ? { approvedBy } : {}),
  };
}

/**
 * Re-derive the digest from the stored evidence. If this returns false the
 * receipt has been tampered with or the evidence was edited after the fact.
 * @param {import("../contracts.js").Receipt} r
 */
export function verifyReceipt(r) {
  for (const e of r.evidence) {
    if (sha256(e.observed) !== e.digest) return { ok: false, reason: `evidence digest mismatch: ${e.source}` };
  }
  if (inputDigest(r.evidence) !== r.inputDigest) return { ok: false, reason: "input digest mismatch" };
  return { ok: true, reason: "verified" };
}
