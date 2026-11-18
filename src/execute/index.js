/**
 * execute/index.js — the part that actually touches a customer's infrastructure.
 *
 * Everything here is written on the assumption that it will one day do the
 * wrong thing. So:
 *
 *   - It re-authorises from the rule pack itself. It does NOT trust the verdict
 *     it was handed. If the gate were ever bypassed or a verdict forged, the
 *     executor still refuses.
 *   - It is idempotent per (incident, remediation). An agent that retries does
 *     not restart the service four times.
 *   - It defaults to dry-run. Touching real infrastructure requires
 *     EXECUTOR_MODE=live AND credentials AND a tenant opt-in.
 *   - It verifies afterwards. "Command sent" is not "problem fixed", and the
 *     difference is the whole product.
 *   - Every execution chains to the decision receipt that authorised it, so the
 *     audit trail runs from raw alert to infrastructure change.
 */
import { signatureOf } from "../correlate.js";
import { receipt, evidence, sha256 } from "../receipts.js";
import { sendCommand, waitForCommand, startAutomation, waitForAutomation } from "./ssm.js";

export const MODE = () => process.env.EXECUTOR_MODE || "dry-run";

/** In-memory idempotency ledger. A real deployment points this at DynamoDB. */
export class Ledger {
  constructor() { this.byKey = new Map(); }
  static key(incidentId, remediationId) { return `${incidentId}::${remediationId}`; }
  has(incidentId, remediationId) { return this.byKey.has(Ledger.key(incidentId, remediationId)); }
  get(incidentId, remediationId) { return this.byKey.get(Ledger.key(incidentId, remediationId)); }
  put(incidentId, remediationId, record) {
    this.byKey.set(Ledger.key(incidentId, remediationId), record);
    return record;
  }
  all() { return [...this.byKey.values()]; }
}

/** Substitute {{service}} / {{incidentId}} / {{tenantId}} into executor parameters. */
export function interpolate(value, incident) {
  const vars = { service: incident.service, incidentId: incident.id, tenantId: incident.tenantId, severity: incident.severity };
  const one = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  if (typeof value === "string") return one(value);
  if (Array.isArray(value)) return value.map((v) => interpolate(v, incident));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, incident)]));
  }
  return value;
}

/**
 * Independent re-authorisation. Deliberately does not look at the verdict it
 * was given — it re-derives permission from the tenant's own rule pack.
 *
 * @returns {{ok:true, remediation:object} | {ok:false, reason:string}}
 */
export function authorise({ incident, remediationId, pack, approval }) {
  const rem = pack.remediations.find((r) => r.id === remediationId);
  if (!rem) return { ok: false, reason: `remediation "${remediationId}" is not in tenant ${pack.tenantId}'s rule pack` };
  if (incident.class !== "actionable") return { ok: false, reason: `incident is "${incident.class}", not actionable` };

  const human = approval?.approvedBy;
  if (human) {
    if (!rem.reversible && !approval.acknowledgedIrreversible) {
      return { ok: false, reason: `"${rem.id}" is irreversible and the approval did not acknowledge that` };
    }
    return { ok: true, remediation: rem };
  }
  // Unattended path: every condition must hold independently of the gate.
  if (!rem.reversible) return { ok: false, reason: `"${rem.id}" is irreversible; unattended execution refused` };
  if (rem.blastRadius === "high") return { ok: false, reason: `"${rem.id}" has a high blast radius; a human must approve` };
  if (!rem.autoApprove) return { ok: false, reason: `tenant has not opted "${rem.id}" into unattended execution` };
  if (incident.severity === "critical") return { ok: false, reason: "incident is critical; a human must approve" };
  return { ok: true, remediation: rem };
}

/**
 * Run one remediation.
 *
 * @param {Object} o
 * @param {import("../../contracts.js").Incident} o.incident
 * @param {string} o.remediationId
 * @param {import("../../contracts.js").RulePack} o.pack
 * @param {Ledger} o.ledger
 * @param {import("../../contracts.js").Receipt} [o.decisionReceipt]  The receipt that authorised this.
 * @param {{approvedBy:string, acknowledgedIrreversible?:boolean}} [o.approval]
 * @param {string} [o.mode]  "dry-run" | "live"
 * @returns {Promise<import("../../contracts.js").ExecutionRecord>}
 */
export async function execute({ incident, remediationId, pack, ledger, decisionReceipt, approval, mode }) {
  const m = mode || MODE();
  const now = new Date().toISOString();

  // Idempotency first: a repeat is not an error, it is a no-op with the original result.
  if (ledger.has(incident.id, remediationId)) {
    const prior = ledger.get(incident.id, remediationId);
    return { ...prior, repeated: true, note: "already executed for this incident; returning the original record" };
  }

  const auth = authorise({ incident, remediationId, pack, approval });
  const base = {
    incidentId: incident.id,
    tenantId: incident.tenantId,
    remediationId,
    mode: m,
    at: now,
    authorisedBy: approval?.approvedBy ? `human:${approval.approvedBy}` : "policy:unattended",
    prevDigest: decisionReceipt?.inputDigest ?? null,
    repeated: false,
  };

  if (!auth.ok) {
    const rec = { ...base, status: "refused", reason: auth.reason, target: null, verification: null };
    rec.receipt = executionReceipt(rec, incident);
    return ledger.put(incident.id, remediationId, rec);
  }

  const rem = auth.remediation;
  const ex = rem.executor ?? { type: "none" };
  const target = interpolate(ex, incident);

  if (ex.type === "none") {
    const rec = { ...base, status: "no_action", reason: `"${rem.id}" has no executor; it records intent only`, target, verification: null };
    rec.receipt = executionReceipt(rec, incident);
    return ledger.put(incident.id, remediationId, rec);
  }

  if (m !== "live") {
    const rec = {
      ...base,
      status: "dry_run",
      reason: "EXECUTOR_MODE is not 'live'; the call was composed and signed-ready but not sent",
      target,
      verification: null,
    };
    rec.receipt = executionReceipt(rec, incident);
    return ledger.put(incident.id, remediationId, rec);
  }

  // --- live path -----------------------------------------------------------
  let status = "failed";
  let detail = "";
  try {
    if (target.type === "ssm.sendCommand") {
      const cmd = await sendCommand({
        documentName: target.documentName,
        parameters: target.parameters,
        targets: target.targets,
        instanceIds: target.instanceIds,
        comment: `NightShift ${incident.id} ${rem.id}`,
      });
      const instanceId = target.instanceIds?.[0];
      if (instanceId) {
        const inv = await waitForCommand(cmd.CommandId, instanceId);
        status = inv.Status === "Success" ? "succeeded" : "failed";
        detail = `commandId=${cmd.CommandId} status=${inv.Status} ${String(inv.StandardErrorContent ?? "").slice(0, 300)}`;
      } else {
        status = "dispatched";
        detail = `commandId=${cmd.CommandId} (tag targeting; per-instance status not polled)`;
      }
    } else if (target.type === "ssm.automation") {
      const id = await startAutomation({ documentName: target.documentName, parameters: target.parameters });
      const res = await waitForAutomation(id);
      status = res.AutomationExecutionStatus === "Success" ? "succeeded" : "failed";
      detail = `automationExecutionId=${id} status=${res.AutomationExecutionStatus}`;
    } else {
      status = "refused";
      detail = `unknown executor type "${target.type}"`;
    }
  } catch (e) {
    status = "failed";
    detail = String(e.message).slice(0, 400);
  }

  const rec = { ...base, status, reason: detail, target, verification: null };
  rec.receipt = executionReceipt(rec, incident);
  return ledger.put(incident.id, remediationId, rec);
}

/** The execution receipt chains to the decision receipt that authorised it. */
function executionReceipt(rec, incident) {
  const ev = [
    evidence("execution", `incident:${rec.incidentId}`,
      `remediation=${rec.remediationId} mode=${rec.mode} status=${rec.status}\n` +
      `authorisedBy=${rec.authorisedBy}\nreason=${rec.reason ?? ""}`),
    evidence("target", `tenant:${rec.tenantId}`, JSON.stringify(rec.target ?? { type: "none" }, null, 2)),
  ];
  if (rec.prevDigest) {
    ev.push(evidence("prior_incident", "decision-receipt", `authorising decision receipt inputDigest=${rec.prevDigest}`));
  }
  return receipt({
    incidentId: rec.incidentId,
    actor: rec.authorisedBy,
    action: `execute:${rec.remediationId}:${rec.status}`,
    evidence: ev,
    ...(rec.authorisedBy.startsWith("human:") ? { approvedBy: rec.authorisedBy.slice(6) } : {}),
    at: rec.at,
  });
}

/**
 * Did it actually work?
 *
 * Checks whether alerts matching the incident's signature stopped arriving in
 * the window after execution. This is the number that separates "we ran a
 * command" from "the problem went away", and it is the one an MSP's customer
 * actually cares about.
 *
 * @param {import("../../contracts.js").Incident} incident
 * @param {import("../../contracts.js").Alert[]} laterAlerts  Alerts after the execution time.
 * @param {number} windowSec
 */
export function verifyResolution(incident, laterAlerts, windowSec = 1800) {
  const from = Date.parse(incident.lastSeenAt);
  const until = from + windowSec * 1000;
  const recurrences = laterAlerts.filter(
    (a) =>
      a.tenantId === incident.tenantId &&
      a.service === incident.service &&
      signatureOf(a.message) === incident.signature &&
      Date.parse(a.at) > from &&
      Date.parse(a.at) <= until
  );
  return {
    resolved: recurrences.length === 0,
    recurrences: recurrences.length,
    windowSec,
    checkedUntil: new Date(until).toISOString(),
    digest: sha256(`${incident.id}|${recurrences.length}|${windowSec}`),
  };
}

/** Attach a verification result to an execution record and re-receipt it. */
export function recordVerification(rec, verification, incident) {
  rec.verification = verification;
  rec.verificationReceipt = receipt({
    incidentId: rec.incidentId,
    actor: "verifier",
    action: `verify:${rec.remediationId}:${verification.resolved ? "resolved" : "recurred"}`,
    evidence: [
      evidence("metric", `incident:${rec.incidentId}`,
        `recurrences=${verification.recurrences} within ${verification.windowSec}s after ${incident.lastSeenAt}`),
    ],
    at: verification.checkedUntil,
  });
  return rec;
}
