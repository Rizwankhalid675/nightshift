import { test } from "node:test";
import assert from "node:assert/strict";
import { evidence, receipt, verifyReceipt, inputDigest, sha256 } from "../src/receipts.js";

test("evidence digests its own content", () => {
  const e = evidence("alerts", "inc1", "disk usage 91%");
  assert.equal(e.digest, sha256("disk usage 91%"));
});

test("a receipt verifies against untouched evidence", () => {
  const ev = [evidence("alerts", "inc1", "a"), evidence("runbook", "t1", "b")];
  assert.deepEqual(verifyReceipt(receipt({ incidentId: "inc1", actor: "agent:test", action: "x", evidence: ev })), {
    ok: true, reason: "verified",
  });
});

test("editing evidence after the fact breaks verification", () => {
  const ev = [evidence("alerts", "inc1", "original")];
  const r = receipt({ incidentId: "inc1", actor: "agent:test", action: "x", evidence: ev });
  r.evidence[0].observed = "tampered";
  assert.equal(verifyReceipt(r).ok, false);
});

test("reordering evidence changes the input digest", () => {
  const a = evidence("alerts", "s", "one");
  const b = evidence("alerts", "s", "two");
  assert.notEqual(inputDigest([a, b]), inputDigest([b, a]));
});

test("swapping in different evidence is detected", () => {
  const ev = [evidence("alerts", "inc1", "real")];
  const r = receipt({ incidentId: "inc1", actor: "agent:test", action: "x", evidence: ev });
  r.evidence = [evidence("alerts", "inc1", "substituted")];
  assert.equal(verifyReceipt(r).ok, false);
});
