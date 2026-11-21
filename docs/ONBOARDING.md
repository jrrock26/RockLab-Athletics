# Onboarding and Team Join Codes

Owner decision, 2026-11-21. This supersedes the email-invitation-first approach for
families.

## The decision

- **The AD invites coaches.** One per team. Not parents, not players — an AD with 30
  teams should never be typing 900 family email addresses.
- **Coaches do not hand-invite families either.** The season starts with a **mass text**
  or a **QR code on a printed sheet**. That is how a real program onboards.
- **Families self-join with a team code, and the coach approves who is who.** Approval is
  the identity check: the code proves you belong to the team's circle, the coach confirms
  which athlete you are and in what role.

## What already exists

| Piece | Where | State |
|---|---|---|
| Per-team join code | `teams/{teamId}.joinCode` (e.g. `GPRYW5`) | **already in the data** |
| Parent requests to link an athlete | `requestParentLink` callable | built |
| Coach approves / rejects | `approveParentLink`, `rejectParentLink`, `listParentLinkRequests` | built |
| Player claims a roster slot | `ensurePlayerRosterEntry` callable | built |
| Request queue | `parentLinkRequests` collection | built |

So the machinery is present. What is missing is **one page**: a public entry point where a
code is typed or scanned, and the request is created.

## What to build

1. **`/join` page** (web, public):
   - accepts `?code=GPRYW5`
   - resolves the team from the code, shows the school and team name so the parent can
     confirm they have the right one
   - sign up (or sign in) — the existing portal auth is reused
   - asks: "Which athlete?" and offers the roster **names** so a parent picks rather than
     types, plus a free-text fallback for a child not yet on the roster
   - calls `requestParentLink`
   - ends with "Sent. Your coach will confirm."
2. **QR rendering** on the coach's team screen: the code as a QR pointing at
   `https://rocklab-athletics.web.app/join?code=GPRYW5`, plus the code in large type for
   a text message. No new backend — it is a URL and a code.
3. **Coach approval queue** (web is fine here): list pending requests, approve or reject.
   The callables already exist.

## The gap: there is no "join by code" backend

Reading the callables shows why self-service onboarding does not work today:

- **`requestParentLink({ teamId, rosterEntryId })`** requires an **existing team
  membership** ("Follow the team first") *and* an existing `rosterEntryId`. A parent
  holding a code has neither.
- **`ensurePlayerRosterEntry({ teamId })`** requires a membership whose role is already
  `player`. A new athlete has no membership.
- Membership is only ever created by **`acceptInvitation`**, i.e. by an invitation. That
  is the single reason a code cannot currently onboard anyone.

So a join code is inert. The pieces listed above are all *post-membership* machinery.

### What that means

One new callable is needed, and only one:

```
requestTeamJoin({ code, role, athleteName })
  -> creates teams/{teamId}/joinRequests/{id} with status 'pending'
  -> does NOT create a membership, does NOT create a roster entry
```

Coach approval then does the two writes the invitation path already knows how to do:
create the membership and (for a parent) link the guardian, or (for a player) create and
claim the roster entry. The approval callable can reuse `parentLinkRequests` handling
rather than duplicating it.

**The code must never grant access on its own.** `requestTeamJoin` writes a *request* and
nothing else, so a leaked or forwarded code produces a queue item a coach can reject —
never a member.

## Revised: the roster exists first, and the parent picks from it

Owner decision (supersedes the "typed name, matched server-side" approach).

**The order is roster-then-families.** A coach builds the roster before any parent is asked
to join, so at join time the child already exists as a player and a roster entry. The
parent types their child's name, the list **filters as they type**, and they select that
player. No free-text name, no "not on roster" state, no guessing at spelling.

This reverses an objection I raised: I argued a picker would disclose roster names to
anyone holding the code. The counter is that a filter discloses only names matching what
was typed, and the parent already knows their own child's name.

### The abuse window this opens, and how to close it

A code in a group chat plus a name filter is an enumeration tool unless constrained. All
four are required before this ships:

1. **Minimum 3 characters.** One or two letters would return a whole roster.
2. **Hard cap of 5 results.** Enough to disambiguate two Smiths, not enough to page a team.
3. **Per-account rate limit**, reusing the counter-document pattern from join attempts.
4. **Authenticated only**, and first *and* last name required to match — "Michael" alone
   must not return every Michael in the school.

### What the parent sees

Name plus a non-sensitive disambiguator (grade or graduation year). **Not** jersey number,
position, injury status, or guardian contact. Each is either school-owned or another
family's data.

### Resulting callable shape

```
searchTeamRoster({ code, query })
  -> up to 5 { playerId, rosterEntryId, displayName, gradYear }

requestTeamJoin({ code, role, rosterEntryId })
  -> pending request naming a specific player and roster entry
```

`requestTeamJoin` no longer takes a typed name; it takes an id the parent selected, so the
coach approves a specific child. The `not_found` / `player_without_roster_entry` states
disappear, because the roster is guaranteed to exist first — and the `matchStatus` logic
already written into `requestTeamJoin` becomes dead code to remove rather than leave.

### Final model (owner, 2026-11-21)

- AD **can** invite anyone, but should not have to; ADs invite coaches.
- **Players self-serve**: create an account, apply to a team with the code, and can link
  with a parent.
- **Parents self-serve**: create an account, apply with the code, name their athlete.
- **Coach approves every join request.** Approval is the identity check.
- Because a roster is never complete in week one, the request carries the **typed athlete
  name**. The join page must not list roster names to someone who is not yet approved —
  that would turn a leaked code into a roster disclosure.


- A join code is a **shared secret in a group chat**. Anyone who sees the text can request
  to join. That is acceptable *because* approval is mandatory — the code must never by
  itself grant access, and no rule should allow a membership to be created from a code
  alone.
- **Rotate the code per season.** A code printed on a sheet in August is still circulating
  in March. `rolloverTeam` is the natural place to regenerate it.
- The `/join` page must disclose **team and school only** for a valid code — never roster
  names or athlete details before the person is approved and linked, or a leaked code
  becomes a roster disclosure.
- Approval must record who approved and when (the audit log already exists for this).

## Why this beats email invitations for the pilot

No provider, no DNS, no deliverability, no key to configure — which is the blocker that
has held Feature 1 for this entire build. It also removes the failure mode that matters
most at a real school: the AD being the bottleneck for 30 teams' worth of family
onboarding.
