/**
 * export.js — render the console to static HTML.
 *
 * Two reasons this exists:
 *  1. The submission must be viewable by a judge with zero setup. `dist/` drops
 *     onto any static host, or opens straight from the filesystem.
 *  2. It is the offline fallback for the demo video if a live service misbehaves.
 *
 *   node src/export.js [--provider offline] [--out dist]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runEval } from "./eval/run.js";
import { dashboard, incidentPage, tenants } from "./server.js";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const provider = arg("provider", process.env.AGENT_PROVIDER || "offline");
const out = arg("out", "dist");

mkdirSync(out, { recursive: true });
let pages = 0;

for (const tenantId of tenants) {
  const data = await runEval({ tenantId, provider });
  data.approvals = new Map();

  const fix = (html) =>
    html
      .replace(/href="\/\?tenant=([^"]+)"/g, (_, t) => `href="./index-${t}.html"`)
      .replace(/href="\/incident\/([^?"]+)\?tenant=([^"]+)"/g, (_, id, t) => `href="./incident-${t}-${id}.html"`)
      .replace(/<form method="POST"[\s\S]*?<\/form>/g, "")
      .replace(/<\/body>/, '<p style="max-width:1180px;margin:0 auto;padding:0 24px 40px;color:#8b949e;font-size:12px">Static export — approval buttons are live in the running console.</p></body>');

  writeFileSync(`${out}/index-${tenantId}.html`, fix(dashboard(tenantId, data)));
  pages++;
  for (const r of data.results) {
    const html = incidentPage(tenantId, data, r.incidentId);
    if (html) { writeFileSync(`${out}/incident-${tenantId}-${r.incidentId}.html`, fix(html)); pages++; }
  }
  writeFileSync(`${out}/metrics-${tenantId}.json`, JSON.stringify(data.metrics, null, 2));
}

// Which tenant a visitor lands on. Defaults to the first alphabetically,
// which is rarely the one you want to show first.
const primary = process.env.PRIMARY_TENANT && tenants.includes(process.env.PRIMARY_TENANT)
  ? process.env.PRIMARY_TENANT
  : tenants[0];

writeFileSync(`${out}/index.html`, `<!doctype html><meta charset="utf-8"><title>NightShift</title>
<meta http-equiv="refresh" content="0; url=./index-${primary}.html">
<a href="./index-${primary}.html">Open NightShift</a>`);

console.log(`\n  Exported ${pages} pages for ${tenants.length} tenants to ${out}/\n`);
