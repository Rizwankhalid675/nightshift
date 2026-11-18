# Demo runbook — aws-msp-ai-hackathon

## The 90-second beat sheet

Beat 0 opens with **the number**, never the architecture. The last two beats
volunteer one honest limitation, then end on the live URL and the repo.

| # | Say | Do | They should see | If it breaks |
|---|---|---|---|---|
| 0 | | | | |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

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
