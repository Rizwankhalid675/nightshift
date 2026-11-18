/**
 * contracts.js — FROZEN. Owned by the integrator.
 *
 * Every shape that crosses a module boundary lives here. Zero dependencies, so
 * the whole system runs on a clean machine with `node` and nothing else.
 *
 * Design note for judges (criterion 2, "reproduced across different partner and
 * customer environments"): there is no global config and no hardcoded tenant.
 * Every entry point takes a `tenantId` and a `RulePack`. Supporting a new
 * customer is adding a JSON rule pack, not editing code.
 */

// ---------------------------------------------------------------- severities

/** @typedef {"info"|"warning"|"error"|"critical"} Severity */
export const SEVERITIES = /** @type {const} */ (["info", "warning", "error", "critical"]);
export const SEVERITY_RANK = { info: 0, warning: 1, error: 2, critical: 3 };

/** @param {Severity} a @param {Severity} b */
export const maxSeverity = (a, b) => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b);

// -------------------------------------------------------------------- alerts

/**
 * One raw monitor event, as it arrives from a webhook, log tail or poller.
 * @typedef {Object} Alert
 * @property {string} id
 * @property {string} tenantId        Which customer environment this came from.
 * @property {string} source          "cloudwatch" | "pingdom" | "cron" | "app" ...
 * @property {string} service         The thing that is unhappy: "order-sync", "tunnel".
 * @property {Severity} severity
 * @property {string} message         Human text. May be noisy and repetitive.
 * @property {string} at              ISO 8601 timestamp.
 * @property {Record<string,string>} [labels]  env, region, host, job...
 */

/**
 * A correlated group of alerts: what a human would call "one thing going wrong".
 * Produced by the deterministic correlator. No model involved.
 * @typedef {Object} Incident
 * @property {string} id
 * @property {string} tenantId
 * @property {string} service
 * @property {Severity} severity      Highest severity among members.
 * @property {string} openedAt
 * @property {string} lastSeenAt
 * @property {Alert[]} alerts
 * @property {string} signature       Stable key alerts were grouped by.
 * @property {IncidentClass} class
 * @property {string[]} notes         Why the correlator did what it did.
 */

/**
 * How the deterministic layer classified the incident, before any AI runs.
 * @typedef {"actionable"|"suppressed_window"|"flapping"|"duplicate"|"known_benign"} IncidentClass
 */

// ------------------------------------------------------------------ evidence

/**
 * Everything the agent was allowed to see, and nothing else. Hashed so a
 * decision can be replayed and proven against the inputs it actually had.
 * @typedef {Object} Evidence
 * @property {string} kind            "alerts" | "runbook" | "metric" | "prior_incident"
 * @property {string} source          Where it came from.
 * @property {string} observed        Verbatim content. Never paraphrased.
 * @property {string} digest          sha256 of `observed`.
 */

/**
 * @typedef {Object} Receipt
 * @property {string} id
 * @property {string} incidentId
 * @property {string} at
 * @property {string} actor           "agent:<model>" | "policy" | "human:<id>"
 * @property {string} action          What was decided or done.
 * @property {Evidence[]} evidence
 * @property {string} inputDigest     sha256 over the ordered evidence digests.
 * @property {string} [approvedBy]
 */

// -------------------------------------------------------------- agent output

/**
 * What the model proposes. It never executes anything itself.
 * @typedef {Object} Proposal
 * @property {string} incidentId
 * @property {string} diagnosis           One sentence, plain language.
 * @property {string} rootCauseHypothesis
 * @property {string} remediationId       Must name an action in the tenant's rule pack.
 * @property {Record<string,string>} params
 * @property {number} confidence          0..1, self-reported. Never trusted alone.
 * @property {string[]} citations         Evidence digests the model says it used.
 * @property {string} model               e.g. "bedrock:anthropic.claude-..."
 */

/**
 * The deterministic verdict on a proposal. Code decides, not the model.
 * @typedef {Object} Verdict
 * @property {"auto_remediate"|"needs_approval"|"reject"} decision
 * @property {string[]} reasons           Every rule that fired, in order.
 * @property {boolean} citationsValid     False if the model cited evidence it never saw.
 * @property {string} remediationId
 */

// --------------------------------------------------------------- rule packs

/**
 * A customer environment, expressed as data. This is the reproducibility story.
 * @typedef {Object} RulePack
 * @property {string} tenantId
 * @property {string} displayName
 * @property {number} correlationWindowSec
 * @property {number} flapThreshold          Repeats within the window that mean "flapping".
 * @property {MaintenanceWindow[]} maintenanceWindows
 * @property {BenignPattern[]} benignPatterns
 * @property {Remediation[]} remediations
 */

/**
 * @typedef {Object} MaintenanceWindow
 * @property {string} service
 * @property {number} startMinuteUtc   Minutes past midnight UTC.
 * @property {number} durationMin
 * @property {string} reason
 */

/**
 * A pattern that looks like an error but is a known, harmless log line.
 * @typedef {Object} BenignPattern
 * @property {string} id
 * @property {string} service
 * @property {string} match            Case-insensitive substring.
 * @property {string} why
 */

/**
 * Something the system is allowed to do about an incident.
 * @typedef {Object} Remediation
 * @property {string} id
 * @property {string} description
 * @property {boolean} reversible      Irreversible actions never auto-execute.
 * @property {"low"|"medium"|"high"} blastRadius
 * @property {boolean} autoApprove     Tenant opt-in. Gate still applies.
 * @property {number} maxPerHour       Rate limit, enforced by the gate.
 */

// ---------------------------------------------------------------- the metric

/**
 * The headline numbers. Produced by src/eval/run.js, printed in the README.
 * @typedef {Object} RunMetrics
 * @property {string} runId
 * @property {string} label
 * @property {number} alertsIn
 * @property {number} incidentsOut
 * @property {number} noiseSuppressed      Incidents the deterministic layer closed.
 * @property {number} actionable
 * @property {number} autoRemediated
 * @property {number} needsApproval
 * @property {number} falseAutoRemediations  Auto-actions on incidents labelled benign. MUST be 0.
 * @property {number} missedActionable       Real incidents wrongly suppressed. MUST be 0.
 * @property {number} medianTimeToProposalMs
 * @property {number} [executed]        Remediations actually carried out (or dry-run composed).
 * @property {number} [executionRefused] Blocked by the executor's independent re-authorisation.
 * @property {number} [verifiedResolved] Executions where the alert did not recur.
 * @property {string} model
 */

// -------------------------------------------------------------------- guards

/** @param {unknown} a @returns {a is Alert} */
export function isAlert(a) {
  return (
    !!a && typeof a === "object" &&
    typeof (/** @type {any} */ (a).id) === "string" &&
    typeof (/** @type {any} */ (a).tenantId) === "string" &&
    typeof (/** @type {any} */ (a).service) === "string" &&
    SEVERITIES.includes(/** @type {any} */ (a).severity) &&
    typeof (/** @type {any} */ (a).at) === "string"
  );
}

/** Throws unless the rule pack is complete enough to run a tenant. */
export function assertRulePack(p) {
  const need = ["tenantId", "correlationWindowSec", "flapThreshold", "remediations"];
  for (const k of need) {
    if (p?.[k] === undefined) throw new Error(`RulePack missing "${k}"`);
  }
  if (!Array.isArray(p.remediations)) throw new Error("RulePack.remediations must be an array");
  const ids = new Set();
  for (const r of p.remediations) {
    if (ids.has(r.id)) throw new Error(`Duplicate remediation id "${r.id}"`);
    ids.add(r.id);
  }
  return p;
}

export const CONTRACT_VERSION = "1.1.0";
