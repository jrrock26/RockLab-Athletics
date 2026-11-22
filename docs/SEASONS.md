# Seasons

Status: **model agreed, not implemented.** Nothing in this document is deployed.

## Why a season is an entity

`team.season` is a free-text string (`Fall`, `Winter`,`Spring`). That is enough to label
a team and useless for everything else an athletic director asks in March:

- "Show me the 2025 season."
- "Why did the JV roster grow by nine players?"
- "Which records were set last year?"
- "Start next season from this one."

None of those can be answered by a string, because a string cannot be *closed*. A season
has to be an object with a beginning, an end, and a state.

## Shape

```
schools/{schoolId}/seasons/{seasonId}       // seasonId = "2026-spring"
  schoolId     string
  year         number        // 2026
  term         'fall' | 'winter' | 'spring'
  name         string        // "Spring 2026"
  startsAt     timestamp
  endsAt       timestamp
  state        'planned' | 'active' | 'closed'
  closedAt     timestamp | null
  openedBy     string        // uid
  closedBy     string | null
```

Team gains `seasonId` (and keeps `season` as a display label until migration completes).

Roster entry gains `seasonId`.

## Rules

Follow the two patterns already proven in this codebase:

- **Read:** `signedIn() && (isAd() || resource.data.schoolId == userData().schoolId)`.
  Reading is not the risk; a season is not private data.
- **Write:** AD only, and only the school's own AD:
  `isAd() && userData().schoolId == schoolId`.
- Closing a season is a **callable**, not a client write. It has to stamp every roster
  entry in the school and cannot be done transactionally from a browser.

Do not gate season reads on `exists()` — a list query over `seasons` must stay
authorisable, and that is the trap that has broken three reads in this codebase.

## Roster archival

A season closing must **never delete roster entries.** Stats, injuries, form submissions
and RSVPs reference them.

Instead, the entry gains:

```
rosterEntry.state      'active' | 'archived'
rosterEntry.archivedAt timestamp | null
rosterEntry.seasonId   string
```

`archived` is not `deleted`. Every existing read that says "the roster" means
`state == 'active'` and must be updated in the same change — a roster view that silently
includes last year's players is worse than one that misses them.

## Order of work, and why

1. **Season entity + rules.** Nothing else can be stamped until a season has an id.
2. **Roster archival.** Depends on `seasonId`; every roster read becomes season-scoped.
3. **Player claim.** Independent of seasons, but its history depends on 1 and 2 being
   right — a claimed profile that shows last year's stats mixed with this year's is a
   worse experience than no claim at all.
4. **promotePlayer on transition.** Last, because it is the operation that consumes all
   three: promote by `gradYear`, archive the closed season's entries, re-roster.

## The invariant

**A player record is a person; a roster entry is a season.** People do not expire when a
season does. Anything that deletes or re-creates a `players` document to "roll over" is
wrong and will destroy career stats.

## Migration notes

- Existing teams have no `seasonId`. Backfill by deriving from `season` + current year,
  and mark those seasons `active`.
- Existing roster entries inherit their team's `seasonId` at backfill.
- No document is deleted at any step. The migration is additive; a rollback is "stop
  setting the new fields".
