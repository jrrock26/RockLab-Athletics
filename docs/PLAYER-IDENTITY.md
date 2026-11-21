# Player Identity

The durable record of a child, and who may act for them. Decided 2026-11-21.

## The defect this replaces

Career stats are keyed by `athleteKeyFor()`, which returns `user:<uid>` when the athlete
has an account and `roster:<teamId>:<entryId>` when they do not. So an elementary athlete
with no device is keyed to a roster entry, and **their history splits the day they get an
account** — the exact "four years later I want to see my old stats" case.

Identity must never derive from an account (may not exist) or a roster entry (per team,
per season).

## The model

```
players/{playerId}
  name, schoolId, gender, gradYear, photoUrl
  createdBy            // coach or guardian uid
  createdByRole        // 'coach' | 'guardian' | 'ad'
  claimedByUserId      // the athlete's OWN account, once they take ownership
  claimedAt
  status               // 'active' | 'graduated' | 'archived'
```

Relationships:

| Relationship | Where | Meaning |
|---|---|---|
| Player on a team | `roster/{entryId}.playerId` | durable link; `userId` becomes optional "account currently acting" |
| Guardianship | `players/{playerId}/guardians/{uid}` | many guardians, each with `addedBy` + `addedAt` |
| Career stats | `careerStatLines.athleteKey = player:<playerId>` | immutable for life |
| Legacy keys | `playerAliases/{aliasKey}` | maps old `user:`/`roster:` keys onto one player |

## Rights, as decided

**A guardian always has rights to their child's stats.** Not until graduation, not until
the child claims the account — **always**. Claiming ownership gives the athlete control of
their profile; it never revokes a guardian's access to records they were responsible for
as a minor. A guardian can be removed by an AD only for cause, and that removal is
audited.

**AD and coach can act when no guardian is present.** The realistic case: a child who
lives with a grandparent, or a family whose guardian account is gone. Staff can act for
that player — add to a roster, submit forms, view stats — and every such action records
who did it and why. This is an exception with a trail, not a silent capability.

| Actor | Read stats | Act for player | Claim ownership | Remove guardian |
|---|---|---|---|---|
| Guardian | ✅ always | ✅ | ❌ | ❌ |
| Athlete (claimed) | ✅ own | ✅ own | ✅ (requests) | ❌ |
| Coach / AD | ✅ own team/school | ✅ with audit | ❌ | ✅ with audit |
| Anyone else | ❌ | ❌ | ❌ | ❌ |

## The claim flow

A child gains ownership of their own profile in one direction only, with approval:

1. Athlete creates an account (13+, or at whatever age the school allows).
2. They search by **claim code**, not by name — the coach or guardian gives them a short
   code, mirroring the team join code. Name search would let a stranger find a child.
3. `requestPlayerClaim({ claimCode })` files a request. It grants nothing.
4. A **guardian approves**, or an AD/coach approves when no guardian exists. Approval
   sets `claimedByUserId`, adds `user:<uid>` as an alias to the same `playerId`, and
   leaves every guardian in place.
5. From then on the athlete acts as themselves; the guardian still reads their stats.

Approval by staff is the recovery path, so it must be audited and visible to the guardian
on next sign-in ("an AD linked your child's profile to their account on <date>").

## Migration: aliases, not re-keying

Do **not** rewrite `careerStatLines`. Add one collection:

```
playerAliases/{aliasKey}   ->  { playerId, kind: 'user' | 'roster', createdAt }
  "user:abc123"            -> player_42
  "roster:ThX1:2bpq…"      -> player_42
```

- Lookups resolve alias → `playerId`; a player's history is the union of all their aliases.
- When a child claims an account, that adds an alias row — history stitches together with
  no data movement.
- Backfill runs as a **dry-run report first**: proposed groupings, with counts, for an AD
  or owner to review before anything is written. Name + school + gradYear heuristics will
  produce false merges; the report is where those get caught, not in production.
- Merging two players later is: point both alias sets at one id. Reversible.

This is chosen over re-keying because a wrong merge is recoverable and a rewritten ledger
is not.

## Acceptance criteria

- An elementary athlete exists as a `players` doc with **no account**, created by a
  guardian or a coach, and appears on a roster.
- Stats recorded while unclaimed are keyed `player:<playerId>` — or resolve to it through
  an alias — and are still visible after the athlete claims their account years later.
- A guardian who has been on the profile since the start can still read all of it after
  the claim. Verified, not assumed.
- An athlete cannot claim a profile without guardian or staff approval (403 on self-claim).
- A stranger cannot find a child by name (no enumerate path).
- Staff acting without a guardian produce an audit entry naming them and the reason.

## Sequencing

1. `players` + `playerAliases` rules and the `playerId` field on roster entries.
2. `requestPlayerClaim` / `approvePlayerClaim` callables (reuse the join-request shape
   already verified in `requestTeamJoin`).
3. Switch `athleteKeyFor` to `player:<playerId>` with alias resolution.
4. Backfill dry-run report, then the real backfill.
5. Portal + iOS read `playerId`; guardianship moves off `roster.guardianUserIds` and
   `users.linkedPlayerIds`, which finally retires the three-way id confusion.


`players` must not be searchable by name by the general public. A directory of children is
a safeguarding problem, not a feature. Access is by known id through a team, a
guardianship, or a claim request — never by browsing.
