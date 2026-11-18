/**
 * Auditability.
 *
 * A published number is only worth something if the artefact behind it is
 * complete enough to reproduce or dispute. These tests assert that the run
 * record carries the inputs, the agent outputs, the configuration, the
 * verification outcomes and the timestamps — and that the headline figures in
 * the README still match what the code produces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runEval } from "../src/eval/run.js";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("a run artefact carries everything needed to audit it", async () => {
  const out = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });

  for (const k of ["meta", "metrics", "results", "incidents", "pack", "caseFiles"]) {
    assert.ok(out[k], `run artefact is missing "${k}"`);
  }

  // When it ran, and for how long.
  assert.match(out.meta.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(out.meta.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(out.meta.durationMs >= 0);

  // What produced it.
  assert.ok(out.meta.contractVersion, "contract version not recorded");
  assert.ok(out.meta.node.startsWith("v"), "node version not recorded");
  assert.equal(out.meta.provider, "offline");
  assert.ok(out.meta.inference.modelId, "model id not recorded");
  assert.ok(out.meta.generator.seed, "generator seed not recorded — the run would not reproduce");
  assert.equal(out.meta.dataset, "train");

  // The inputs.
  assert.ok(out.incidents.length > 0, "no incidents recorded");
  assert.ok(out.incidents[0].alerts.length > 0, "incidents recorded without their alerts");
  assert.ok(out.pack.tenantId, "rule pack not recorded");
});

test("the inference configuration recorded is the configuration used", async () => {
  const { CONVERSE_DEFAULTS } = await import("../src/agent/bedrock.js");
  const saved = { ...process.env };
  process.env.AWS_REGION = "us-east-2";
  try {
    const out = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
    assert.equal(out.meta.inference.api, "offline");
    // Temperature and token ceiling come from the client's own constants, so
    // the artefact cannot drift from what was actually sent.
    assert.equal(CONVERSE_DEFAULTS.temperature, 0);
    assert.ok(CONVERSE_DEFAULTS.maxTokens > 0);
    assert.ok(Object.isFrozen(CONVERSE_DEFAULTS), "inference defaults must not be mutable at runtime");
  } finally {
    if (saved.AWS_REGION) process.env.AWS_REGION = saved.AWS_REGION;
    else delete process.env.AWS_REGION;
  }
});

test("every decision carries a receipt with evidence and a timestamp", async () => {
  const { results } = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(r.receipt, `${r.incidentId}: no receipt`);
    assert.match(r.receipt.inputDigest, /^[0-9a-f]{64}$/, `${r.incidentId}: receipt digest is not a sha256`);
    assert.match(r.receipt.at, /^\d{4}-\d{2}-\d{2}T/, `${r.incidentId}: receipt has no timestamp`);
    assert.ok(Array.isArray(r.receipt.evidence) && r.receipt.evidence.length > 0,
      `${r.incidentId}: receipt records no evidence`);
  }
});

test("an executed action records its verification outcome", async () => {
  const { results } = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
  const executed = results.filter((r) => r.execution && r.execution.status !== "no_action");
  assert.ok(executed.length > 0, "nothing executed, so verification cannot be checked");
  for (const r of executed) {
    assert.ok(r.execution.status, `${r.incidentId}: execution without a status`);
    assert.ok("verification" in r.execution, `${r.incidentId}: execution without a verification outcome`);
  }
});

test("the README headline numbers still match a fresh run", async () => {
  // Stops the published figures drifting from the code without anyone noticing.
  const { metrics } = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
  const reduction = ((1 - metrics.actionable / metrics.alertsIn) * 100).toFixed(1);

  assert.equal(metrics.alertsIn, 203);
  assert.equal(metrics.incidentsOut, 21);
  assert.equal(metrics.actionable, 12);
  assert.equal(reduction, "94.1");

  assert.ok(README.includes("203 alerts  →  21 incidents  →  12 pages to a human"),
    "the README headline line no longer matches the run");
  assert.ok(README.includes("94.1%"), "the README no longer quotes the measured reduction");
});
