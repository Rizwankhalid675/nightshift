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

### 4. Host it
"A working, publicly hosted AI solution" is a hard requirement. Cheapest paths:

- **Static** (zero cost, 2 minutes): `node src/export.js` then drag `dist/` onto Netlify Drop, or
  enable GitHub Pages on `/dist`. Judges can click through everything except the approve buttons.
- **Live console** (better): Render or Fly.io, start command `node src/server.js`, no build step, no
  dependencies. Add the AWS env vars there to run the Bedrock path live.

Do the static one today so a URL exists, then upgrade it.

### 5. Record the video
Script is written in [`VIDEO.md`](VIDEO.md) with a 2:45 beat sheet. Must be **public on YouTube**.
Two of four criteria are partly judged off it — Potential Impact says "based on what's demonstrated".

---

## Mine (I can keep going on these)

- **Execution adapter** — wire approved remediations to AWS Systems Manager so auto-remediation
  actually does something. Currently the gate decides and records but never executes. This is the
  biggest remaining gap in "Technological Implementation".
- **Strands Agents / AgentCore** — the rules name these alongside Bedrock. A multi-agent variant
  (triage agent + remediation agent + reviewer) would hit the "multi-agent incident response"
  wording in the Track 1 brief directly.
- **Persist console state** so approvals survive a restart.
- **A second, independent ground-truth set** to reduce the bias I flagged in the limits.
- **Screenshots** into `docs/img/` for the README hero.

Say the word and I'll take the execution adapter next — it is the one a judge is most likely to
poke at.

---

## Current state

```
npm test        35 tests, 35 passing
npm run eval    203 alerts → 21 incidents → 12 pages
                94.1% volume removed, 0 false auto-actions, 0 missed incidents
                exits non-zero if either safety number moves
node src/export.js   32 static pages, 2 tenants
```

Verified working: correlation, the nine-rule gate, receipts with tamper detection, two tenants
behaving differently on identical traffic, the console rendering end to end.

Not yet verified: the Bedrock call against real AWS. It is implemented and signed, but until step 2
above it has never returned a live response.
