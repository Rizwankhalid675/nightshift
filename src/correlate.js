/**
 * correlate.js — the deterministic layer. No model runs here, ever.
 *
 * This is the part that makes the AI safe to use. It turns an alert flood into
 * a small number of incidents and decides, by rule, which ones are real. The
 * model only ever sees what survives this stage, which is also what keeps the
 * token bill sane at MSP volume.
 *
 * Pure functions: same alerts + same rule pack => same incidents, always.
 */
import { maxSeverity, assertRulePack } from "../contracts.js";
import { sha256 } from "./receipts.js";

/**
 * Collapse the variable parts of a message so repeats of "the same thing"
 * group together: ids, numbers, uuids, quoted values, durations.
 * @param {string} msg
 */
export function signatureOf(msg) {
  return msg
    .toLowerCase()
    // State verbs collapse to <state> so "check failed" and "check recovered"
    // land in ONE incident. Without this a flapping probe looks like two
    // healthy-looking groups and never gets detected as a flap.
    .replace(/\b(failed|failing|recovered|resolved|restored|back up|healthy|unhealthy)\b/g, "<state>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/\b[a-z]{2,}-[a-z0-9]{3,}_[a-z0-9]+\b/gi, "<sku>")
    .replace(/"[^"]*"|'[^']*'/g, "<val>")
    .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|m|mb|gb|%)\b/g, "<qty>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minutes past midnight UTC for an ISO timestamp. */
export function minuteOfDayUtc(iso) {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * @param {import("../contracts.js").MaintenanceWindow[]} windows
 * @param {string} service @param {string} at
 */
export function inMaintenanceWindow(windows, service, at) {
  const m = minuteOfDayUtc(at);
  for (const w of windows ?? []) {
    if (w.service !== service && w.service !== "*") continue;
    const start = w.startMinuteUtc;
    const end = start + w.durationMin;
    // windows may wrap past midnight
    if (end <= 1440 ? m >= start && m < end : m >= start || m < end - 1440) return w;
  }
  return null;
}

/**
 * @param {import("../contracts.js").BenignPattern[]} patterns
 * @param {import("../contracts.js").Alert} alert
 */
export function matchBenign(patterns, alert) {
  const hay = alert.message.toLowerCase();
  for (const p of patterns ?? []) {
    if (p.service !== alert.service && p.service !== "*") continue;
    if (hay.includes(p.match.toLowerCase())) return p;
  }
  return null;
}

/**
 * Group raw alerts into incidents and classify each one.
 *
 * @param {import("../contracts.js").Alert[]} alerts
 * @param {import("../contracts.js").RulePack} pack
 * @returns {import("../contracts.js").Incident[]}
 */
export function correlate(alerts, pack) {
  assertRulePack(pack);
  const windowMs = pack.correlationWindowSec * 1000;

  const mine = alerts
    .filter((a) => a.tenantId === pack.tenantId)
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  /** @type {Map<string, import("../contracts.js").Incident>} */
  const open = new Map();
  /** @type {import("../contracts.js").Incident[]} */
  const closed = [];

  for (const alert of mine) {
    const sig = signatureOf(alert.message);
    const key = `${alert.service}::${sig}`;
    const t = Date.parse(alert.at);
    const existing = open.get(key);

    if (existing && t - Date.parse(existing.lastSeenAt) <= windowMs) {
      existing.alerts.push(alert);
      existing.lastSeenAt = alert.at;
      existing.severity = maxSeverity(existing.severity, alert.severity);
      continue;
    }
    if (existing) {
      closed.push(existing);
      open.delete(key);
    }
    open.set(key, {
      id: `inc_${sha256(`${alert.tenantId}|${key}|${alert.at}`).slice(0, 16)}`,
      tenantId: alert.tenantId,
      service: alert.service,
      severity: alert.severity,
      openedAt: alert.at,
      lastSeenAt: alert.at,
      alerts: [alert],
      signature: sig,
      class: "actionable",
      notes: [],
    });
  }
  closed.push(...open.values());

  for (const inc of closed) classify(inc, pack);
  return closed.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
}

/**
 * Decide what an incident *is*. Order matters and is deliberate:
 * a benign log line inside a maintenance window is still benign.
 * @param {import("../contracts.js").Incident} inc
 * @param {import("../contracts.js").RulePack} pack
 */
function classify(inc, pack) {
  const first = inc.alerts[0];

  const benign = matchBenign(pack.benignPatterns, first);
  if (benign) {
    inc.class = "known_benign";
    inc.notes.push(`benign pattern ${benign.id}: ${benign.why}`);
    return;
  }

  const win = inMaintenanceWindow(pack.maintenanceWindows, inc.service, inc.openedAt);
  if (win) {
    inc.class = "suppressed_window";
    inc.notes.push(`inside maintenance window (${win.reason})`);
    return;
  }

  if (inc.alerts.length >= pack.flapThreshold && isFlapping(inc)) {
    inc.class = "flapping";
    inc.notes.push(`${inc.alerts.length} state changes within the window; treating as flap, not an outage`);
    return;
  }

  if (inc.alerts.length > 1) {
    inc.notes.push(`${inc.alerts.length} alerts collapsed into one incident`);
  }
  inc.class = "actionable";
}

/**
 * Flapping = the signal recovers and re-fires repeatedly rather than staying
 * down. We detect it by alternating severity, which is what up/down looks like.
 * @param {import("../contracts.js").Incident} inc
 */
export function isFlapping(inc) {
  let transitions = 0;
  for (let i = 1; i < inc.alerts.length; i++) {
    if (inc.alerts[i].severity !== inc.alerts[i - 1].severity) transitions++;
  }
  const recovers = inc.alerts.filter((a) => /recover|resolved|back up|ok\b/i.test(a.message)).length;
  return transitions >= 2 || recovers >= 2;
}

/** Convenience: only the incidents a human should ever hear about. */
export const actionable = (incs) => incs.filter((i) => i.class === "actionable");

/** Noise the deterministic layer removed, for the "before" number. */
export const suppressed = (incs) => incs.filter((i) => i.class !== "actionable");
