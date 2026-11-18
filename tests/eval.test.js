/**
 * Evaluation-level invariants: properties that must hold of the numbers the
 * README publishes, whatever the data or the model does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("verified resolutions can never exceed executions", async () => {
  // A live run reported "4/3" because the numerator counted every result with
  // a verification record, including ticket-only outcomes that executed
  // nothing. The two must be drawn from the same population.
  const { runEval } = await import("../src/eval/run.js");
  for (const set of ["train", "holdout"]) {
    const { metrics } = await runEval({ tenantId: "northwind-msp", provider: "offline", agentMode: "multi", set });
    assert.ok(
      metrics.verifiedResolved <= metrics.executed,
      `${set}: verifiedResolved ${metrics.verifiedResolved} > executed ${metrics.executed}`
    );
  }
});

test("a flag works whether it is written with a space or an equals sign", async () => {
  const { parseFlag } = await import("../src/eval/run.js");
  assert.equal(parseFlag(["--set", "holdout"], "set", "train"), "holdout");
  assert.equal(parseFlag(["--set=holdout"], "set", "train"), "holdout");
  assert.equal(parseFlag([], "set", "train"), "train");
});

test("an unknown flag is refused, not ignored", async () => {
  const { assertKnownFlags } = await import("../src/eval/run.js");
  // The failure this prevents: --set=holdout was dropped by a parser that only
  // understood "--set holdout", so the run measured train and said so.
  assert.doesNotThrow(() => assertKnownFlags(["--set=holdout", "--provider", "offline"]));
  assert.throws(() => assertKnownFlags(["--sett=holdout"]), /Unknown flag --sett/);
  assert.throws(() => assertKnownFlags(["--dataset", "holdout"]), /Unknown flag --dataset/);
});

test("sidecar and hidden files are not mistaken for tenants", async () => {
  // A macOS-built tarball carries "._name.json" AppleDouble files. Extracted on
  // Linux they look like tenants, and their contents start with "Mac OS X", so
  // the static export died on JSON.parse far from the real cause.
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const junk = new URL("../data/tenants/._probe.json", import.meta.url);
  writeFileSync(junk, "Mac OS X\u0000\u0000sidecar junk");
  try {
    const mod = await import(`../src/server.js?tenantprobe=${Date.now()}`);
    assert.ok(Array.isArray(mod.tenants), "server.js should expose its tenant list");
    assert.ok(!mod.tenants.some((t) => t.startsWith(".")), `hidden file became a tenant: ${mod.tenants}`);
    assert.ok(mod.tenants.includes("northwind-msp"));
  } finally {
    unlinkSync(junk);
  }
});
