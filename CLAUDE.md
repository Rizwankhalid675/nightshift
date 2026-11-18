# AGENTS.md — rules of engagement for aws-msp-ai-hackathon

Read this before your first edit. Several agents and people are working in this
repository **at the same time**. These rules are what make that possible.

## 1. Lane ownership

You own one lane. Edit only the files in your lane's area.

| Lane | Owner | File area | Status |
|---|---|---|---|
| contracts | integrator | `contracts.js`, `src/shared/**` | frozen |
| _add lanes here_ | | | |

If your work seems to require a file outside your area: **stop and report it**.
Do not "just quickly" fix it. That is how two agents overwrite each other.

## 2. Contracts are read-only

`contracts.js` defines every type and API shape. Import from it. Never edit it.
Need a change? Ask the integrator, who makes it once and tells everyone.

## 3. Branches

- Your branch: `lane/<owner>-<feature>`. Never commit to `main`.
- Merge to `main` by PR, through the integrator only.
- `main` must build at every moment.

## 4. Before you hand off

```bash
npm run typecheck && npm test && npm run build
```

A lane that does not build does not land.

Hand off in three sentences: what landed, what is stubbed, what you did not do.

## 5. Quality bar for this event

- Any LLM output gets a **deterministic check** around it and leaves **evidence**
  (what it saw, a hash, a quote). "The model said so" is not a result.
- Instrument **one measurable number** in your lane for the results table.
- A narrow working path beats a broad broken one. The demo needs one path.

## 6. Do not

- Do not refactor outside your lane.
- Do not upgrade dependencies.
- Do not change the demo seed data (`demo/seed/**`) — the demo must stay reproducible.
- Do not add a feature after the freeze (T-90 minutes).
