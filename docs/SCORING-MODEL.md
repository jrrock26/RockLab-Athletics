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

1. **One score model for fourteen sports.** "Increment a number" is right for
   football, basketball, soccer, lacrosse, hockey, water polo, baseball, softball.
   It is wrong for the six sports whose result is *sets*, *matches*, *dual meets*,
   *meets*, *apparatus totals*, or a *judged placement*.
2. **Three sports have a clock but no definition** (`field_hockey`,
   `ice_hockey`, `water_polo`). They silently get one stat and a +1 button.
3. **Two sports should not be live-scored at all.** Cheer and dance are judged;
   publishing a score is worse than publishing nothing.
4. **Missing sports**: track & field, cross country, competitive cheer, esports.

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

## 6. Priority

1. **Statistician request/claim** — turns "every team can be scored" into reality
   for schools with no dedicated staff. Highest practical value.
2. **Volleyball sets** — most-played sport with a wrong score model.
3. **`judged` for cheer/dance** — currently offers a misleading live score.
4. **Fill the three clock-only sports.**
5. Tennis / wrestling / swimming models.
