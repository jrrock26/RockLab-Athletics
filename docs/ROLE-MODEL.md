# Role model

Corrected 2026-11-20 from the product owner's definitions. This supersedes an
earlier draft of this document, which incorrectly split "family" out as a
seventh role linked to an individual athlete.

---

## 1. The six roles, as defined

| Role | Definition | Relationship |
| --- | --- | --- |
| **Athletic Director** (`ad`) | Runs the athletic department | school-wide |
| **Coach** (`coach`) | Head or assistant coach | owns a team |
| **Staff** (`staff`) | Trainer, media, boosters, volunteers | scoped to a team, granular permissions |
| **Player** (`player`) | **A student added to a team** | on a roster |
| **Parent** (`parent`) | **The guardian of that player** | linked to the player account |
| **Follower** (`follower`) | Anyone in the community who wants to follow the school | none — read-only, public |

### Player

A player is a *student on a team*, not a login. That distinction already works:
a roster entry exists independently of whether the student has an account, and
`roster.userId` links the account when they sign up. A player can be on several
teams (fall + winter sport), and is promoted between teams (see §4).

### Parent

A parent is the guardian of a specific player — a **linked connection**, not a
team role. Linking runs through `requestParentLink` → `approveParentLink` by an
AD or coach, which writes `linkedPlayerIds` on the guardian's user document. One
guardian can be linked to several children.

Fixed this pass: approving a link previously forced the requester to role
`parent`, which would silently demote a coach or staff member who linked to their
own child. Approval now only ever upgrades a follower/player; it never demotes.

### Follower (also referred to as "family")

One role, deliberately shallow. A follower is any community member — grandparent,
sibling, alumni, local fan — who wants public information about the school's
programs. They are **not** linked to an individual athlete.

What a follower sees:

- upcoming games with location and time
- live scoring while a game is in progress
- fundraisers
- announcements (public categories only)
- social posts / team media
- a pre-match summary and post-match summary

What a follower never sees: rosters, RSVPs, forms or signatures, injury status,
medical or emergency contact data, team chat, staff chat, eligibility, trips, or
any athlete-level record. These are blocked in `firestore.rules`, not merely
hidden in the UI.

## 2. Multi-team and multi-sport

- A player or coach can hold membership on any number of teams.
- Teams are per sport **per level** per season: `sportId`, `level` (Jr High, JV,
  Varsity), `season`. So "basketball" is not one thing — it is Jr High
  basketball, JV basketball and Varsity basketball, each a separate team.
- That level dimension is what makes promotion meaningful (§4).

## 3. Adding and moving players

- **Add**: manually, by CSV import, or by invitation.
- **Move/promote**: see §4.
- **Remove**: `dropPlayer` deletes the roster entry.

## 4. Promotion between teams

The stated case: a Jr High basketball player moves up to JV next season, with a
button rather than retyping the athlete.

`promotePlayer` copies the athlete to the target roster:

- carries: name, jersey, position, guardian name/email/phone, and the linked
  `userId` (so the student keeps their account and access)
- carries: a `player` membership on the target team, and the team is added to the
  student's `teamIds`
- resets: injury status to healthy — a stale "injured" flag following an athlete
  between teams is how bad data spreads
- keeps: the source entry, marked `promotionStatus: promoted` with
  `promotedToTeamId`, so the old season remains an accurate record
- is idempotent: if the athlete is already on the target roster, it returns that
  entry instead of creating a duplicate

Permissioned to the school's AD or the source team's coach, audited as
`player.promoted`, and restricted to teams within the same school. In the app:
swipe a roster row → **Move**, then pick the destination (same-sport teams
listed first).

## 5. Known gap: followers follow teams, not the school

You described following an **organization**. Today a follower follows individual
*teams*, so a community member who wants "everything at RockLab High" must
follow each team one at a time, and a new team created next season is not
auto-followed.

Closing this means an org-level follow: follow the school once, and the public
surface aggregates every team's games, scores, announcements and fundraisers.
That is the single biggest remaining mismatch between the described product and
the built one, and it is small — a school-level membership plus an aggregate
feed.

## 6. Remaining gaps, ranked

| # | Gap | Why it matters | Size |
| --- | --- | --- | --- |
| 1 | ~~Follower is per-team, not per-school~~ | **Closed this pass.** Followers now search and follow the organization, and get an org dashboard. | done |
| 2 | No athlete-centric profile | Parents see a team list, not *my child* across sports and levels | 2–3 d |
| 3 | No graduation pruning at rollover | Rollover copies seniors forward; need a graduated flag and prune step | 1 d |
| 4 | No school-wide staff directory | An AD can't see all coaches/staff and their permissions in one place | 2–3 d |
| 5 | No tryout/cut workflow | 60 try out, 18 make it — still manual list management | 3–4 d |
| 6 | No season archive | Old teams accumulate with no read-only archive view | 1–2 d |
| 7 | No equipment/uniform inventory | Issuance forms exist; nothing tracks who holds which jersey | 3 d |

## 7. Verified this pass

- BUILD SUCCEEDED, 49 tests passing, rules validated and deployed.
- `rolloverTeam` and `promotePlayer` reject unauthenticated callers.
- The `family` role added earlier in the session has been fully reverted:
  `UserRole`, `HomeView`, `TeamAccess`, `TeamDetailView`, rules, role pickers and
  `ALLOWED_ROLES` are back to a single `follower` role.

## AD is school ownership, not a label (security fix)

`users/{uid}.role` is written **by the client** — onboarding sets it immediately
after creating the school. The rules used to trust that string:

```
function isAd() { return role() == 'ad'; }
allow create: if signedIn() && uid() == userId;   // any role, including 'ad'
allow update: if signedIn() && (uid() == userId || isAd());
```

Which meant any signed-in account could write `role: 'ad'` to its own document and
become an athletic director **of every school in the database** — reading all user
records, editing organisations, creating and deleting teams. Found while seeding
test data: creating a coach required it.

The fix defines AD standing as ownership of the school you are attached to:

```
function ownsSchool() {
  return signedIn() && mySchoolId() != ''
    && exists(schools/$(mySchoolId()))
    && get(schools/$(mySchoolId())).data.adUserId == uid();
}
function isAd() { return role() == 'ad' && ownsSchool(); }
```

A self-declared `role: 'ad'` with no school — or with someone else's school —
now grants nothing. Every `isAd()` check in the file inherits the restriction,
because they all route through that function.

Supporting changes:

- **`users` create** accepts `follower | player | parent | coach` freely; `ad`
  requires the same write to name a school whose `adUserId` is the caller.
- **`users` update** allows any role change except promotion to `ad` without
  proof. The check reads the *incoming* `schoolId`, because onboarding writes role
  and schoolId together before the stored document has a school at all —
  checking the existing document would break first-time onboarding.
- **`users` read** for coach/staff was "read every user" via a forgeable role; it
  is now limited to the same `schoolId`.
- **`schools` update/delete** is scoped to `resource.data.adUserId == uid()`
  instead of the global flag.
- **`teams` create/delete** additionally require the team's `schoolId` to be the
  AD's own.

Verified against the deployed rules with two real accounts (11 checks):

| Attempt | Result |
| --- | --- |
| Follower sets own `role = ad` | **403** |
| Follower sets `role = ad` + victim `schoolId` | **403** |
| Follower edits the school | **403** |
| Follower edits the team | **403** |
| Follower writes a play | **403** |
| Follower changes own role to `coach` then back | 200 |
| Coach edits own school | 200 |
| Coach edits own team | 200 |
| Follower reads live game and plays | 200 |

## Succession: handing the AD role to the next person

ADs move on. The role cannot simply be reassigned, because it *is* ownership of
the school — so a handoff transfers that ownership.

**Two steps, deliberately.** `inviteAdSuccessor` sends the invitation;
`acceptAdTransfer` performs the swap when the successor accepts. A one-step
transfer would let a mistyped email address hand a school to a stranger with no
way back, and no record of who agreed to what.

On acceptance, one transaction:

- `schools/{id}.adUserId` → the successor
- successor `users/{uid}` → `role: 'ad'`, `schoolId` set
- outgoing AD `users/{uid}` → `role: 'follower'`

The outgoing AD keeps the school and **every team membership**, so someone who
steps down from AD but still coaches keeps coaching. Only organisation-wide access
ends — that distinction matters, because the alternative (blanking their account)
would silently take a coach off their own team.

Guardrails:

- A stale invitation is rejected: acceptance verifies the school's `adUserId` still
  belongs to whoever sent it, so an old invite cannot take a school from the
  current AD.
- Only one handoff may be outstanding — sending a new invite supersedes the
  previous one, otherwise two people could both accept and the second would
  silently overwrite the first.
- The invitee must be signed in as the invited email.
- `acceptInvitation` refuses AD invitations; `manageUserRole` refuses `newRole:
  'ad'` outright, because there is exactly one AD and it moves by handoff only.
- Invitations with `role: 'ad'` cannot be created by a client at all — only the
  function, which verifies the caller owns the school.

Verified against the deployed functions with two live accounts (14 checks):
invite by the sitting AD, refusal for a non-AD, acceptance, ownership transfer,
demotion of the outgoing AD, privileges genuinely moving (former AD 403 on the
school, new AD 200), replay of the accepted invite refused, generic accept
refused, and handing it back restoring the original state.

UI: **Home → Administration → Hand off AD role** to send; the recipient sees it
under **Account → Invitations**, labelled with what acceptance costs the current
AD.

Not done: no email is actually sent. The invitation exists in Firestore and the
code is shown in-app; wiring a mail provider is a separate job.


