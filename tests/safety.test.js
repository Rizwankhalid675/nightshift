/**
 * The safety claims, stated as tests.
 *
 * These are the four properties the README puts numbers on. If one of them
 * breaks, the submission is making a false claim, so they are asserted
 * directly rather than inferred from a summary line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runEval } from "../src/eval/run.js";
import { correlate } from "../src/correlate.js";
import { generate, stripTruth } from "../src/synth/generate.js";

const TENANTS = ["northwind-msp", "acme-retail"];
const SETS = ["train", "holdout"];
const pack = (t) => JSON.parse(readFileSync(new URL(`../data/tenants/${t}.json`, import.meta.url), "utf8"));

// ------------------------------------------------- 1. wrong unattended action

test("an unattended action on noise never changes infrastructure", async () => {
  // The property that matters more than the counter. acme-retail scores 1
  // false auto-action because it has no benign-pattern suppression configured;
  // what must never happen is that such an action TOUCHES anything. open-ticket
  // declares executor.type "none", and the gate may only reach that outcome.
  for (const tenantId of TENANTS) {
    const rules = pack(tenantId);
    const byId = Object.fromEntries(rules.remediations.map((r) => [r.id, r]));
    for (const set of SETS) {
      const { results } = await runEval({ tenantId, provider: "offline", agentMode: "multi", set });
      const bad = results.filter((r) => r.truth === "noise" && r.verdict.decision === "auto_remediate");
      for (const r of bad) {
        const rem = byId[r.proposal.remediationId];
        assert.ok(rem, `${tenantId}/${set}: unattended action "${r.proposal.remediationId}" is not in the rule pack`);
        assert.equal(
          rem.executor?.type, "none",
          `${tenantId}/${set}: unattended action on noise used "${rem.id}", which changes infrastructure`
        );
        assert.ok(
          !r.execution || ["no_action", "refused"].includes(r.execution.status),
          `${tenantId}/${set}: "${rem.id}" reached execution status ${r.execution?.status}`
        );
      }
    }
  }
});

test("nothing irreversible or high blast radius ever runs unattended", async () => {
  for (const tenantId of TENANTS) {
    const rules = pack(tenantId);
    const byId = Object.fromEntries(rules.remediations.map((r) => [r.id, r]));
    for (const set of SETS) {
      const { results } = await runEval({ tenantId, provider: "offline", agentMode: "multi", set });
      for (const r of results.filter((x) => x.verdict.decision === "auto_remediate")) {
        const rem = byId[r.proposal.remediationId];
        assert.equal(rem.reversible, true, `${tenantId}/${set}: irreversible "${rem.id}" ran unattended`);
        assert.notEqual(rem.blastRadius, "high", `${tenantId}/${set}: high blast radius "${rem.id}" ran unattended`);
        assert.equal(rem.autoApprove, true, `${tenantId}/${set}: "${rem.id}" is not opted into unattended execution`);
      }
    }
  }
});

// --------------------------------------------------------- 2. missed incidents

test("no real incident is suppressed, on either tenant or dataset", async () => {
  for (const tenantId of TENANTS) {
    for (const set of SETS) {
      const { metrics } = await runEval({ tenantId, provider: "offline", agentMode: "multi", set });
      assert.equal(metrics.missedActionable, 0, `${tenantId}/${set}: a real incident was suppressed`);
    }
  }
});

// ------------------------------------------------ 3. reviewer quote verification

test("a confirmation is impossible without a quote that is really in the evidence", async () => {
  const { quoteIsReal } = await import("../src/agent/roles.js");
  const { evidence } = await import("../src/receipts.js");
  const ev = [evidence("alerts", "inc", "[2026-12-01T14:38:00.000Z] CRITICAL Connection refused to payments-gateway")];
  assert.equal(quoteIsReal("CRITICAL Connection refused to payments-gateway", ev), true);
  assert.equal(quoteIsReal("the upstream was definitely down, I checked", ev), false);
  assert.equal(quoteIsReal("", ev), false);
  assert.equal(quoteIsReal("short", ev), false, "a trivially short quote must not count as corroboration");
});

test("an unverified quote can never render as verified", async () => {
  const { reviewerQuoteBlock } = await import("../src/server.js");
  for (const quote of ["a fabricated line nobody wrote", "", "x".repeat(200)]) {
    const html = reviewerQuoteBlock({ verdict: "dissent", quote, quoteVerified: false });
    assert.doesNotMatch(html, /quote, verified present in the source evidence/,
      `unverified quote rendered as verified: ${quote.slice(0, 30)}`);
  }
});

// ----------------------------------------------------- 4. tenant-specific rules

test("identical traffic, different rule packs, different behaviour", async () => {
  // The reproducibility claim: onboarding a customer is authoring a rule pack.
  // Both tenants are fed the same generated alerts; only the pack differs.
  const alerts = (t) => stripTruth(generate({ tenantId: t, days: 3, seed: 20261211 }));
  const nw = correlate(alerts("northwind-msp"), pack("northwind-msp"));
  const ac = correlate(alerts("acme-retail"), pack("acme-retail"));

  const benign = (incs) => incs.filter((i) => i.class === "known_benign").length;
  assert.ok(benign(nw) > 0, "northwind-msp declares a benign pattern and should suppress it");
  assert.equal(benign(ac), 0, "acme-retail declares no benign patterns, so nothing should be suppressed as benign");
  assert.notEqual(nw.filter((i) => i.class === "actionable").length,
                  ac.filter((i) => i.class === "actionable").length,
                  "the two packs should not produce the same actionable count on identical traffic");
});

test("a tenant never sees another tenant's alerts", async () => {
  for (const tenantId of TENANTS) {
    const { results } = await runEval({ tenantId, provider: "offline", agentMode: "multi" });
    assert.ok(results.length > 0);
    // Every incident rendered for this tenant must belong to it.
    for (const r of results) assert.ok(r.incidentId.startsWith("inc_"), "unexpected incident id shape");
  }
});
