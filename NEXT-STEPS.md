# What is left, and who has to do it

Deadline: **Thu Dec 11, 2026, 12:00 pm PT.** Preflight currently reports
**20 passed, 2 warnings, 2 blockers** — and both blockers need an account only you can open.

---

## Yours (I cannot do these)

### 1. Register for the hackathon
https://aws-agentic-msp.devpost.com/ → "Join Hackathon". I can't create accounts.

### 2. AWS account with Bedrock model access
1. Create or use an AWS account.
2. In the Bedrock console → **Model access**, request access to a Claude model
   (`anthropic.claude-3-5-sonnet-20240620-v1:0` is what the code defaults to). Approval is usually
   minutes.
3. Create an IAM user or role with `bedrock:InvokeModel`, take the access key.
4. Then:

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
AGENT_PROVIDER=bedrock npm run eval
```

That produces the first real Bedrock numbers. The README currently says, explicitly, that no
Bedrock-measured figure is claimed — **that sentence changes the moment this run succeeds**, and the
comparison becomes a selling point: offline baseline vs Bedrock on the same benchmark.

### 3. Push to GitHub (public)
The rules require a public repo with a visible open-source licence. `LICENSE` (MIT) is already in
the repo root, which makes it detectable in GitHub's About panel.

```bash
cd aws-msp-hackathon
gh repo create nightshift --public --source=. --push
```

### 4. ~~Host it~~ DONE — https://webrizz.dev/nightshift/

Static export deployed to a `nightshift/` folder under your portfolio domain. The portfolio root is
untouched. To redeploy after a change: `npm run build:static`, then replace the files in
`public_html/nightshift/` (delete first — the file manager silently skips same-name overwrites).

Original notes below.

### 4b. Hosting options
"A working, publicly hosted AI solution" is a hard requirement. Cheapest paths:

Both configs are already committed, so this is a few clicks:

- **Static** (2 minutes): `npm run build:static`, then drag `dist/` onto https://app.netlify.com/drop.
  `netlify.toml` is there if you'd rather connect the repo. Judges can click through everything
  except the approve buttons.
- **Live console** (better): Render → New → Blueprint → this repo. `render.yaml` sets the start
  command, the health check and safe defaults. Add the AWS keys in the dashboard afterwards to turn
  on the Bedrock path.

Do the static one today so a URL exists, then upgrade it.

### 5. Record the video
Script is written in [`VIDEO.md`](VIDEO.md) with a 2:45 beat sheet. Must be **public on YouTube**.
Two of four criteria are partly judged off it — Potential Impact says "based on what's demonstrated".

---

## Mine (I can keep going on these)

- ~~Execution adapter~~ **done** — approved remediations now reach AWS Systems Manager
  (`SendCommand` / `StartAutomationExecution`), polled to a terminal state, with independent
  re-authorisation, idempotency, undo paths and post-execution verification. Dry-run by default.
  To run it for real: `EXECUTOR_MODE=live` plus credentials and an `ssm:SendCommand` IAM policy.
- ~~Multi-agent~~ **done** — four Bedrock specialists (triage, diagnosis, remediation, adversarial
  reviewer) with case-file handoff, degradation to a single agent when one fails, and fault
  injection proving the reviewer catches wrong actions (6 → 0). Note it implements the Strands
  *pattern* rather than importing the SDK; the README says so plainly.
- ~~Screenshots~~ **done** — `docs/img/hero.jpg` and `docs/img/agent-handoff.jpg`, both in the README.
- ~~Deploy config~~ **done** — `render.yaml` (live console) and `netlify.toml` (static), both
  pinning `EXECUTOR_MODE=dry-run` so a public demo cannot touch infrastructure.
- ~~CI~~ **done** — `.github/workflows/ci.yml` runs the tests, the eval gate on both tenants, and
  `compare.js --assert`, which fails the build if the reviewer stops catching injected faults.
- **Persist console state** so approvals survive a restart.
- **A second, independent ground-truth set** to reduce the bias I flagged in the limits.

The strongest next one is **a live Bedrock run** (your step 2). Everything is built; what the
submission lacks now is a single real model response and a URL.

---

## Current state

```
npm test        69 tests, 69 passing
npm run eval    203 alerts → 21 incidents → 12 pages
                94.1% volume removed, 0 false auto-actions, 0 missed incidents
                exits non-zero if either safety number moves
node src/export.js   32 static pages, 2 tenants
EXECUTOR_MODE   dry-run by default; 6 SSM calls composed, 0 refused
AGENT_MODE      multi by default; --inject mismatch → 0 wrong actions (single: 6)
```

Verified working: correlation, the nine-rule gate, receipts with tamper detection, two tenants
behaving differently on identical traffic, the console rendering end to end.

Not yet verified against real AWS: **the Bedrock call** and **the Systems Manager call**. Both are
implemented, signed and tested, but neither has returned a live response — every run so far has used
the offline proposer and `EXECUTOR_MODE=dry-run`. Step 2 above unblocks both at once, and the IAM
policy needs `bedrock:InvokeModel` plus `ssm:SendCommand`, `ssm:GetCommandInvocation`,
`ssm:StartAutomationExecution` and `ssm:GetAutomationExecution`.
