/**
 * eval/run.js — the benchmark that produces every number in the README.
 *
 * It grades the whole pipeline against ground truth the pipeline never sees.
 * Two safety numbers matter more than the headline:
 *
 *   falseAutoRemediations — unattended action taken on something that was noise
 *   missedActionable      — a real problem the system silently swallowed
 *
 * Both MUST be 0. The run exits non-zero if either is not, so this drops
 * straight into CI as a release gate.
 *
 *   node src/eval/run.js --tenant northwind-msp --provider offline
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { correlate, actionable } from "../correlate.js";
import { decide } from "../policy.js";
import { propose } from "../agent/index.js";
import { receipt } from "../receipts.js";
import { generate, stripTruth, truthIndex } from "../synth/generate.js";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export async function runEval({ tenantId, provider, days = 3, seed = 20261211 }) {
  const pack = JSON.parse(readFileSync(new URL(`../../data/tenants/${tenantId}.json`, import.meta.url), "utf8"));

  const withTruth = generate({ tenantId, days, seed });
  const truth = truthIndex(withTruth);
  const alerts = stripTruth(withTruth);

  const incidents = correlate(alerts, pack);
  const act = actionable(incidents);

  /** Ground truth for a whole incident: actionable if any member alert was. */
  const incidentTruth = (inc) => (inc.alerts.some((a) => truth.get(a.id)?.label === "actionable") ? "actionable" : "noise");

  const timings = [];
  const results = [];
  /** @type {{remediationId:string, at:string}[]} */
  const taken = [];
  let model = provider === "offline" ? "offline:rules-v1" : "bedrock";

  for (const inc of act) {
    const { proposal, shown, ms } = await propose(inc, pack, { provider });
    timings.push(ms);
    model = proposal.model;
    const verdict = decide({ proposal, incident: inc, pack, shown, recent: taken, now: inc.lastSeenAt });
    if (verdict.decision === "auto_remediate") taken.push({ remediationId: verdict.remediationId, at: inc.lastSeenAt });
    results.push({
      incidentId: inc.id,
      service: inc.service,
      severity: inc.severity,
      alertCount: inc.alerts.length,
      truth: incidentTruth(inc),
      proposal,
      verdict,
      receipt: receipt({
        incidentId: inc.id,
        actor: `agent:${proposal.model}`,
        action: `${verdict.decision}:${verdict.remediationId}`,
        evidence: shown,
      }),
    });
  }

  const suppressedIncidents = incidents.filter((i) => i.class !== "actionable");
  const missedActionable = suppressedIncidents.filter((i) => incidentTruth(i) === "actionable").length;
  const falseAutoRemediations = results.filter(
    (r) => r.truth === "noise" && r.verdict.decision === "auto_remediate"
  ).length;

  /** @type {import("../../contracts.js").RunMetrics} */
  const metrics = {
    runId: randomUUID().slice(0, 8),
    label: `${pack.displayName} / ${provider}`,
    alertsIn: alerts.length,
    incidentsOut: incidents.length,
    noiseSuppressed: suppressedIncidents.length,
    actionable: act.length,
    autoRemediated: results.filter((r) => r.verdict.decision === "auto_remediate").length,
    needsApproval: results.filter((r) => r.verdict.decision === "needs_approval").length,
    falseAutoRemediations,
    missedActionable,
    medianTimeToProposalMs: median(timings),
    model,
  };

  return { metrics, results, incidents, pack };
}

function printReport({ metrics, results, incidents }) {
  const pct = ((1 - metrics.actionable / metrics.alertsIn) * 100).toFixed(1);
  const row = (k, v) => console.log(`  ${k.padEnd(34)} ${v}`);

  console.log(`\n  ${metrics.label}  ·  run ${metrics.runId}  ·  model ${metrics.model}`);
  console.log("  " + "-".repeat(54));
  row("Alerts in", metrics.alertsIn);
  row("Incidents after correlation", metrics.incidentsOut);
  row("Noise suppressed by rules", metrics.noiseSuppressed);
  row("Actionable incidents (paged)", metrics.actionable);
  row("Reduction alerts -> pages", `${pct}%`);
  console.log("  " + "-".repeat(54));
  row("Auto-remediated", metrics.autoRemediated);
  row("Held for human approval", metrics.needsApproval);
  row("Rejected by the gate", results.filter((r) => r.verdict.decision === "reject").length);
  row("Median time to proposal", `${metrics.medianTimeToProposalMs} ms`);
  console.log("  " + "-".repeat(54));
  row("False auto-remediations", `${metrics.falseAutoRemediations}  (must be 0)`);
  row("Missed real incidents", `${metrics.missedActionable}  (must be 0)`);

  const byClass = {};
  for (const i of incidents) byClass[i.class] = (byClass[i.class] ?? 0) + 1;
  console.log(`\n  Incident classes: ${JSON.stringify(byClass)}`);

  const held = results.filter((r) => r.verdict.decision === "needs_approval").slice(0, 3);
  if (held.length) {
    console.log("\n  Why things were held back:");
    for (const h of held) console.log(`    ${h.service}: ${h.verdict.reasons.join("; ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tenantId = arg("tenant", "northwind-msp");
  const provider = arg("provider", process.env.AGENT_PROVIDER || "offline");
  const days = Number(arg("days", "3"));

  runEval({ tenantId, provider, days })
    .then((out) => {
      printReport(out);
      mkdirSync(new URL("../../runs/", import.meta.url), { recursive: true });
      const path = new URL(`../../runs/${tenantId}-${provider}-${out.metrics.runId}.json`, import.meta.url);
      writeFileSync(path, JSON.stringify(out, null, 2));
      console.log(`\n  Full run written to runs/${tenantId}-${provider}-${out.metrics.runId}.json\n`);
      const bad = out.metrics.falseAutoRemediations > 0 || out.metrics.missedActionable > 0;
      if (bad) {
        console.error("  GATE FAILED: a safety number is non-zero.\n");
        process.exit(1);
      }
    })
    .catch((e) => {
      console.error(`\n  Eval failed: ${e.message}\n`);
      process.exit(1);
    });
}
