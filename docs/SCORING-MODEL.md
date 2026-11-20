# Scoring and statistics model — alignment audit

Audited 2026-11-20 against the requirement that **each sport has its designed
scoring and statistics system**, and that every team has a live-scoring option
operable by a statistician.

---

## 1. How scoring is built today

| Piece | Where | What it does |
| --- | --- | --- |
| `SportDefinition` | `Models/SportDefinition.swift` | positions, stat categories, **score buttons** (integer deltas), score unit label |
| `ClockConfig` | same | periods + minutes for timed sports; `nil` for untimed |
| `ScoringView` | `Views/Teams/ScoringView.swift` | routes `golf` → `GolfScoringView`, everything else → `LiveScoringView` |
| `LiveScoringView` | 233 lines | score buttons, period/clock control, per-player stat counters |
| `Statistician` | `StaffPermission` | already wired: `canScore = manageTeam || hasPerm(.statistician)` |

The generic engine is a **running score incremented by button presses**, plus
per-player integer stat counters. That is a real model — it is just not the only
model the sports need.

## 2. Per-sport coverage

✅ = correct model · ⚠️ = works but structurally wrong · ❌ = no design

| Sport | Clock | Score buttons | Stats defined | Verdict |
| --- | --- | --- | --- | --- |
| Football | 4 × 12 | 1,2,3,6 | TD, rush/pass/rec yds, tackles, sacks, INT, FG | ✅ |
| Basketball | 4 × 8 | 1,2,3 | pts, reb, ast, stl, blk | ✅ |
| Baseball | none | 1 | runs, hits, RBI, HR, SB, K, errors | ✅ |
| Softball | none | 1 | same as baseball | ✅ |
| Soccer | 2 × 40 | 1 | goals | ✅ |
| Lacrosse | 4 × 12 | 1 | goals/assists etc. | ✅ |
| Field hockey | 4 × 15 | 1 | goals, assists, saves, cards | ✅ |
| Ice hockey | 3 × 17 | 1 | goals, assists, saves, PIM | ✅ |
| Water polo | 4 × 7 | 1 | goals, assists, steals, saves, exclusions | ✅ |
| Golf | n/a | hole-by-hole | strokes | ✅ dedicated view |
| Bowling | none | 1 | — | ⚠️ pinfall per game not modelled |
| **Volleyball** | none | 1 | — | ⚠️ **scored as points, but a match is decided by sets won** (best of 3/5), each with its own score |
| **Tennis** | none | 1 | — | ⚠️ team score is matches won; individual singles/doubles matches and sets are not modelled |
| **Wrestling** | none | 1–10 | — | ⚠️ dual-meet points depend on result type per weight class (dec 3, major 4, tech 5, fall 6), not a free button |
| **Swimming** | none | 1–10 | — | ⚠️ scored by event placings; no events or places |
| **Gymnastics** | none | 1 | — | ⚠️ scored by per-apparatus scores summed |
| **Cheerleading / Dance** | none | 1 | — | ❌ judged placement; should have no live score at all |
| field_hockey / ice_hockey / water_polo | ✅ clocks | **falls back to [1] "Pts"** | **none** | ❌ clock exists but no stat definition — a live gap |

## 3. What is actually wrong

> **Correction.** An earlier revision of this section claimed that
> `field_hockey`, `ice_hockey` and `water_polo` had a clock but no stat
> definition. That was wrong — it came from a grep pattern that excluded
> identifiers containing underscores. All three do have positions, stats and
> score buttons, and all eighteen defined sports are complete on that axis.

1. **One score model for eighteen sports.** "Increment a number" is right for
   football, basketball, soccer, lacrosse, field hockey, ice hockey, water polo,
   baseball, softball and bowling. It is wrong for the six sports whose result is
   *sets*, *matches*, *dual meets*, *meets*, *apparatus totals*, or a *judged
   placement*.
2. **Two sports should not be live-scored at all.** Cheer and dance are judged;
   publishing a score is worse than publishing nothing.
3. **Missing sports**: track & field, cross country, competitive cheer, esports.

## 4. Recommended shape

Replace the implicit "buttons" model with an explicit `scoreModel` per sport:

| scoreModel | Sports | UI |
| --- | --- | --- |
| `runningScore` | football, basketball, soccer, lacrosse, hockey, water polo, baseball, softball | current +1/+2/+3/+6 buttons |
| `sets` | volleyball | per-set score entry; match ends on sets won |
| `matches` | tennis | list singles/doubles lines, each with a winner |
| `dualMeet` | wrestling | per weight class, result type → points |
| `meetPlaces` | swimming, track, cross country, gymnastics | events with placings/score |
| `judged` | cheer, dance | no live score; record final placement only |
| `holes` | golf | existing dedicated view |

This is additive: `LiveScoringView` keeps serving `runningScore`, and each new
model is its own small view, chosen in `ScoringView` — the same routing pattern
golf already uses.

## 5. The statistician gap

Capability exists (permission + `canScore`); **discovery does not.** Today the AD
or coach must know to add someone as staff with the statistician permission. The
requested flow is a request parents or students can answer:

```
gameStatisticianRequests/{gameId}
  teamId, gameId, requestedBy, requestedAt, status: open|filled|cancelled
  filledBy, filledAt
```

- Coach/AD taps **"Ask for a statistician"** on a game → creates an open request.
- Team parents and players see it on the game (and in the parent chat) and tap
  **"I'll run it"**.
- Accepting grants *that game's* scoring rights without making them staff for the
  season — a `gameStatisticians/{gameId}/people/{uid}` doc, checked alongside
  `canScore`.
- Audited; revocable by the coach.

Deliberately scoped to one game, not a season: a parent volunteer should not
inherit standing access to every future game.

## 6. Career-stat rules and record-chase cadence

**Varsity only.** School records and career stats are varsity-only by convention;
freshman and JV results do not count. `verifyGameStats` still verifies a
non-varsity game (the coach keeps the audit trail), but no `careerStatLines` are
written and the audit note says so. The team's `level` is recorded on every
ledger row so this can be revisited per school later.

**One scorer per game, chosen by the coach.** Multiple people may offer to score:

1. Coach opens a request on a game (simple or advanced mode).
2. Any team member taps *I'll do it* → they are added to `signups`. This grants
   nothing.
3. The coach opens *Pick* and selects one person. The server deletes **every**
   existing grant for that game and creates exactly one, so two people can never
   hold scoring rights at once. Re-picking revokes the previous choice.

There is no self-service claim path: the old `claimGameStatistician` endpoint was
removed, so selection cannot be bypassed.

**Record-chase announcements.** `scheduledRecordChases` runs daily (and
`announceRecordChases` can be triggered manually):

- Expresses the gap in **games**, not just points:
  `gamesAway = ceil(remaining / per-game average)`.
- Sends a **baseline** notice once per record per athlete.
- Sends **one pre-game notice per upcoming game** (next 72 hours) while
  `gamesAway <= 3`, worded as "needs 4 to tie the school record or 5 to break it".
- De-duplicates in `recordChaseAnnouncements` (server-write only), keyed per
  game/stat/athlete, so repeated runs never spam.

Still to build: MaxPreps export (deliberately deferred).

## 7. Advanced stats by sport

Advanced stats are available wherever the sport has stat definitions:

| Screen | Sports | Advanced stats |
| --- | --- | --- |
| `LiveScoringView` | football, basketball, baseball, softball, soccer, lacrosse, field/ice hockey, water polo, tennis, wrestling, swimming, track, cross country, bowling | full per-player set from `SportDefinitions` |
| `SetsScoringView` | volleyball | kills, aces, blocks, digs, assists, serve receptions — added this pass |
| `GolfScoringView` | golf | per-hole strokes (existing) + putts and fairways via swipe → *Putts/Fairways* — added this pass |
| `JudgedScoringView` | cheer, dance | none by design (judged placement) |

All of them write the same shape — `games/{gameId}/stats/{rosterEntryId}` — so
verification, the career ledger and record watch work identically regardless of
which screen produced the numbers.

Two rules the server enforces at verification:

- **Per-hole golf keys (`h1`…`h9`) are excluded.** They exist for live hole
  scoring and are not career stats; letting them through would corrupt record
  sums.
- **Only varsity games reach the ledger** (§6).

Stat sets are defined once in `Models/SportDefinition.swift`. Adding a stat to a
sport there makes it appear in simple/advanced entry, the verification ledger and
record watch without further wiring.

## 8. Status and priority

Implemented:

- **Statistician sign-up and single selection** — several people may offer to
  score; the coach picks exactly one and every other grant is revoked. The grant
  is per game (`games/{gameId}/scorers/{uid}`), never a staff role, so helping
  once does not confer season-long access. Audited on request, sign-up,
  assignment, release and cancel.
- **Volleyball sets** — dedicated set-by-set scorer; the match score is sets won
  and the game goes final at three.
- **Judged for cheer/dance** — the misleading live score is gone; only the result
  is recorded.
- **Explicit `scoreModel` per sport** with routing in `ScoringView`. This is the
  extension point for everything below.

Still to build, in order:

1. **Tennis** (`matches`) — singles/doubles lines, team score = matches won.
2. **Wrestling** (`dualMeet`) — weight classes, points by result type.
3. **Swimming / track / gymnastics** (`meetPlaces`) — events and placings.
4. **Missing sports**: track & field, cross country, competitive cheer, esports.
