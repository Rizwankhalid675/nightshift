/**
 * The gate is the safety story. These tests are the evidence that it holds,
 * including against a model that lies about what it read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, citationsValid, CONFIDENCE_FLOOR } from "../src/policy.js";
import { evidence } from "../src/receipts.js";

const pack = {
  tenantId: "t1",
  correlationWindowSec: 600,
  flapThreshold: 4,
  maintenanceWindows: [],
  benignPatterns: [],
  remediations: [
    { id: "rotate-logs", description: "rotate", reversible: true, blastRadius: "low", autoApprove: true, maxPerHour: 2 },
    { id: "restart", description: "restart", reversible: true, blastRadius: "medium", autoApprove: false, maxPerHour: 1 },
    { id: "failover", description: "failover", reversible: false, blastRadius: "high", autoApprove: true, maxPerHour: 5 },
  ],
};

const shown = [evidence("alerts", "inc1", "disk usage 91% on /var/log")];

const incident = (over = {}) => ({
  id: "inc1", tenantId: "t1", service: "log-collector", severity: "warning",
  openedAt: "2026-12-01T10:00:00.000Z", lastSeenAt: "2026-12-01T10:05:00.000Z",
  alerts: [], signature: "sig", class: "actionable", notes: [], ...over,
});

const proposal = (over = {}) => ({
  incidentId: "inc1", diagnosis: "d", rootCauseHypothesis: "r",
  remediationId: "rotate-logs", params: {}, confidence: 0.9,
  citations: shown.map((e) => e.digest), model: "test", ...over,
});

test("a clean, low-risk, opted-in proposal auto-remediates", () => {
  const v = decide({ proposal: proposal(), incident: incident(), pack, shown });
  assert.equal(v.decision, "auto_remediate");
  assert.equal(v.citationsValid, true);
});

test("a hallucinated citation is rejected outright", () => {
  const v = decide({
    proposal: proposal({ citations: ["0".repeat(64)] }),
    incident: incident(), pack, shown,
  });
  assert.equal(v.decision, "reject");
  assert.equal(v.citationsValid, false);
  assert.match(v.reasons[0], /citations do not match/);
});

test("an empty citation list is not valid — silence is not evidence", () => {
  assert.equal(citationsValid(proposal({ citations: [] }), shown), false);
});

test("an action outside the tenant's rule pack is rejected", () => {
  const v = decide({ proposal: proposal({ remediationId: "rm -rf /" }), incident: incident(), pack, shown });
  assert.equal(v.decision, "reject");
  assert.match(v.reasons.at(-1), /not in this tenant's rule pack/);
});

test("nothing acts on an incident the correlator called noise", () => {
  for (const cls of ["known_benign", "suppressed_window", "flapping", "duplicate"]) {
    const v = decide({ proposal: proposal(), incident: incident({ class: cls }), pack, shown });
    assert.equal(v.decision, "reject", `${cls} should never be acted on`);
  }
});

test("an irreversible action is never unattended, even when opted in", () => {
  const v = decide({ proposal: proposal({ remediationId: "failover" }), incident: incident(), pack, shown });
  assert.equal(v.decision, "needs_approval");
  assert.ok(v.reasons.some((r) => /irreversible/.test(r)));
  assert.ok(v.reasons.some((r) => /high blast radius/.test(r)));
});

test("low model confidence holds the action for a human", () => {
  const v = decide({
    proposal: proposal({ confidence: CONFIDENCE_FLOOR - 0.01 }),
    incident: incident(), pack, shown,
  });
  assert.equal(v.decision, "needs_approval");
});

test("a critical incident always needs a human, however confident the model is", () => {
  const v = decide({ proposal: proposal({ confidence: 1 }), incident: incident({ severity: "critical" }), pack, shown });
  assert.equal(v.decision, "needs_approval");
  assert.ok(v.reasons.some((r) => /critical/.test(r)));
});

test("the rate limit stops an agent looping on the same remediation", () => {
  const recent = [
    { remediationId: "rotate-logs", at: "2026-12-01T09:30:00.000Z" },
    { remediationId: "rotate-logs", at: "2026-12-01T09:45:00.000Z" },
  ];
  const v = decide({ proposal: proposal(), incident: incident(), pack, shown, recent, now: "2026-12-01T10:05:00.000Z" });
  assert.equal(v.decision, "needs_approval");
  assert.ok(v.reasons.some((r) => /rate limit/.test(r)));
});

test("actions outside the last hour do not count toward the rate limit", () => {
  const recent = [
    { remediationId: "rotate-logs", at: "2026-12-01T05:00:00.000Z" },
    { remediationId: "rotate-logs", at: "2026-12-01T06:00:00.000Z" },
  ];
  const v = decide({ proposal: proposal(), incident: incident(), pack, shown, recent, now: "2026-12-01T10:05:00.000Z" });
  assert.equal(v.decision, "auto_remediate");
});

test("every verdict explains itself", () => {
  const v = decide({ proposal: proposal(), incident: incident(), pack, shown });
  assert.ok(v.reasons.length > 0);
  assert.ok(v.reasons.every((r) => typeof r === "string" && r.length > 10));
});
