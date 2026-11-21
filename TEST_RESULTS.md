# Test Results

Only executed runs are recorded, with the command that produced them. A test that was
not run is not a pass.

## 2026-11-21 — baseline

### functions/ — unit

```
cd functions && npm test        # node --test
ℹ tests 31   ℹ pass 31   ℹ fail 0
```
- `booking.test.js` (10): overlap semantics incl. touching intervals free, local
  day/minute round-trip, open hours, midnight span, recurrence 8 windows, partition.
- `reel.test.js` (17): clip cap, inverted ranges, cumulative duration, colour formats +
  fallback, drawtext escaping (apostrophe/colon/percent), per-clip PTS reset, banner
  copy by position, label ordering, argv has no shell metacharacters, muted + faststart.
- `reel.test.js` CLI (4): dry-run command generation, unreadable range, >20 clips,
  missing source — each drives the real entry point with no ffmpeg installed.

### iOS — unit

```
xcodebuild test -scheme RockLabAthletics \
  -destination 'platform=iOS Simulator,id=230A941E-…'
Executed 60 tests, with 0 failures
```
Covers eligibility engine, form library, models/access, sport coverage, and the
live-scoring contract (clock derivation, paused clock ignores wall time, negative clamp,
play credit direction, Firestore round-trip, overtime labels).

### Rules — integration against the deployed project

Run with two real accounts via the REST APIs. These assert the *deployed* rules, which
is the only meaningful test of the perimeter.

| Suite | Result | What it proves |
|---|---|---|
| Role escalation | 11/11 | Follower cannot self-promote to AD, name a victim school, or edit school/team/play; AD retains access; follower still reads games and plays |
| AD handoff | 14/14 | Invite, accept, ownership transfer, demotion, stale-invite replay refused, generic accept refused, hand-back restores state |
| Reel clip cap | 9/9 | 21 clips refused on create and update, 20 accepted, legacy 25-clip reel can shrink but not regrow, non-members refused |

### Manual

- App installs and launches (iPhone 18 Pro Max simulator, iOS 27).
- Both hosting sites serve over HTTPS, including the custom domain and assets.
- Landing page, billing tiers, support page verified by HTTP 200 + content assertions.

## Not yet tested (honest gaps)

- **No human has used the product.** Every result above is scripted or automated.
- Two-device live spectator run (scorer + spectator on separate devices) — planned, not
  executed; credentials exist for it.
- Video render end-to-end: impossible here (no ffmpeg). Planning logic is tested; the
  encode is not.
- Load behaviour: no performance or concurrency testing.
- Accessibility: no audit.
- Push notification delivery: not verified on a device.
