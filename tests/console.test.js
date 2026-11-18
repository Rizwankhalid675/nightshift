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

test("the dashboard shows exactly the metrics the run produced", async () => {
  // Closes the loop between backend and what a judge sees: no tile is
  // computed twice or typed by hand.
  const { runEval } = await import("../src/eval/run.js");
  const { dashboard } = await import("../src/server.js");
  const data = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
  data.approvals = new Map();
  const html = dashboard("northwind-msp", data);
  const m = data.metrics;
  const reduction = ((1 - m.actionable / m.alertsIn) * 100).toFixed(1);

  for (const [value, label] of [
    [m.alertsIn, "alerts ingested"],
    [m.incidentsOut, "incidents after correlation"],
    [m.actionable, "paged to a human"],
    [`${reduction}%`, "noise removed"],
    [m.falseAutoRemediations, "false auto-actions"],
    [m.missedActionable, "real incidents missed"],
  ]) {
    assert.ok(html.includes(`>${value}</div>`), `tile "${label}" does not show ${value}`);
    assert.ok(html.includes(label), `tile label "${label}" missing`);
  }

  // The footer must name the run, so a screenshot is traceable to an artefact.
  assert.ok(html.includes(m.runId), "the dashboard does not name the run id");
  assert.ok(html.includes(m.model), "the dashboard does not name the model");
});

test("the nowrap column rule applies only to the incidents table", async () => {
  // Regression: this rule was written unscoped, so it also hit the suppressed
  // table ("Why") and the agent-handoff table ("Said") — both prose columns.
  // nowrap pushed the handoff text off the right edge of the page.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const rules = src.split("\n").filter((l) => l.includes("nth-last-child"));
  assert.ok(rules.length > 0, "the column rule disappeared");
  for (const r of rules) {
    assert.ok(
      r.includes("table.incidents"),
      `an unscoped nth-last-child rule will hit every table on the page: ${r.trim()}`
    );
  }
  // And the table that needs it must actually carry the class.
  assert.ok(src.includes('<table class="incidents">'), "the incidents table lost its class");
});

test("prose columns are never forced onto one line", async () => {
  const { runEval } = await import("../src/eval/run.js");
  const { incidentPage } = await import("../src/server.js");
  const data = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi" });
  data.approvals = new Map();
  const html = incidentPage("northwind-msp", data, data.results[0].incidentId);
  // The handoff table must not be given the incidents class.
  const handoff = html.slice(html.indexOf("Agent handoff"));
  assert.ok(!handoff.slice(0, 400).includes('class="incidents"'),
    "the agent-handoff table must not inherit the incidents column rule");
});
