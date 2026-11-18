# What is left, and who has to do it

Deadline: **Thu Dec 11, 2026, 12:00 pm PT.**

Updated 18 Nov 2026, after the first live AWS run.

---

## Done since the last version of this file

- **Bedrock runs live.** Both datasets, `us.amazon.nova-pro-v1:0`, `us-east-2`, through the Converse
  API, on a CloudShell task role with no static credentials. Numbers are in the README under
  [Measured against live Bedrock](README.md#measured-against-live-bedrock).
- **Three real defects found by that run**, each fixed with a regression test: SigV4 signed the
  singly-encoded path where AWS requires double encoding (every Bedrock call was a 403); temporary
  credentials were captured once and expired mid-run; `--set=holdout` was silently ignored so a run
  measured the training set and labelled itself `train`.
- **A fourth** found while reading the output: the report printed `Did not recur 4/3`.
- Tests went 75 → 84.

---

## Yours (I cannot do these)

### 1. Register for the hackathon
https://aws-agentic-msp.devpost.com → "Join Hackathon". I can't create accounts.

### 2. Record the video — the only remaining preflight blocker
Script and 2:45 beat sheet are in [`VIDEO.md`](VIDEO.md). Must be **public on YouTube**. Two of the
four judging criteria are partly scored off it. Screen-record https://webrizz.dev/nightshift/.

The live run gives you a much better opening than the old script had: you can now say the model
fabricated a citation and the code caught it, and show the dissent in the console.

### 3. Say the word and I'll push the repo public
`gh` is already authenticated as `Rizwankhalid675`. The rules require a public repo with a visible
licence; MIT is in the root. I have not pushed because making something public under your name is
your call.

```bash
gh repo create nightshift --public --source=. --push
```

---

## Open questions you may want to decide

- **Anthropic models are not available on the AWS account this ran in.** `anthropic.claude-sonnet-5`
  returns `AccessDeniedException: not available for this account`, and the account is on a
  region-locked plan (us-east-2) inside an organization whose service control policy denies
  `bedrock:GetUseCaseForModelAccess`. Amazon Nova works fine and is arguably the better story for an
  AWS hackathon. If you want Claude numbers too, that needs enabling at the org management account
  for the organization, which is a different account from this one.
- **Nothing has run against live Systems Manager.** The executor still composes, signs and polls
  real SSM calls in `dry-run`. Now that signing is fixed and credentials resolve properly, a live
  SSM run is mostly a matter of having a tagged instance to point at.

---

## Mine, if there is time

- A live SSM execution against a tagged throwaway instance.
- A second independent ground-truth set, to reduce the labelling bias noted in the README limits.
- More than one live run per dataset, so the model numbers are a sample rather than an anecdote.

---

## Current state

```
npm test        84 tests, 84 passing
npm run eval    train:   203 alerts -> 21 incidents -> 12 pages, 94.1% reduction
                holdout: 140 alerts -> 18 incidents -> 18 pages, 87.1% reduction
                0 false auto-remediations, 0 missed incidents on both
                exits non-zero if either safety number moves
EXECUTOR_MODE   dry-run by default
AGENT_MODE      multi by default
```

Live: https://webrizz.dev/nightshift/ · Preflight: 1 blocker (the video).
