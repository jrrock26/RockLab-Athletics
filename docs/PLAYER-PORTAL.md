# Player Web Portal (Feature 3)

Discovery and plan. Read `docs/PARENT-PORTAL.md` first — this builds on the guardian
work and inherits its rules.

## PHASE A — DISCOVERY

### How a player gets an account

`ensurePlayerRosterEntry` (functions/index.js:1089) is the claim path: an accepted
`player` invitation sets `userId` on the roster entry, so the athlete IS the entry.
Everything downstream keys off that: `isRosterAssignee` treats
`request.auth.uid == entry.userId` as authorised.

### The compliance hole this feature must close

`firestore.rules` lines **262** and **279** grant the same write to the athlete and the
guardian:

```
|| (isRosterAssignee(teamId, entryId) && request.resource.data.status == 'submitted')
```

`isRosterAssignee` is true for the athlete themselves. So **a 15-year-old can currently
write `status: 'submitted'` on their own concussion waiver, physical and code of
conduct** — the three forms whose whole purpose is guardian authorisation. There is no
distinction anywhere in the codebase between a player acknowledging something and a
guardian consenting to it: `grep -rn 'acknowledg'` returns nothing across Swift, JS,
rules and the web app.

`FormStatus` has only `missing | submitted | approved | expired`, so even the data model
has nowhere to record "the athlete has read this".

### What a player legitimately owns

| Act | Who | Why |
|---|---|---|
| Read own schedule, roster entry, stats | player | already permitted |
| RSVP for themselves | player | no legal weight |
| Read announcements / team chat | player | already permitted |
| **Acknowledge** reading a policy or waiver | player | their own act, recorded as such |
| **Sign or consent** | guardian | legally the guardian's, never the minor's |
| Approve | coach | already the case |

### Industry baseline (SportsEngine, TeamSnap, GameChanger)

All three separate "athlete completed their part" from "guardian gave consent", and
none lets a minor produce a consent. SportsEngine's registration shows the guardian as
signatory with the athlete as participant. This is the norm, not a nice-to-have.

## PHASE B — PLAN

### Decision: two acts, two fields, one document

Recommended over a separate subcollection: keep one form document per requirement and
record both acts on it.

```
{
  ...existing fields,
  status: 'missing' | 'submitted' | 'approved' | 'expired',   // guardian/coach controlled
  signedByName, signedAt, submittedBy,                        // guardian signature
  acknowledgedBy: <player uid>, acknowledgedAt: <epoch secs>, // athlete's own act
  acknowledgmentText: <the exact words shown>                 // what they agreed to
}
```

`acknowledgmentText` matters: without it the record cannot show what the athlete
actually saw, which is the first thing an auditor asks.

### Rules (must land before any UI)

1. **Split the write predicate.** `isRosterAssignee` keeps meaning "may act for this
   entry", but the status pin tightens by role:
   - athlete (`uid == entry.userId`): may change **only** `acknowledgedBy`,
     `acknowledgedAt`, `acknowledgmentText`, `updatedAt`; `status` must be unchanged.
   - guardian: may set `status == 'submitted'` as today.
2. **Coaches keep full control** (`canManageTeam`), including `approved`.
3. **A player may never read another athlete's requirements** — already true via
   `isGuardianOf`/`isTeamMember`; re-verify for the new fields.

Rule shape (intent, not final syntax — `diff().affectedKeys()` is the tool):

```
function athleteAcknowledging(teamId, entryId) {
  let e = rosterEntryData(teamId, entryId);
  return e != null && 'userId' in e && request.auth.uid == e.userId;
}
// on write:
//   (athleteAcknowledging(...) &&
//      request.resource.data.diff(resource.data).affectedKeys()
//         .hasOnly(['acknowledgedBy','acknowledgedAt','acknowledgmentText','updatedAt']))
//   || (isGuardianOf(...) && request.resource.data.status == 'submitted')
//   || canManageTeam(teamId) || staffHasPerm(teamId, 'forms')
```

### Player web experience (reuses the portal shell)

- `/player` — same auth as `/portal`, then: my team, my schedule, my requirements.
- Each requirement shows **two lines when they differ**: "You acknowledged" and
  "Guardian signature".
- A consent-form requirement with no guardian signature reads
  **"Waiting for your guardian"** and offers no button. The player's only action is
  *Acknowledge*, which is labelled as acknowledging — never *Sign*.
- No messaging, no payments, no other athletes.

### Acceptance criteria

- A player can sign in on web and see only their own team, schedule and requirements.
- A player can acknowledge a form; `acknowledgedBy/At/Text` are written and `status`
  is untouched.
- A player **cannot** set `status` to `submitted`, `approved` or `expired` (direct write
  403) — this is the hole being closed.
- A guardian can still sign for the same athlete; both acts are visible side by side.
- A player cannot read another athlete's requirements.
- Coach approval unchanged.

### Risks

| Risk | Mitigation |
|---|---|
| Rule blocks legitimate player writes | test with the real athlete token before deploy |
| Two-field model confuses coaches | iOS must show both acts; document in the release note |
| Existing data has no acknowledgment fields | absent means "not acknowledged", never "consented" |

### Sequencing

1. Rules (hole first). 2. `portal.mjs` helpers + tests. 3. `/player` page.
4. iOS display of both acts. 5. Verify with a real athlete login.

**Blocked on**: a player credential. `player@rocklabathletics.com` does not accept the
known test password, and the Auth tool cannot set one, so the athlete-write tests cannot
run until that account is reachable.
