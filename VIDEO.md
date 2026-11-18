# Demo video — aws-msp-ai-hackathon

Most online hackathons judge **one or two of their criteria off this video, not your code**.
Treat it as a deliverable with its own build time, not a recap you record at 2am.

**Target: 15 seconds under the cap.** Check the cap in `docs/EVENT.md` (commonly 3:00).
Judges are usually not required to watch past it.

## Rules check

- [x] Under the cap (state it: assume 3:00; ours targets 2:45)
- [ ] Uploaded and **public** on the required platform (usually YouTube — unlisted often fails the rule)
- [ ] Link in the README **and** on the submission form
- [ ] Shows the project **actually functioning**, on the device it was built for
- [ ] No copyrighted music, no third-party trademarks
- [ ] In English (or subtitled)

## The script

Write what you will *say*, word for word. Reading a script beats improvising every time.

| Time | Say (verbatim) | Show on screen |
|---|---|---|
| 0:00-0:15 | "An MSP NOC took 203 alerts in three days. Twelve mattered. On-call stopped reading them weeks ago." | alert flood scrolling |
| 0:15-0:30 | "NightShift: rules decide what deserves attention, Bedrock decides what is wrong, and code decides whether a robot may touch it." | the console |
| 0:30-1:45 | Suppressed panel with reasons, then the real outage: evidence shown, proposal, gate holds it, receipt | one unbroken capture |
| 1:45-2:15 | "94.1% of volume gone, zero missed. And when I hand it a wrong action on purpose, the reviewer catches all six — one agent catches none." | terminal: --inject mismatch, both modes |
| 2:15-2:35 | "The traffic is synthetic and remediations are not wired to Systems Manager yet. Both are in the README." | the limits section |
| 2:35–2:45 | Who it's for and what's next. Live URL on screen. | |

## Recording rules that save the take

- **Record the demo path first**, while the build is still fresh and running. Narration later.
- Reset to seed state before each take (`./scripts/demo-reset.sh`).
- Hide notifications, bookmarks, and anything personal. Full screen, 1080p.
- Zoom the UI to ~125% — judges watch on laptops, sometimes on a phone.
- If a step is slow, cut — do not narrate a spinner.
- Record three takes. The third is always the good one.
- Say the number out loud in the first 15 seconds. Most videos bury it.

## Fallback

If live capture keeps breaking, record the happy path once and narrate over it. A smooth recorded
run beats a stuttering live one — the rule asks for footage of it *functioning*, not for a live stream.
