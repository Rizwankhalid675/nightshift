/**
 * Console rendering.
 *
 * These exist because the deployed console contradicted itself. On a live
 * Bedrock run the reviewer dissented with "its supporting quote is not present
 * in the evidence", and three lines below, the page labelled that very quote
 * "verified present in the source evidence" — because the template branched on
 * whether a quote existed rather than whether it verified. A fabricating model
 * still supplies a quote.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewerQuoteBlock } from "../src/server.js";

const QUOTE = "[2026-12-01T14:38:00.000Z] CRITICAL Connection refused to payments-gateway upstream";

test("a verified quote is presented as corroboration", () => {
  const html = reviewerQuoteBlock({ verdict: "confirm", quote: QUOTE, quoteVerified: true });
  assert.match(html, /verified present in the source evidence/);
  assert.ok(html.includes(QUOTE));
  assert.doesNotMatch(html, /NOT in the source evidence/);
});

test("an unverified quote is never labelled verified", () => {
  const html = reviewerQuoteBlock({ verdict: "dissent", quote: QUOTE, quoteVerified: false });
  assert.match(html, /NOT in the source evidence/);
  assert.doesNotMatch(html, /quote, verified present/);
});

test("an unverified quote is still shown, and marked as a warning", () => {
  // What the model claimed to be quoting is the interesting part; hiding it
  // would lose the only on-screen evidence that it fabricated a citation.
  const html = reviewerQuoteBlock({ verdict: "dissent", quote: QUOTE, quoteVerified: false });
  assert.ok(html.includes(QUOTE));
  assert.match(html, /class="[^"]*warn/);
});

test("no quote at all says so plainly", () => {
  const html = reviewerQuoteBlock({ verdict: "dissent", quote: "", quoteVerified: false });
  assert.match(html, /no supporting quote was offered/);
  assert.doesNotMatch(html, /verified present in the source evidence/);
});

test("the quote is escaped, so evidence text cannot inject markup", () => {
  const html = reviewerQuoteBlock({ verdict: "confirm", quote: "<script>x</script>", quoteVerified: true });
  assert.doesNotMatch(html, /<script>/);
});

test("a zero false-auto counter adds no explanatory block", async () => {
  const { falseAutoDetail } = await import("../src/server.js");
  const data = { results: [{ truth: "actionable", verdict: { decision: "auto_remediate" }, incidentId: "i", service: "s" }] };
  assert.equal(falseAutoDetail("t", data), "");
});

test("a non-zero false-auto counter names the incident and the action", async () => {
  const { falseAutoDetail } = await import("../src/server.js");
  const data = {
    results: [{
      truth: "noise",
      verdict: { decision: "auto_remediate" },
      incidentId: "inc_abc",
      service: "catalog-sync",
      proposal: { remediationId: "open-ticket" },
      execution: { status: "no_action" },
    }],
  };
  const html = falseAutoDetail("acme-retail", data);
  assert.match(html, /catalog-sync/);
  assert.match(html, /open-ticket/);
  assert.match(html, /no infrastructure change/);
  assert.match(html, /inc_abc/);
});

test("an action that really changed infrastructure is called that, not softened", async () => {
  const { falseAutoDetail } = await import("../src/server.js");
  const data = {
    results: [{
      truth: "noise",
      verdict: { decision: "auto_remediate" },
      incidentId: "inc_x",
      service: "billing",
      proposal: { remediationId: "restart-service" },
      execution: { status: "succeeded" },
    }],
  };
  assert.match(falseAutoDetail("t", data), /changed infrastructure/);
});
