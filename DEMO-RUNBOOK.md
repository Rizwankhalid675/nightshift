# Demo runbook — aws-msp-ai-hackathon

## The 90-second beat sheet

Beat 0 opens with **the number**, never the architecture. The last two beats
volunteer one honest limitation, then end on the live URL and the repo.

| # | Say | Do | They should see | If it breaks |
|---|---|---|---|---|
| 0 | "203 alerts hit this NOC in three days. Eleven of them mattered." | - | - | - |
| 1 | "Here is the console. 203 in, 12 paged." | open dashboard | KPI row, 94.1% removed | reload dist/ export |
| 2 | "This one it threw away, and it tells you why." | open suppressed panel | benign / flapping / maintenance + reason | - |
| 3 | "The real outage still got through." | open payments-gateway | critical, 5 alerts collapsed | - |
| 4 | "The model proposed restart. The gate said no." | scroll to gate | two rules fired, incident is critical | - |
| 5 | "And it cannot lie about what it read." | show receipt | sha256 digests, re-verified on load | - |

## Before you present

- [ ] `./scripts/demo-reset.sh` run; state is pristine
- [ ] Rehearsed 3x, with a reset between each
- [ ] Second terminal open, `demo-reset.sh` typed and ready (not run)
- [ ] Browser tabs pre-opened in order, zoom set, notifications off
- [ ] Offline fallback ready (recorded GIF / screenshots) in case WiFi dies
- [ ] Battery charged, laptop plugged in, dongle tested on the actual projector

## Known failure modes and the fix

| Symptom | Cause | Fix mid-demo |
|---|---|---|
| Service down | | `./scripts/demo-up.sh` |
| Stale state after a rehearsal | | `./scripts/demo-reset.sh` |
| Model call times out | | switch to the cached/seeded path: |
| WiFi dies | | play the recorded fallback, keep talking |

## The three questions they will ask

1. "How do you know the model didn't make that up?" →
2. "What happens when it fails?" →
3. "What's real here vs mocked?" →
