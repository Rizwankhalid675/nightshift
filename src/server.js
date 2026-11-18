/**
 * server.js — the on-call console. Zero dependencies, node:http only.
 *
 * It is the whole loop in one place: what came in, what the rules did with it,
 * what the model proposed, what the gate decided, and what a human still has to
 * approve — with the receipt for every one of those steps.
 *
 *   node src/server.js            # http://localhost:3000
 *   PORT=8080 AGENT_PROVIDER=bedrock node src/server.js
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { runEval } from "./eval/run.js";
import { receipt, verifyReceipt, short } from "./receipts.js";
import { execute, Ledger, verifyResolution, recordVerification } from "./execute/index.js";
import { defaultStore } from "./store.js";

const PORT = Number(process.env.PORT || 3000);
const PROVIDER = process.env.AGENT_PROVIDER || "offline";

// Every .json here is a tenant, except the junk other systems leave behind.
// Dotfiles are excluded deliberately: a tarball built on macOS carries an
// AppleDouble sidecar ("._northwind-msp.json") for any file with extended
// attributes, and on Linux that extracts as a real file whose contents begin
// "Mac OS X". Enumerating it as a tenant crashed the static export with
// `"Ma"... is not valid JSON`, a long way from the actual cause.
const tenants = readdirSync(new URL("../data/tenants/", import.meta.url))
  .filter((f) => f.endsWith(".json") && !f.startsWith("."))
  .map((f) => f.replace(/\.json$/, ""));

/** @type {Map<string, any>} */
const state = new Map();

async function load(tenantId) {
  const out = await runEval({ tenantId, provider: PROVIDER });
  out.ledger = new Ledger();

  // Replay approvals recorded by earlier processes. Incident ids are derived
  // from tenant + signature + first-alert timestamp, so they are stable across
  // restarts and a stored approval still matches its incident.
  const stored = defaultStore.approvalsFor(tenantId);
  out.approvals = new Map([...stored].map(([id, rec]) => [id, rec.approvedBy]));
  let replayed = 0;
  for (const [incidentId, rec] of stored) {
    const r = out.results.find((x) => x.incidentId === incidentId);
    if (!r) continue;
    r.approvalReceipt = receipt({
      incidentId, actor: `human:${rec.approvedBy}`,
      action: `approved:${rec.remediationId}`, evidence: r.receipt.evidence,
      approvedBy: rec.approvedBy, at: rec.at,
    });
    replayed++;
  }
  if (replayed) console.log(`  replayed ${replayed} stored approval(s) for ${tenantId}`);

  state.set(tenantId, out);
  return out;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:root{--bg:#0d1117;--panel:#151b23;--line:#242c38;--ink:#e6edf3;--mut:#8b949e;
--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#58a6ff;--radius:10px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
header{border-bottom:1px solid var(--line);padding:14px 24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;background:var(--panel)}
.brand{font-weight:700;letter-spacing:-.02em;font-size:16px}
.brand span{color:var(--mut);font-weight:400;margin-left:8px;font-size:13px}
main{max-width:1180px;margin:0 auto;padding:22px 24px 60px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px}
.kpi .n{font-size:26px;font-weight:700;letter-spacing:-.02em}
.kpi .l{color:var(--mut);font-size:12px;margin-top:2px}
.kpi.good .n{color:var(--ok)}.kpi.hold .n{color:var(--warn)}.kpi.bad .n{color:var(--bad)}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1b222c}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;border:1px solid}
.p-auto{color:var(--ok);border-color:#1f4a2a;background:#0f2416}
.p-hold{color:var(--warn);border-color:#4a3b12;background:#241d0f}
.p-rej{color:var(--bad);border-color:#4a1f1f;background:#240f0f}
.p-noise{color:var(--mut);border-color:var(--line);background:#161c24}
.p-crit{color:var(--bad);border-color:#4a1f1f}
.sev{font-size:11px;color:var(--mut)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin-bottom:16px}
.card h2{margin:0 0 10px;font-size:14px;letter-spacing:-.01em}
pre{background:#0b0f14;border:1px solid var(--line);border-radius:8px;padding:11px 13px;overflow-x:auto;
font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d1d9;white-space:pre-wrap;word-break:break-word}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--mut)}
/* An unverified reviewer quote must not look like corroborating evidence. */
.mono.warn{color:var(--warn,#d29922)}
pre.warn{border-color:#5a4214;background:#1c1710}
ul.reasons{margin:6px 0 0;padding-left:18px}ul.reasons li{margin:3px 0}
button{background:var(--acc);color:#04121f;border:0;border-radius:7px;padding:8px 14px;font-weight:650;cursor:pointer;font-size:13px}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
button:hover{filter:brightness(1.08)}
form{display:inline}
.empty{color:var(--mut);text-align:center;padding:40px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius)}
.tabs{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.tab{padding:5px 11px;border:1px solid var(--line);border-radius:7px;font-size:12px;color:var(--mut)}
.tab.on{color:var(--ink);border-color:var(--acc)}
.note{color:var(--mut);font-size:12px;margin-top:14px}
@media(max-width:640px){main{padding:16px}td,th{padding:8px}.kpi .n{font-size:21px}}
`;

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · NightShift</title>
<style>${CSS}</style></head><body>${body}</body></html>`;

const header = (tenantId) => `<header>
<div class="brand">NightShift<span>agentic on-call triage</span></div>
<div class="tabs">${tenants
  .map((t) => `<a class="tab ${t === tenantId ? "on" : ""}" href="/?tenant=${encodeURIComponent(t)}">${esc(t)}</a>`)
  .join("")}</div></header>`;

const verdictPill = (d) =>
  d === "auto_remediate" ? '<span class="pill p-auto">auto-remediated</span>'
  : d === "needs_approval" ? '<span class="pill p-hold">needs approval</span>'
  : '<span class="pill p-rej">rejected</span>';

/**
 * How the reviewer's quote is presented.
 *
 * Branch on whether the quote VERIFIED, never on whether one exists. A model
 * that fabricates a citation still supplies a quote — a non-empty one — so
 * keying off presence printed "verified present in the source evidence" three
 * lines under a dissent saying the opposite. That contradiction appeared on a
 * live run and on the deployed console, in the exact panel this project asks
 * to be trusted on.
 *
 * The unverified case shows the quote rather than hiding it: what the model
 * claimed to be quoting is the interesting part.
 */
export function reviewerQuoteBlock(review) {
  if (review.quote && review.quoteVerified) {
    return `<p class="mono">supporting quote, verified present in the source evidence:</p><pre>${esc(review.quote)}</pre>`;
  }
  if (review.quote) {
    return `<p class="mono warn">the quote it offered is NOT in the source evidence — this is why it did not confirm:</p><pre class="warn">${esc(review.quote)}</pre>`;
  }
  return '<p class="mono">no supporting quote was offered — this is why it did not confirm</p>';
}

export function dashboard(tenantId, data) {
  const m = data.metrics;
  const reduction = ((1 - m.actionable / m.alertsIn) * 100).toFixed(1);
  const kpi = (n, l, cls = "") => `<div class="kpi ${cls}"><div class="n">${n}</div><div class="l">${l}</div></div>`;

  const rows = data.results.map((r) => {
    const approved = data.approvals.get(r.incidentId);
    return `<tr>
      <td><a href="/incident/${esc(r.incidentId)}?tenant=${esc(tenantId)}"><strong>${esc(r.service)}</strong></a>
          <div class="sev">${esc(r.severity)} · ${r.alertCount} alerts collapsed</div></td>
      <td>${esc(r.proposal.diagnosis)}</td>
      <td class="mono">${esc(r.verdict.remediationId)}</td>
      <td>${approved ? '<span class="pill p-auto">approved by ' + esc(approved) + "</span>" : verdictPill(r.verdict.decision)}</td>
    </tr>`;
  }).join("");

  const noise = data.incidents.filter((i) => i.class !== "actionable");
  const noiseRows = noise.map((i) => `<tr>
      <td><strong>${esc(i.service)}</strong><div class="sev">${i.alerts.length} alerts</div></td>
      <td>${esc(i.notes[0] ?? "")}</td>
      <td><span class="pill p-noise">${esc(i.class.replace(/_/g, " "))}</span></td>
    </tr>`).join("");

  return page(`${tenantId} dashboard`, header(tenantId) + `<main>
    <div class="kpis">
      ${kpi(m.alertsIn, "alerts ingested")}
      ${kpi(m.incidentsOut, "incidents after correlation")}
      ${kpi(m.actionable, "paged to a human", "hold")}
      ${kpi(reduction + "%", "noise removed", "good")}
      ${kpi(m.falseAutoRemediations, "false auto-actions", m.falseAutoRemediations ? "bad" : "good")}
      ${kpi(m.missedActionable, "real incidents missed", m.missedActionable ? "bad" : "good")}
    </div>

    <div class="card"><h2>Actionable incidents</h2>
      ${data.results.length
        ? `<table><tr><th>Service</th><th>Diagnosis (model)</th><th>Remediation</th><th>Gate</th></tr>${rows}</table>`
        : '<div class="empty">Nothing to action. Quiet shift.</div>'}
    </div>

    <div class="card"><h2>Suppressed by the deterministic layer — never shown to the model</h2>
      ${noise.length
        ? `<table><tr><th>Service</th><th>Why</th><th>Class</th></tr>${noiseRows}</table>`
        : '<div class="empty">Nothing suppressed for this tenant. If that surprises you, this tenant has no benign patterns declared yet.</div>'}
      <div class="note">Model: ${esc(m.model)} · run ${esc(m.runId)} · rule pack <span class="mono">data/tenants/${esc(tenantId)}.json</span></div>
    </div>
  </main>`);
}

export function incidentPage(tenantId, data, id) {
  const r = data.results.find((x) => x.incidentId === id);
  if (!r) return null;
  const inc = data.incidents.find((i) => i.id === id);
  const v = verifyReceipt(r.receipt);
  const approved = data.approvals.get(id);

  return page(`${r.service} incident`, header(tenantId) + `<main>
    <p><a href="/?tenant=${esc(tenantId)}">&larr; all incidents</a></p>
    <div class="card">
      <h2>${esc(r.service)} · ${esc(r.severity)} · ${r.alertCount} alerts collapsed into one incident</h2>
      <p>${esc(r.proposal.diagnosis)}</p>
      <p class="mono">root cause hypothesis: ${esc(r.proposal.rootCauseHypothesis || "n/a")}</p>
    </div>

    <div class="card"><h2>What the model was shown — and nothing else</h2>
      ${r.receipt.evidence.map((e) => `<p class="mono">${esc(e.kind)} from ${esc(e.source)} · sha256 ${esc(short(e.digest))}</p><pre>${esc(e.observed)}</pre>`).join("")}
    </div>

    ${r.caseFile ? `<div class="card"><h2>Agent handoff${
      r.caseFile.degraded ? ' <span class="pill p-hold">degraded to single agent</span>' : ""
    }</h2>
      ${r.caseFile.degraded ? `<p class="mono">${esc(r.caseFile.degradedReason ?? "")}</p>` : ""}
      <table><tr><th>Agent</th><th>Said</th><th>Model</th></tr>
      ${r.caseFile.turns.map((tn) => {
        const o = tn.output ?? {};
        const said = !tn.ok ? `failed: ${tn.error ?? ""}`
          : tn.role === "triage" ? `${o.category} · urgency ${o.urgency}`
          : tn.role === "diagnosis" ? `${o.rootCause} (confidence ${o.confidence})${o.evidenceGaps ? ` · gaps: ${o.evidenceGaps}` : ""}`
          : tn.role === "remediation" ? `${o.remediationId} — ${o.rationale ?? ""}`
          : `${o.verdict}: ${o.reason ?? ""}`;
        return `<tr><td><strong>${esc(tn.role)}</strong></td><td>${esc(said)}</td>
          <td class="mono">${esc(tn.model)} · ${tn.ms}ms</td></tr>`;
      }).join("")}
      </table>
      ${r.review ? `<p style="margin-top:12px">Reviewer <span class="pill ${
        r.review.verdict === "confirm" ? "p-auto" : "p-hold"
      }">${esc(r.review.verdict)}</span> ${esc(r.review.reason)}</p>
      ${reviewerQuoteBlock(r.review)}` : ""}
    </div>` : ""}

    <div class="card"><h2>Proposal</h2>
      <p class="mono">model ${esc(r.proposal.model)} · self-reported confidence ${r.proposal.confidence.toFixed(2)}</p>
      <p>Proposed remediation: <span class="mono">${esc(r.proposal.remediationId)}</span></p>
      <p class="mono">citations verified against the evidence shown: ${r.verdict.citationsValid ? "yes" : "NO — proposal rejected"}</p>
    </div>

    <div class="card"><h2>Gate decision ${verdictPill(r.verdict.decision)}</h2>
      <ul class="reasons">${r.verdict.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${r.verdict.decision === "needs_approval" && !approved
        ? `<p style="margin-top:14px">
             <form method="POST" action="/approve"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="tenant" value="${esc(tenantId)}">
             <button type="submit">Approve ${esc(r.verdict.remediationId)}</button></form>
             <form method="POST" action="/decline"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="tenant" value="${esc(tenantId)}">
             <button class="ghost" type="submit">Decline</button></form></p>`
        : approved ? `<p class="mono" style="margin-top:12px">approved by ${esc(approved)}</p>` : ""}
    </div>

    ${r.execution ? `<div class="card"><h2>Execution <span class="pill ${
      r.execution.status === "succeeded" ? "p-auto" : r.execution.status === "refused" ? "p-rej" : "p-hold"
    }">${esc(r.execution.status.replace(/_/g, " "))}</span></h2>
      <p class="mono">mode ${esc(r.execution.mode)} · authorised by ${esc(r.execution.authorisedBy)}${
        r.execution.prevDigest ? ` · chained to decision ${esc(short(r.execution.prevDigest))}` : ""
      }</p>
      ${r.execution.reason ? `<p class="mono">${esc(r.execution.reason)}</p>` : ""}
      ${r.execution.target && r.execution.target.type !== "none"
        ? `<pre>${esc(JSON.stringify(r.execution.target, null, 2))}</pre>
           ${r.execution.target.undo ? `<p class="mono">undo: ${esc(r.execution.target.undo)}</p>` : ""}`
        : '<p class="mono">no infrastructure call for this remediation</p>'}
      ${r.execution.verification
        ? `<p class="mono">${r.execution.mode === "live" ? "verified" : "observed"}: ${
            r.execution.verification.resolved ? "did not recur" : r.execution.verification.recurrences + " recurrence(s)"
          } within ${r.execution.verification.windowSec}s${
            r.execution.mode === "live" ? "" : " — dry run, so nothing was changed; this only reports what the alert stream did"
          }</p>`
        : ""}
    </div>` : ""}

    <div class="card"><h2>Receipt</h2>
      <p class="mono">input digest ${esc(r.receipt.inputDigest)}</p>
      <p class="mono">actor ${esc(r.receipt.actor)} · action ${esc(r.receipt.action)} · ${esc(r.receipt.at)}</p>
      <p class="mono">re-verified on load: ${v.ok ? "verified" : "FAILED — " + esc(v.reason)}</p>
    </div>

    <div class="card"><h2>Correlator notes</h2>
      <pre>${esc((inc?.notes ?? []).join("\n") || "no notes")}</pre>
    </div>
  </main>`);
}

const body = (req) =>
  new Promise((res) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => res(Object.fromEntries(new URLSearchParams(d))));
  });

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tenantId = tenants.includes(url.searchParams.get("tenant")) ? url.searchParams.get("tenant") : tenants[0];
    const send = (code, type, payload) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
      res.end(payload);
    };

    if (req.method === "POST" && (url.pathname === "/approve" || url.pathname === "/decline")) {
      const form = await body(req);
      const data = state.get(form.tenant) ?? (await load(form.tenant ?? tenantId));
      const r = data.results.find((x) => x.incidentId === form.id);
      if (r && url.pathname === "/approve") {
        data.approvals.set(form.id, "operator");
        defaultStore.recordApproval({
          tenantId: form.tenant,
          incidentId: form.id,
          remediationId: r.verdict.remediationId,
          approvedBy: "operator",
          at: new Date().toISOString(),
          decisionDigest: r.receipt.inputDigest,
        });
        r.approvalReceipt = receipt({
          incidentId: form.id, actor: "human:operator",
          action: `approved:${r.verdict.remediationId}`, evidence: r.receipt.evidence, approvedBy: "operator",
        });
        // An approval must actually reach the executor, or the button is a lie.
        // The executor still re-authorises; a human click is not a bypass.
        const inc = data.incidents.find((i) => i.id === form.id);
        if (inc) {
          r.execution = await execute({
            incident: inc,
            remediationId: r.verdict.remediationId,
            pack: data.pack,
            ledger: data.ledger,
            decisionReceipt: r.receipt,
            approval: { approvedBy: "operator" },
          });
          const later = inc.alerts.length
            ? data.incidents.flatMap((i) => i.alerts).filter((a) => Date.parse(a.at) > Date.parse(inc.lastSeenAt))
            : [];
          recordVerification(r.execution, verifyResolution(inc, later), inc);
        }
      }
      res.writeHead(303, { location: `/incident/${form.id}?tenant=${encodeURIComponent(form.tenant)}` });
      return res.end();
    }

    if (url.pathname === "/healthz") return send(200, "application/json", JSON.stringify({ ok: true, tenants }));

    const data = state.get(tenantId) ?? (await load(tenantId));

    if (url.pathname === "/api/metrics") return send(200, "application/json", JSON.stringify(data.metrics, null, 2));
    if (url.pathname === "/api/incidents") return send(200, "application/json", JSON.stringify(data.results, null, 2));

    if (url.pathname.startsWith("/incident/")) {
      const html = incidentPage(tenantId, data, decodeURIComponent(url.pathname.slice("/incident/".length)));
      return html ? send(200, "text/html; charset=utf-8", html) : send(404, "text/html", page("Not found", "<main><p>No such incident.</p></main>"));
    }
    if (url.pathname === "/") return send(200, "text/html; charset=utf-8", dashboard(tenantId, data));
    send(404, "text/html; charset=utf-8", page("Not found", header(tenantId) + "<main><p>Not found.</p></main>"));
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`Server error: ${e.message}`);
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`\n  NightShift console on http://localhost:${PORT}`);
    console.log(`  provider: ${PROVIDER}   tenants: ${tenants.join(", ")}\n`);
  });
}

export { tenants, load, state };
