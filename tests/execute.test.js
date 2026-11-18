/**
 * The executor is the only component that can change a customer's
 * infrastructure. These tests are the argument that it is safe to let it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execute, authorise, interpolate, Ledger, verifyResolution, recordVerification } from "../src/execute/index.js";
import { verifyReceipt } from "../src/receipts.js";

const pack = JSON.parse(readFileSync(new URL("../data/tenants/northwind-msp.json", import.meta.url), "utf8"));

const incident = (over = {}) => ({
  id: "inc_test", tenantId: "northwind-msp", service: "log-collector", severity: "warning",
  openedAt: "2026-12-01T19:40:00.000Z", lastSeenAt: "2026-12-01T19:50:00.000Z",
  alerts: [], signature: "disk usage <n>% on /var/log exceeds threshold <n>%",
  class: "actionable", notes: [], ...over,
});

test("dry-run is the default: nothing is sent without EXECUTOR_MODE=live", async () => {
  const rec = await execute({ incident: incident(), remediationId: "rotate-logs", pack, ledger: new Ledger() });
  assert.equal(rec.mode, "dry-run");
  assert.equal(rec.status, "dry_run");
  assert.equal(rec.target.type, "ssm.sendCommand");
});

test("the executor re-authorises from the rule pack and ignores a forged verdict", async () => {
  // A caller claims the gate approved a failover. The executor does not care.
  const rec = await execute({
    incident: incident(), remediationId: "failover-primary", pack, ledger: new Ledger(),
    decisionReceipt: { inputDigest: "deadbeef" }, mode: "live",
  });
  assert.equal(rec.status, "refused");
  assert.match(rec.reason, /irreversible/);
});

test("a high blast radius action is refused unattended", () => {
  const r = authorise({ incident: incident(), remediationId: "failover-primary", pack });
  assert.equal(r.ok, false);
});

test("a critical incident is refused unattended, even for a safe action", () => {
  const r = authorise({ incident: incident({ severity: "critical" }), remediationId: "rotate-logs", pack });
  assert.equal(r.ok, false);
  assert.match(r.reason, /critical/);
});

test("noise is never executed against", () => {
  for (const cls of ["known_benign", "flapping", "suppressed_window"]) {
    const r = authorise({ incident: incident({ class: cls }), remediationId: "rotate-logs", pack });
    assert.equal(r.ok, false, `${cls} must not be executable`);
  }
});

test("a human approval unlocks an action the tenant did not auto-approve", () => {
  const unattended = authorise({ incident: incident(), remediationId: "restart-service", pack });
  assert.equal(unattended.ok, false);
  const approved = authorise({ incident: incident(), remediationId: "restart-service", pack, approval: { approvedBy: "operator" } });
  assert.equal(approved.ok, true);
});

test("even a human must acknowledge irreversibility explicitly", () => {
  const plain = authorise({ incident: incident(), remediationId: "failover-primary", pack, approval: { approvedBy: "operator" } });
  assert.equal(plain.ok, false);
  const ack = authorise({
    incident: incident(), remediationId: "failover-primary", pack,
    approval: { approvedBy: "operator", acknowledgedIrreversible: true },
  });
  assert.equal(ack.ok, true);
});

test("execution is idempotent per incident and remediation", async () => {
  const ledger = new Ledger();
  const first = await execute({ incident: incident(), remediationId: "rotate-logs", pack, ledger });
  const second = await execute({ incident: incident(), remediationId: "rotate-logs", pack, ledger });
  assert.equal(first.repeated, false);
  assert.equal(second.repeated, true);
  assert.equal(ledger.all().length, 1);
  assert.equal(second.at, first.at, "the repeat returns the original record, not a new one");
});

test("a remediation with no executor records intent and touches nothing", async () => {
  const rec = await execute({ incident: incident(), remediationId: "open-ticket", pack, ledger: new Ledger(), mode: "live" });
  assert.equal(rec.status, "no_action");
});

test("placeholders are interpolated into the SSM call", () => {
  const out = interpolate(
    { type: "ssm.sendCommand", parameters: { commands: ["restart {{service}} for {{incidentId}}"] } },
    incident()
  );
  assert.equal(out.parameters.commands[0], "restart log-collector for inc_test");
});

test("every execution record carries a verifiable receipt", async () => {
  const rec = await execute({ incident: incident(), remediationId: "rotate-logs", pack, ledger: new Ledger() });
  assert.equal(verifyReceipt(rec.receipt).ok, true);
  assert.match(rec.receipt.action, /^execute:rotate-logs:/);
});

test("the execution receipt chains to the decision receipt that authorised it", async () => {
  const rec = await execute({
    incident: incident(), remediationId: "rotate-logs", pack, ledger: new Ledger(),
    decisionReceipt: { inputDigest: "abc123" },
  });
  assert.equal(rec.prevDigest, "abc123");
  assert.ok(rec.receipt.evidence.some((e) => e.observed.includes("abc123")));
});

test("verification says resolved when the alert stops recurring", () => {
  const v = verifyResolution(incident(), [], 1800);
  assert.equal(v.resolved, true);
  assert.equal(v.recurrences, 0);
});

test("verification catches a remediation that did not hold", () => {
  const inc = incident();
  const later = [{
    id: "a9", tenantId: "northwind-msp", service: "log-collector", severity: "warning",
    message: "Disk usage 92% on /var/log exceeds threshold 85%", at: "2026-12-01T20:05:00.000Z",
  }];
  const v = verifyResolution(inc, later, 1800);
  assert.equal(v.resolved, false);
  assert.equal(v.recurrences, 1);
});

test("alerts outside the verification window do not count as a recurrence", () => {
  const later = [{
    id: "a9", tenantId: "northwind-msp", service: "log-collector", severity: "warning",
    message: "Disk usage 92% on /var/log exceeds threshold 85%", at: "2026-12-02T20:05:00.000Z",
  }];
  assert.equal(verifyResolution(incident(), later, 1800).resolved, true);
});

test("another tenant's recurrence is not attributed to this incident", () => {
  const later = [{
    id: "a9", tenantId: "acme-retail", service: "log-collector", severity: "warning",
    message: "Disk usage 92% on /var/log exceeds threshold 85%", at: "2026-12-01T19:55:00.000Z",
  }];
  assert.equal(verifyResolution(incident(), later, 1800).resolved, true);
});

test("a verified execution gets its own receipt", async () => {
  const rec = await execute({ incident: incident(), remediationId: "rotate-logs", pack, ledger: new Ledger() });
  recordVerification(rec, verifyResolution(incident(), []), incident());
  assert.equal(rec.verification.resolved, true);
  assert.equal(verifyReceipt(rec.verificationReceipt).ok, true);
});

test("live mode without credentials fails loudly, never silently 'succeeds'", async () => {
  const saved = { k: process.env.AWS_ACCESS_KEY_ID, s: process.env.AWS_SECRET_ACCESS_KEY };
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  try {
    const rec = await execute({ incident: incident(), remediationId: "rotate-logs", pack, ledger: new Ledger(), mode: "live" });
    assert.equal(rec.status, "failed");
    assert.match(rec.reason, /No AWS credentials/);
  } finally {
    if (saved.k) process.env.AWS_ACCESS_KEY_ID = saved.k;
    if (saved.s) process.env.AWS_SECRET_ACCESS_KEY = saved.s;
  }
});

test("every remediation that can auto-execute documents how to undo it", () => {
  for (const r of pack.remediations) {
    if (r.autoApprove && r.executor && r.executor.type !== "none") {
      assert.ok(r.executor.undo && r.executor.undo.length > 10, `${r.id} must document its undo path`);
    }
  }
});
