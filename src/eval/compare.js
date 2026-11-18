/**
 * compare.js — single agent vs four agents, with and without an injected fault.
 *
 * This is the table in the README, generated rather than typed, so it cannot
 * drift from the code. With --assert it becomes a CI check: the reviewer must
 * catch every injected fault, and must raise no false dissents on a clean run.
 *
 *   node src/eval/compare.js
 *   node src/eval/compare.js --assert
 */
import { runEval } from "./run.js";

const tenantId = process.argv.includes("--tenant")
  ? process.argv[process.argv.indexOf("--tenant") + 1]
  : "northwind-msp";
const assertMode = process.argv.includes("--assert");
const provider = process.env.AGENT_PROVIDER || "offline";

const cell = (m) => ({
  auto: m.autoRemediated,
  held: m.needsApproval,
  dissents: m.reviewerDissents ?? 0,
});

const rows = [];
for (const mode of ["single", "multi"]) {
  const clean = await runEval({ tenantId, provider, agentMode: mode });
  const faulted = await runEval({ tenantId, provider, agentMode: mode, inject: "mismatch" });
  rows.push({ mode, clean: cell(clean.metrics), faulted: cell(faulted.metrics) });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n  ${tenantId} · provider ${provider}\n`);
console.log(`  ${pad("pipeline", 10)} ${pad("clean run", 34)} with --inject mismatch`);
console.log("  " + "-".repeat(76));
for (const r of rows) {
  console.log(
    `  ${pad(r.mode, 10)} ${pad(`${r.clean.auto} auto, ${r.clean.held} held, ${r.clean.dissents} dissents`, 34)}` +
      `${r.faulted.auto} wrong actions would run, ${r.faulted.dissents} dissents`
  );
}
console.log("");

if (assertMode) {
  const single = rows.find((r) => r.mode === "single");
  const multi = rows.find((r) => r.mode === "multi");
  const problems = [];
  if (multi.clean.dissents !== 0) {
    problems.push(`reviewer raised ${multi.clean.dissents} false dissent(s) on a clean run`);
  }
  if (multi.faulted.auto !== 0) {
    problems.push(`${multi.faulted.auto} injected fault(s) reached unattended execution`);
  }
  if (single.faulted.auto <= multi.faulted.auto) {
    problems.push("the fault is not actually dangerous: the single agent caught it too, so this proves nothing");
  }
  if (problems.length) {
    console.error("  COMPARE FAILED:");
    for (const p of problems) console.error(`    - ${p}`);
    console.error("");
    process.exit(1);
  }
  console.log(`  OK: single agent would run ${single.faulted.auto} wrong actions, multi-agent runs ${multi.faulted.auto}.\n`);
}
