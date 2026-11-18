# Submission — what is done, and what only you can do

Deadline: **Thu 11 Dec 2026, 12:00 PT.** Updated 18 Nov 2026.

## The video

`video/nightshift_reel_narrated.mp4` — **2:28**, 1920x1080, narrated.

Built from committed frames and a committed script:

```bash
./scripts/make-narration.sh --voice SAz9YHcvj6GT2YYXdXww   # River; regenerates the audio
./scripts/build-reel.sh --sync video/narration.mp3         # retimes captions to that audio
```

Alternates, if either is ever wanted: `nightshift_reel.mp4` (2:28, silent with captions)
and `nightshift_silent.mp4` (2:55, no captions, for a different voice-over).

Captions stay under the narration deliberately — they are the accessible track, and most judges
watch a first pass muted.

## What the rules require, and where it is met

| Requirement | Where |
|---|---|
| About three minutes | 2:28, with 32s of headroom |
| Shows the project functioning | throughout; the console is the real deployed site |
| **Internal accounts, upstream and downstream** | beats 6-7, the AWS console at 1:33-2:02 — account name and region visible and deliberately uncropped |
| Public on YouTube | **yours to do.** Unlisted does not satisfy "publicly visible" |
| No third-party trademarks or copyrighted music | no music at all |
| Private repository | confirmed private |

## Only you can do these

1. **Upload the video to YouTube, public.** Not unlisted.
2. **Share the private repo** with `testing@devpost.com` and `aws-msp@amazon.com`.
3. **APN eligibility** — needs an AWS Partner Network organisation and a corporate email on that
   domain. Settle this early; it is the one requirement that cannot be fixed at the deadline.
4. **Devpost registration and the submission form.**
5. **Push the last commit** if it is still local: `git push origin main`.

## The numbers, if the form asks

From committed run artefacts, re-verified against live Bedrock today:

| | northwind-msp | acme-retail |
|---|---|---|
| alerts in | 203 | 203 |
| paged to a human | 12 | 18 |
| noise removed | 94.1% | 91.1% |
| false auto-actions | 0 | **1, disclosed** |
| real incidents missed | 0 | 0 |
| run id | f3b3a3d8 | f11bda28 |

Model: `bedrock:us.amazon.nova-pro-v1:0`, four agents, us-east-2, signed with a CloudShell task
role — no static credentials anywhere in the path.

The acme `1` is deliberate and documented in that tenant's rule pack, in `docs/METRICS.md` and on
the dashboard itself. It was never narrowed away: narrowing a safety metric to exclude the case
that triggered it is tuning the measurement to the result.

## What is deliberately not claimed

Set out in full in the README's Honest limits and `docs/LIMITS.md`. The material ones: traffic is
synthetic; ground-truth labels come from the same generator that produces the traffic; the live
model was Amazon Nova Pro because Anthropic models are not enabled on the available account;
Systems Manager has never been exercised live, only composed and signed in dry-run; and the live
figures are one run per dataset.

## Reproducing any of it

```bash
npm test                                        # 123 tests, no dependencies
npm run eval                                    # the benchmark, offline
./scripts/video-reset.sh                        # checks the deployed site matches committed runs
node src/export.js --from dist-runs --out /tmp/v  # regenerates the site byte for byte
```
