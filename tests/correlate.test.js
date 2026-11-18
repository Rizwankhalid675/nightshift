import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlate, signatureOf, inMaintenanceWindow, matchBenign, actionable } from "../src/correlate.js";
import { generate, stripTruth, truthIndex } from "../src/synth/generate.js";

const pack = JSON.parse(readFileSync(new URL("../data/tenants/northwind-msp.json", import.meta.url), "utf8"));

const alert = (over = {}) => ({
  id: "a1", tenantId: "northwind-msp", source: "cloudwatch", service: "order-sync",
  severity: "error", message: "Sync batch failed: 15 errors", at: "2026-12-01T10:00:00.000Z", ...over,
});

test("signatures ignore the variable parts of a message", () => {
  assert.equal(
    signatureOf("Sync batch failed: 15 errors in the last 15 minutes (attempt 3)"),
    signatureOf("Sync batch failed: 22 errors in the last 15 minutes (attempt 9)")
  );
});

test("signatures collapse state verbs so a flap stays one incident", () => {
  assert.equal(
    signatureOf("Health check failed for edge probe"),
    signatureOf("Health check recovered for edge probe")
  );
});

test("different problems keep different signatures", () => {
  assert.notEqual(signatureOf("Disk usage 91% on /var/log"), signatureOf("Connection refused to upstream"));
});

test("correlation is deterministic: same input, identical output", () => {
  const alerts = stripTruth(generate({ tenantId: "northwind-msp", days: 2, seed: 7 }));
  const a = correlate(alerts, pack);
  const b = correlate(alerts, pack);
  assert.deepEqual(a.map((i) => [i.id, i.class, i.alerts.length]), b.map((i) => [i.id, i.class, i.alerts.length]));
});

test("a burst of repeats collapses into one incident", () => {
  const alerts = Array.from({ length: 12 }, (_, i) =>
    alert({ id: `a${i}`, at: new Date(Date.parse("2026-12-01T10:00:00.000Z") + i * 45_000).toISOString() })
  );
  const incs = correlate(alerts, pack);
  assert.equal(incs.length, 1);
  assert.equal(incs[0].alerts.length, 12);
});

test("alerts further apart than the window open a new incident", () => {
  const alerts = [
    alert({ id: "a1", at: "2026-12-01T10:00:00.000Z" }),
    alert({ id: "a2", at: "2026-12-01T13:00:00.000Z" }),
  ];
  assert.equal(correlate(alerts, pack).length, 2);
});

test("a benign pattern is suppressed, not paged", () => {
  const a = alert({ service: "catalog-sync", message: "Skipping creation for item SKU-A1_B2 - an inactive item already exists" });
  assert.ok(matchBenign(pack.benignPatterns, a));
  assert.equal(correlate([a], pack)[0].class, "known_benign");
});

test("maintenance windows suppress by service and time", () => {
  assert.ok(inMaintenanceWindow(pack.maintenanceWindows, "billing-api", "2026-12-01T03:10:00.000Z"));
  assert.equal(inMaintenanceWindow(pack.maintenanceWindows, "billing-api", "2026-12-01T05:00:00.000Z"), null);
  assert.equal(inMaintenanceWindow(pack.maintenanceWindows, "payments-gateway", "2026-12-01T03:10:00.000Z"), null);
});

test("another tenant's alerts are never correlated into this tenant", () => {
  const mixed = [alert({ id: "mine" }), alert({ id: "theirs", tenantId: "acme-retail" })];
  const incs = correlate(mixed, pack);
  assert.equal(incs.flatMap((i) => i.alerts).every((a) => a.tenantId === "northwind-msp"), true);
});

test("no real incident is ever silently suppressed", () => {
  const withTruth = generate({ tenantId: "northwind-msp", days: 3 });
  const truth = truthIndex(withTruth);
  const incs = correlate(stripTruth(withTruth), pack);
  const missed = incs
    .filter((i) => i.class !== "actionable")
    .filter((i) => i.alerts.some((a) => truth.get(a.id)?.label === "actionable"));
  assert.equal(missed.length, 0, `suppressed real incidents: ${missed.map((m) => m.service).join(", ")}`);
});

test("the published headline holds: 203 alerts reduce to 12 pages", () => {
  const alerts = stripTruth(generate({ tenantId: "northwind-msp", days: 3, seed: 20261211 }));
  const incs = correlate(alerts, pack);
  assert.equal(alerts.length, 203);
  assert.equal(incs.length, 21);
  assert.equal(actionable(incs).length, 12);
});

test("a rule pack missing required fields is rejected loudly", () => {
  assert.throws(() => correlate([], { tenantId: "x" }), /RulePack missing/);
});

test("the safety gate holds on held-out traffic the rules were never tuned for", async () => {
  // The honest test: different services, different wording, and two failure
  // classes no rule was written for. Both safety numbers must still be zero.
  const { runEval } = await import("../src/eval/run.js");
  const out = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi", set: "holdout" });
  assert.equal(out.metrics.falseAutoRemediations, 0, "a wrong action ran unattended on unseen traffic");
  assert.equal(out.metrics.missedActionable, 0, "a real incident was suppressed on unseen traffic");
  assert.ok(out.metrics.alertsIn > 100);
});

test("unfamiliar traffic is automated less, not more", async () => {
  const { runEval } = await import("../src/eval/run.js");
  const train = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
  const held = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi", set: "holdout" });
  const trainRate = train.metrics.autoRemediated / train.metrics.actionable;
  const heldRate = held.metrics.autoRemediated / held.metrics.actionable;
  assert.ok(heldRate < trainRate, `held-out automation rate ${heldRate} should be below ${trainRate}`);
});
