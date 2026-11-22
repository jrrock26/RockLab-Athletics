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

## Ownership and editing (owner decision, 2026-11-21)

**The school owns player profiles.** They are created only by AD, coach or staff — manual
entry or import from a sign-up sheet, a CV, or the student directory — so a school can
onboard profiles that already match the records in its own system.

- One player record, created once, moved team to team. **Consistent and unchanged for the
  whole school career.** No re-entry at each level, no per-season copies.
- A parent **claims** a player during onboarding; a coach, AD or staff member approves.
  Claiming links an account to a profile; it does not create one.
- A guardian **requests** edits to player information. They do not write it directly.
- A guardian edits **their own contact details** on their own account. **The player record
  carries no guardian contact information at all** — only the link to the guardian.

### Consequence: retires the roster edit whitelist

An earlier commit (`b6c0c59`) allowed guardians to write `parentName`, `parentEmail`,
`parentPhone`, `emergencyContact*`, `allergies` and `medicalNotes` directly onto the roster
entry. That contradicts this decision on two counts — it lets a guardian write player-side
data, and it duplicates guardian contact onto the player record.

To be narrowed to: **no guardian write on the roster entry.** Guardian contact lives on
their user document (already self-editable); player information changes go through a
request. Anything a family legitimately must supply — allergies, medical notes, emergency
contact — belongs on the player profile as a staff-approved field, not on a record the
family can silently rewrite.

### Why this ordering is right

The school's roster is the authority; the platform mirrors it. If families created players,
a school would end up with two children called "Mikey Smith" and no way to reconcile them
against its own directory. Creating from the school's source keeps the player id stable
from kindergarten registration to graduation — which is the whole point of the durable
profile.



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

## When the adult is also staff (decided 2026-11-22)

A coach, AD or staff member is often a child's actual parent. This is not an edge case;
it is most of a small school's coaching staff. Three consequences, now enforced:

**Authority is by relationship first, role second.** A coach-parent approving their own
child's claim is recorded as `approvedByRole: 'guardian'`, not `'staff'`. Calling it staff
would overstate the school's part in a family decision and would mark the audit row
`withoutGuardian` — a false statement about whether a guardian was involved.

**Staff may not approve over a guardian who exists.** The rule above is "a guardian
approves, or staff when no guardian exists", and that second half is now checked rather
than assumed. A coach approving a claim for a child whose parent is reachable is exactly
the silent capability this document was written to prevent.

**An AD may override, explicitly.** If a guardian is on file but cannot be reached, a stale
guardian record would otherwise lock the child out of their own profile forever. The AD can
pass `force`; the audit row then records `overrodeGuardian: true`, which is a different and
heavier act than acting where no guardian exists. A coach cannot use the override.

### Guardian claims are supersedable

`claimedByUserId` names the account currently holding the profile. When a parent claims on
behalf of a seven-year-old who has no account, that is a **guardian claim**
(`claimedByKind: 'guardian'`): legitimate, and deliberately **not final**. At thirteen the
athlete claims the same profile and takes it over — the guardian rows stay, so the parent
keeps read access.

An **athlete claim** (`claimedByKind: 'athlete'`) is final. A missing `claimedByKind` is
treated as an athlete claim, because every claim made before this distinction was one, and
guessing the other way would let a stale document be taken over without approval.

Declining is deliberately easier than approving: staff may decline even when a guardian
exists, because nothing is granted by saying no and a suspicious request should be able to
die without waiting for someone unreachable.

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
