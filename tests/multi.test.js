/**
 * The multi-agent pipeline earns its extra model calls only if the reviewer
 * actually catches things. These tests are that argument.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { proposeMulti } from "../src/agent/multi.js";
import { quoteIsReal, sourceEvidence, offlineReviewer, offlineTriage, offlineDiagnosis } from "../src/agent/roles.js";
import { decide } from "../src/policy.js";
import { evidence } from "../src/receipts.js";
import { injectMismatch } from "../src/eval/faults.js";

const pack = JSON.parse(readFileSync(new URL("../data/tenants/northwind-msp.json", import.meta.url), "utf8"));

const incident = (over = {}) => ({
  id: "inc_m", tenantId: "northwind-msp", service: "log-collector", severity: "warning",
  openedAt: "2026-12-01T19:40:00.000Z", lastSeenAt: "2026-12-01T20:10:00.000Z",
  alerts: [
    { id: "a1", tenantId: "northwind-msp", source: "cloudwatch", service: "log-collector", severity: "warning",
      message: "Disk usage 86% on /var/log exceeds threshold 85%", at: "2026-12-01T19:40:00.000Z" },
    { id: "a2", tenantId: "northwind-msp", source: "cloudwatch", service: "log-collector", severity: "warning",
      message: "Disk usage 92% on /var/log exceeds threshold 85%", at: "2026-12-01T20:10:00.000Z" },
  ],
  signature: "disk usage <n>% on /var/log exceeds threshold <n>%", class: "actionable", notes: [], ...over,
});

test("all four specialists run and are recorded in order", async () => {
  const { caseFile } = await proposeMulti(incident(), pack, { provider: "offline" });
  assert.deepEqual(caseFile.turns.map((t) => t.role), ["triage", "diagnosis", "remediation", "reviewer"]);
  assert.ok(caseFile.turns.every((t) => t.ok));
  assert.equal(caseFile.degraded, false);
});

test("each agent's output becomes evidence for the next", async () => {
  const { shown } = await proposeMulti(incident(), pack, { provider: "offline" });
  const kinds = shown.map((e) => e.kind);
  assert.ok(kinds.includes("triage"));
  assert.ok(kinds.includes("diagnosis"));
  assert.ok(kinds.includes("review"));
  assert.ok(shown.every((e) => e.digest.length === 64));
});

test("a correct proposal is confirmed, quoting a real alert line", async () => {
  const { review } = await proposeMulti(incident(), pack, { provider: "offline" });
  assert.equal(review.verdict, "confirm");
  assert.equal(review.quoteVerified, true);
  assert.match(review.quote, /Disk usage/);
});

test("the reviewer catches a plausible but wrong action", async () => {
  const wrong = injectMismatch("rotate-logs", pack);
  assert.notEqual(wrong, "rotate-logs");
  const { review } = await proposeMulti(incident(), pack, { provider: "offline", inject: "mismatch" });
  assert.equal(review.verdict, "dissent");
  assert.match(review.reason, /does not address/);
});

test("a dissent costs the unattended path at the gate", async () => {
  const inc = incident();
  const { proposal, shown, review } = await proposeMulti(inc, pack, { provider: "offline", inject: "mismatch" });
  const v = decide({ proposal, incident: inc, pack, shown, review });
  assert.equal(v.decision, "needs_approval");
  assert.ok(v.reasons.some((r) => /reviewer dissented/.test(r)));
});

test("an unsafe flag from the reviewer rejects outright", async () => {
  const inc = incident();
  const { proposal, shown } = await proposeMulti(inc, pack, { provider: "offline" });
  const v = decide({
    proposal, incident: inc, pack, shown,
    review: { verdict: "dissent", reason: "would worsen the outage", quote: "", unsafe: true, quoteVerified: false },
  });
  assert.equal(v.decision, "reject");
});

test("a confirmation whose quote is not in the evidence is downgraded to dissent", () => {
  const ev = [evidence("alerts", "inc", "Disk usage 86% on /var/log exceeds threshold 85%")];
  assert.equal(quoteIsReal("Disk usage 86% on /var/log exceeds threshold 85%", ev), true);
  assert.equal(quoteIsReal("the disk was definitely full, trust me", ev), false);
});

test("quoting another agent's output is not corroboration", () => {
  const ev = [
    evidence("alerts", "inc", "Disk usage 86% on /var/log exceeds threshold 85%"),
    evidence("diagnosis", "agent:diagnosis", "rootCause=the log volume is filling and has crossed its threshold"),
  ];
  assert.equal(sourceEvidence(ev).length, 1);
  // A quote lifted from the diagnosis the agents themselves wrote must not count.
  assert.equal(quoteIsReal("rootCause=the log volume is filling and has crossed its threshold", ev), false);
});

test("the reviewer dissents when the evidence does not support the diagnosis", () => {
  const ev = [evidence("alerts", "inc", "Some entirely unrelated line about nothing in particular")];
  const inc = incident();
  const triage = { category: "capacity", urgency: "low", summary: "s" };
  const diag = { rootCause: "The log volume is filling.", confidence: 0.9, evidenceGaps: "" };
  const r = offlineReviewer(inc, ev, diag, { remediationId: "rotate-logs", rationale: "r" }, pack, triage);
  assert.equal(r.verdict, "dissent");
});

test("a low-confidence diagnosis is not confirmed", () => {
  const inc = incident();
  const ev = [evidence("alerts", "inc", "[2026-12-01T19:40:00.000Z] WARNING Disk usage 86% on /var/log exceeds threshold 85%")];
  const triage = { category: "capacity", urgency: "low", summary: "s" };
  const r = offlineReviewer(inc, ev, { rootCause: "The log volume is filling.", confidence: 0.3, evidenceGaps: "lots" },
    { remediationId: "rotate-logs", rationale: "r" }, pack, triage);
  assert.equal(r.verdict, "dissent");
});

test("pipeline confidence is the weakest link, not the loudest agent", async () => {
  const { proposal, caseFile } = await proposeMulti(incident(), pack, { provider: "offline" });
  assert.ok(proposal.confidence <= caseFile.diagnosis.confidence);
  assert.ok(proposal.confidence <= caseFile.remediation.confidence);
});

test("an unclassifiable incident produces low confidence and an evidence gap", () => {
  const inc = incident({ service: "mystery-box" });
  const ev = [evidence("alerts", "inc", "something happened and we do not know what")];
  const tri = offlineTriage(inc, ev);
  assert.equal(tri.category, "unknown");
  const diag = offlineDiagnosis(inc, ev, tri);
  assert.ok(diag.confidence < 0.5);
  assert.ok(diag.evidenceGaps.length > 0);
});

test("a failing specialist degrades to the single agent instead of stopping", async () => {
  // bedrock provider with no credentials: every turn fails
  const saved = { k: process.env.AWS_ACCESS_KEY_ID, s: process.env.AWS_SECRET_ACCESS_KEY };
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  try {
    const out = await proposeMulti(incident(), pack, { provider: "bedrock" });
    assert.equal(out.caseFile.degraded, true);
    assert.match(out.caseFile.degradedReason, /triage agent failed/);
    assert.ok(out.proposal.remediationId, "a proposal is still produced");
    assert.equal(out.review.verdict, "dissent", "a degraded run never auto-remediates");
  } finally {
    if (saved.k) process.env.AWS_ACCESS_KEY_ID = saved.k;
    if (saved.s) process.env.AWS_SECRET_ACCESS_KEY = saved.s;
  }
});

test("a degraded run cannot reach unattended execution", async () => {
  const inc = incident();
  const saved = { k: process.env.AWS_ACCESS_KEY_ID, s: process.env.AWS_SECRET_ACCESS_KEY };
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  try {
    const { proposal, shown, review } = await proposeMulti(inc, pack, { provider: "bedrock" });
    const v = decide({ proposal, incident: inc, pack, shown, review });
    assert.notEqual(v.decision, "auto_remediate");
  } finally {
    if (saved.k) process.env.AWS_ACCESS_KEY_ID = saved.k;
    if (saved.s) process.env.AWS_SECRET_ACCESS_KEY = saved.s;
  }
});

test("injected faults only swap in actions that are also auto-approvable", () => {
  // Otherwise the gate would catch the fault and the reviewer would get undue credit.
  const wrong = injectMismatch("rotate-logs", pack);
  const rem = pack.remediations.find((r) => r.id === wrong);
  assert.equal(rem.autoApprove, true);
});

test("triage classifies from symptoms, never from the runbook", () => {
  // Regression: the runbook says "re-run the failed sync batch", so matching
  // symptom keywords across all evidence made every incident look like a job
  // failure. A classifier must not read the cure list.
  const ev = [
    evidence("alerts", "inc", "handler.dispatch() returned control to caller after 12 ms"),
    evidence("runbook", "tenant", "rerun-failed-batch: Re-run the failed sync batch once"),
  ];
  const inc = {
    id: "i", tenantId: "t", service: "report-worker", severity: "error",
    openedAt: "2026-12-01T01:00:00.000Z", lastSeenAt: "2026-12-01T01:10:00.000Z",
    alerts: [{ message: "handler.dispatch() returned control" }], signature: "s",
    class: "actionable", notes: [],
  };
  assert.equal(offlineTriage(inc, ev).category, "unknown");
});

test("an unrecognised pattern is held for a human, not automated", () => {
  const ev = [evidence("alerts", "inc", "handler.dispatch() returned control to caller after 12 ms")];
  const inc = {
    id: "i", tenantId: "t", service: "report-worker", severity: "error",
    openedAt: "2026-12-01T01:00:00.000Z", lastSeenAt: "2026-12-01T01:10:00.000Z",
    alerts: [{ message: "x" }], signature: "s", class: "actionable", notes: [],
  };
  const tri = offlineTriage(inc, ev);
  const diag = offlineDiagnosis(inc, ev, tri);
  assert.equal(tri.category, "unknown");
  assert.ok(diag.confidence < 0.75, "unknown categories must fall below the confidence floor");
});
