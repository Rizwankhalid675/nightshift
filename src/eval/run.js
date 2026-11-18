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
import { proposeMulti } from "../agent/multi.js";
import { receipt } from "../receipts.js";
import { generate, stripTruth, truthIndex } from "../synth/generate.js";
import { execute, Ledger, verifyResolution, recordVerification, MODE } from "../execute/index.js";

/** Flags this script understands. Anything else is a typo worth shouting about. */
export const KNOWN_FLAGS = ["tenant", "mode", "inject", "set", "provider", "days"];
export const DATASETS = ["train", "holdout"];

/** Accepts both `--set holdout` and `--set=holdout`. */
export const parseFlag = (argv, name, dflt) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : dflt;
};

/**
 * Reject unknown flags instead of ignoring them.
 *
 * This is not pedantry. `--set=holdout` was silently dropped by a parser that
 * only understood `--set holdout`, so a run that was meant to measure held-out
 * traffic quietly measured the training set and labelled itself "train". A
 * benchmark that ignores the flag naming its dataset will publish the wrong
 * number without ever looking wrong.
 */
export function assertKnownFlags(argv, known = KNOWN_FLAGS) {
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const name = a.slice(2).split("=")[0];
    if (!known.includes(name)) {
      throw new Error(`Unknown flag --${name}. Known flags: ${known.map((k) => `--${k}`).join(", ")}`);
    }
  }
}

const arg = (name, dflt) => parseFlag(process.argv, name, dflt);

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export async function runEval({ tenantId, provider, days = 3, seed = 20261211, agentMode, inject, set = "train" }) {
  const mode = agentMode || process.env.AGENT_MODE || "multi";
  const pack = JSON.parse(readFileSync(new URL(`../../data/tenants/${tenantId}.json`, import.meta.url), "utf8"));

  const withTruth = generate({ tenantId, days, seed, set });
  const truth = truthIndex(withTruth);
  const alerts = stripTruth(withTruth);

  const incidents = correlate(alerts, pack);
  const act = actionable(incidents);

  /** Ground truth for a whole incident: actionable if any member alert was. */
  const incidentTruth = (inc) => (inc.alerts.some((a) => truth.get(a.id)?.label === "actionable") ? "actionable" : "noise");

  const timings = [];
  const results = [];
  const ledger = new Ledger();
  const execMode = MODE();
  /** @type {{remediationId:string, at:string}[]} */
  const taken = [];
  let model = provider === "offline" ? "offline:rules-v1" : "bedrock";

  const caseFiles = [];
  for (const inc of act) {
    const run =
      mode === "multi"
        ? await proposeMulti(inc, pack, { provider, inject })
        : await propose(inc, pack, { provider, inject });
    const { proposal, shown, ms } = run;
    const review = run.review;
    if (run.caseFile) caseFiles.push(run.caseFile);
    timings.push(ms);
    model = proposal.model;
    const verdict = decide({ proposal, incident: inc, pack, shown, recent: taken, review, now: inc.lastSeenAt });
    if (verdict.decision === "auto_remediate") taken.push({ remediationId: verdict.remediationId, at: inc.lastSeenAt });

    const decisionReceipt = receipt({
      incidentId: inc.id,
      actor: `agent:${proposal.model}`,
      action: `${verdict.decision}:${verdict.remediationId}`,
      evidence: shown,
    });

    // Only an auto_remediate verdict reaches the executor unattended. The
    // executor re-authorises anyway; that is the point of it.
    let execution = null;
    if (verdict.decision === "auto_remediate") {
      execution = await execute({
        incident: inc, remediationId: verdict.remediationId, pack, ledger, decisionReceipt,
      });
      const later = alerts.filter((a) => Date.parse(a.at) > Date.parse(inc.lastSeenAt));
      recordVerification(execution, verifyResolution(inc, later), inc);
    }

    results.push({
      execution,
      review: review ?? null,
      caseFile: run.caseFile ?? null,
      incidentId: inc.id,
      service: inc.service,
      severity: inc.severity,
      alertCount: inc.alerts.length,
      truth: incidentTruth(inc),
      proposal,
      verdict,
      receipt: decisionReceipt,
    });
  }

  const suppressedIncidents = incidents.filter((i) => i.class !== "actionable");
  const missedActionable = suppressedIncidents.filter((i) => incidentTruth(i) === "actionable").length;
  const falseAutoRemediations = results.filter(
    (r) => r.truth === "noise" && r.verdict.decision === "auto_remediate"
  ).length;

  /** @type {import("../../contracts.js").RunMetrics} */
  /** An execution that actually touched something: not refused, not a no-op. */
  const didExecute = (r) => r.execution && !["refused", "no_action"].includes(r.execution.status);
  const metrics = {
    runId: randomUUID().slice(0, 8),
    tenantId,
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
    executed: results.filter(didExecute).length,
    executionRefused: results.filter((r) => r.execution?.status === "refused").length,
    // Counted over the SAME population as `executed`. Counting every result
    // with a verification record instead put ticket-only outcomes in the
    // numerator, and a live run duly reported "4/3" resolutions out of
    // executions — a ratio that cannot happen.
    verifiedResolved: results.filter((r) => didExecute(r) && r.execution.verification?.resolved).length,
    executorMode: execMode,
    agentMode: mode,
    injectedFault: inject || "none",
    dataset: set,
    reviewerDissents: results.filter((r) => r.review && r.review.verdict !== "confirm").length,
    degradedRuns: results.filter((r) => r.caseFile?.degraded).length,
    model,
  };

  return { metrics, results, incidents, pack, caseFiles };
}

function printReport({ metrics, results, incidents }) {
  const pct = ((1 - metrics.actionable / metrics.alertsIn) * 100).toFixed(1);
  const row = (k, v) => console.log(`  ${k.padEnd(34)} ${v}`);

  console.log(`\n  ${metrics.label}  ·  run ${metrics.runId}  ·  dataset ${metrics.dataset}  ·  model ${metrics.model}`);
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
  row("Agent mode", metrics.agentMode === "multi" ? "multi (triage/diagnosis/remediation/review)" : "single");
  row("Reviewer dissents", metrics.reviewerDissents ?? 0);
  row("Degraded to single agent", metrics.degradedRuns ?? 0);
  if (metrics.injectedFault && metrics.injectedFault !== "none") {
    row("Injected fault", metrics.injectedFault);
    row("Wrong actions that would run", `${metrics.autoRemediated}  (lower is better)`);
  }
  row("Median time to proposal", `${metrics.medianTimeToProposalMs} ms`);
  console.log("  " + "-".repeat(54));
  row("Executor mode", metrics.executorMode);
  row("Remediations executed", metrics.executed);
  row("Refused by the executor", metrics.executionRefused);
  row(
    metrics.executorMode === "live" ? "Verified resolved" : "Did not recur (observational)",
    `${metrics.verifiedResolved}/${metrics.executed}`
  );
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
  assertKnownFlags(process.argv.slice(2));
  const tenantId = arg("tenant", "northwind-msp");
  const agentMode = arg("mode", process.env.AGENT_MODE || "multi");
  const inject = arg("inject", "none");
  const set = arg("set", "train");
  if (!DATASETS.includes(set)) throw new Error(`Unknown --set "${set}". Use one of: ${DATASETS.join(", ")}`);
  const provider = arg("provider", process.env.AGENT_PROVIDER || "offline");
  const days = Number(arg("days", "3"));

  runEval({ tenantId, provider, days, agentMode, inject, set })
    .then((out) => {
      printReport(out);
      mkdirSync(new URL("../../runs/", import.meta.url), { recursive: true });
      const path = new URL(`../../runs/${tenantId}-${provider}-${agentMode}-${out.metrics.runId}.json`, import.meta.url);
      writeFileSync(path, JSON.stringify(out, null, 2));
      console.log(`\n  Full run written to runs/${tenantId}-${provider}-${agentMode}-${out.metrics.runId}.json\n`);
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
