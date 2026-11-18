import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProposal, buildEvidence, offlineProposer, propose } from "../src/agent/index.js";

const pack = JSON.parse(readFileSync(new URL("../data/tenants/northwind-msp.json", import.meta.url), "utf8"));
const incident = {
  id: "inc1", tenantId: "northwind-msp", service: "log-collector", severity: "warning",
  openedAt: "2026-12-01T19:40:00.000Z", lastSeenAt: "2026-12-01T19:50:00.000Z",
  alerts: [{ id: "a1", tenantId: "northwind-msp", source: "cloudwatch", service: "log-collector",
             severity: "warning", message: "Disk usage 91% on /var/log exceeds threshold 85%", at: "2026-12-01T19:40:00.000Z" }],
  signature: "sig", class: "actionable", notes: [],
};

test("the model is shown the alerts and the runbook, and nothing else", () => {
  const ev = buildEvidence(incident, pack);
  assert.deepEqual(ev.map((e) => e.kind), ["alerts", "runbook"]);
  assert.ok(ev[1].observed.includes("rotate-logs"));
});

test("the offline baseline picks a sane remediation it is allowed to pick", () => {
  const ev = buildEvidence(incident, pack);
  const p = offlineProposer(incident, pack, ev);
  assert.equal(p.remediationId, "rotate-logs");
  assert.ok(pack.remediations.some((r) => r.id === p.remediationId));
});

test("the baseline never names an action missing from a tenant's pack", () => {
  const thin = { ...pack, remediations: [pack.remediations.find((r) => r.id === "open-ticket")] };
  const p = offlineProposer(incident, thin, buildEvidence(incident, thin));
  assert.equal(p.remediationId, "open-ticket");
});

test("model output is parsed strictly", () => {
  const good = '{"diagnosis":"d","remediationId":"rotate-logs","confidence":0.9,"citations":["x"]}';
  assert.equal(parseProposal(good, incident, "m").remediationId, "rotate-logs");
  assert.throws(() => parseProposal("no json here", incident, "m"), /did not return a JSON object/);
  assert.throws(() => parseProposal('{"diagnosis":"d"}', incident, "m"), /missing "remediationId"/);
});

test("confidence is clamped, not trusted", () => {
  const p = parseProposal('{"diagnosis":"d","remediationId":"r","confidence":9,"citations":[]}', incident, "m");
  assert.equal(p.confidence, 1);
});

test("the offline provider runs with no credentials and no network", async () => {
  const { proposal, shown } = await propose(incident, pack, { provider: "offline" });
  assert.equal(proposal.model, "offline:rules-v1");
  assert.ok(shown.length >= 2);
});

test("an unknown provider fails loudly", async () => {
  await assert.rejects(() => propose(incident, pack, { provider: "openai" }), /Unknown AGENT_PROVIDER/);
});
