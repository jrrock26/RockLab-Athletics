# Parent Web Portal

Feature 2 of `DEVELOPMENT_MASTER_PLAN.md`. Discovery record and plan for the parts of
the portal not yet built.

Current build: `web/pages/portal.js` (411 lines) + `web/lib/portal.mjs` (134 lines,
unit tested). Working today: sign in / sign up, list pending invitations addressed to
the account, accept, and show the linked athlete's team, schedule and record.

Email delivery is out of scope for this phase — Feature 1 records
`deliveryStatus: not_configured` honestly and the AD shares `inviteUrl` manually.

---

## PHASE A — DISCOVERY (complete)

### Where guardian relationships are stored

`users/{uid}.linkedPlayerIds` is a string array, but **three writers disagree about
what the strings are**:

| Writer | Writes | File |
|---|---|---|
| `acceptInvitation` | `rosterEntryId` (the submissions doc id) | `functions/index.js` |
| `linkChild` | `playerUserId` (an auth UID) | `Services/FirestoreService.swift:698` |
| `myAthletes` reads as roster entry id | `linked.includes(entry.id)` | `web/lib/portal.mjs:92` |
| `isRosterAssignee` reads as player UID | `linked.hasAny([entry.userId])` | `firestore.rules` |

Consequence, both directions:

- Guardian linked by **invitation** (the normal path): sees the athlete on the web
  (client filter matches the id) but **`isRosterAssignee` is false**, so the write to
  `submissions` is denied. The form appears, the submit fails.
- Guardian linked by `linkChild`: can submit, but **the portal shows no athlete**
  because the client filter never matches a UID against `entry.id`.

Highest-risk defect for Feature 2: a UI built on top would fail only in production, on
the submit, for every invitation-linked family.

### Why parents cannot read forms at all

`acceptInvitation` creates the team membership as `follower` when the invited role is
`parent`:

```js
const membershipRole = role === 'parent' ? 'follower' : role;
```

But the read rule is `isTeamMember(teamId)`, and

```
function isTeamMember(t) { return memberRole(t) in ['coach','staff','player','parent']; }
```

`follower` is not in that list. An invitation-accepted guardian therefore has **no read
access to `forms` or `submissions`** — the requirements section cannot load, whatever
the UI does.

### Nested paths (confirmed)

```
teams/{teamId}/forms/{formId}                        // the assigned form
teams/{teamId}/forms/{formId}/submissions/{entryId}  // entryId == rosterEntryId
teams/{teamId}/roster/{entryId}
```

Submission shape written by iOS (`FirestoreService.submitTeamForm`) — the web must
match it exactly or the two clients disagree about the same document:

```js
{
  formId, rosterEntryId, playerName,
  status: 'submitted',
  signedByName, signedAt: <epoch seconds>,
  submittedBy: userId,
  responses: { [questionId]: answer },
  requiresParentSignature, parentSignedByName,
  updatedAt: <server timestamp>,
}
```

`FormStatus`: `missing | submitted | approved | expired`.

### Permission mapping for the guardian role

| Action | Rule today | Guardian can? |
|---|---|---|
| Read `forms` | `isTeamMember` | **No** (membership is `follower`) |
| Read `submissions` | `isTeamMember` | **No** |
| Write `submissions` | `isRosterAssignee` && `status == 'submitted'` | **No** (id mismatch) |
| Read `roster` | own entry | Yes |
| Read `events` | follower calendar, no practice details | Yes |

### Industry baseline (TeamSnap / SportsEngine / GameChanger)

Common to all three, and expected by any AD evaluating this:

1. One family account holding **multiple athletes**, switchable without logout.
2. A **requirements list per athlete** with visible status and due date.
3. Completion **in the browser**, including on a phone.
4. After submitting, the item shows *pending review* rather than disappearing — the
   family must see that staff have not yet approved it.
5. An explicit statement of **who may sign**: guardian signature is separate from
   athlete acknowledgement (also directive §1C / §3).

Deliberate difference: RockLab keeps guardian access **narrow** — a guardian reads their
own athlete's requirements, not the whole team's. TeamSnap exposes more; we choose least
privilege because the audience is minors.

---

## PHASE B — PLAN

### Decision required before code: how to identify a linked athlete

Recommendation: **accept both identifier spaces** rather than migrate.

- Rules: a guardian is an assignee if the linked id matches the roster entry's `id`
  **or** its `userId`.
- Client: `myAthletes` matches the same way.

No migration, no rewrite of existing invitations or `linkChild` callers, and it cannot
widen access — the id must still come from the caller's own `linkedPlayerIds`. A
migration to a single space is cleaner long-term and is follow-up work, not a
prerequisite.

### Work items

1. **Rules: guardian read + write on requirements** (must land first)
   - Add `isGuardianOf(teamId, entryId)`: membership role `parent` **or**
     `linkedPlayerIds` contains the entry id or its `userId`.
   - Grant `read` on `forms` / `submissions` to that predicate; keep team-wide read on
     `isTeamMember` for coaches and staff.
   - Fix `isRosterAssignee` to accept both id spaces.
   - Keep the write constraint `status == 'submitted'` — a guardian must never mark
     their own form `approved`.
   - Verify with the existing rules test script before deploying.

2. **`web/lib/portal.mjs`: identifier-space symmetry**
   - `myAthletes` matches `entry.id` or `entry.userId`.
   - Staff-only read access unchanged.

3. **Requirements panel**
   - For the selected athlete, list every form with status, due date, expiry.
   - Vocabulary: Required · Completed · Pending approval · Rejected · Expired ·
     Overdue — computed in `portal.mjs` (testable), not in JSX.

4. **Submit flow**
   - Guardian signature name required and distinct from athlete acknowledgement.
   - Writes the exact iOS shape above, `submittedBy` = guardian uid, `signedAt` in
     **epoch seconds**.
   - After submit the item renders *Pending approval* from local state then from the
     server, so a refresh never appears to have lost the submission.

5. **Multi-athlete switching**
   - Selector above the fold; every panel scoped to the selection.
   - Selection persists in the URL (`?athlete=<entryId>`) so a refresh or bookmark
     keeps context.

### Acceptance criteria

- A guardian with two athletes switches between them without logging out; each panel
  shows only that athlete's data.
- A guardian completes a required form on a phone browser; the document appears at
  `teams/{teamId}/forms/{formId}/submissions/{rosterEntryId}` with `status:
  'submitted'`.
- The same guardian **cannot** set `status: 'approved'` (tested by direct write).
- A coach sees the submission and approves it; the guardian then sees *Approved*.
- A guardian cannot read another athlete's submission (tested by direct read).
- An expired form shows *Expired* and offers re-submission, not a dead end.
- Coach/staff/AD paths unchanged — regression pass against the rules tests.

### Risks

| Risk | Mitigation |
|---|---|
| Rules change widens access unintentionally | Predicate is narrow (own entries only); run the full rules suite before deploy |
| Two identifier spaces remain in the data | Accept both now; migrate later with a documented script |
| Guardian self-approves | Write rule pins `status == 'submitted'` |
| `signedAt` unit drift | Write epoch **seconds**, matching iOS conventions |

### Rollback

Rules deploy is one `firebase deploy --only firestore:rules`; the previous version is
recoverable from git. No data migration is part of this phase, so rollback carries no
data risk.

---

## PHASE C — STEP 1 SHIPPED (rules)

Deployed to `rocklab-athletics` — validation clean, deploy reported success.

**Changed in `firestore.rules`:**

1. New `linkedToAthlete(entry)` helper replacing the inline logic that existed twice.
2. `isRosterAssignee` and `isGuardianOf` both use it, so releases (`releases`,
   `releasePlans`, lines ~301/307/317) are fixed for invitation-linked guardians as
   well as forms.
3. `read` on `teams/{t}/roster/{entryId}/forms/{formId}` and on
   `teams/{t}/forms/{formId}/submissions/{entryId}` now admits `isGuardianOf`, so a
   guardian whose membership is `follower` can load their own athlete's paperwork.

### The correction that mattered

The first draft also matched `linkedPlayerIds` against the **roster entry id**, which
is what `acceptInvitation` stores. Reviewing my own change against the `users` rule
showed self-update is **not field-restricted** — so any account can write any value
into its own `linkedPlayerIds`. Combining that with entry-id matching would have let
anyone who learned an entry id (visible in invite links and `?athlete=` URLs) claim
that athlete's forms and releases.

Final authority is therefore:

- `entry.guardianUserIds` — written only by `acceptInvitation` (server), roster entries
  writable only by coaches/AD. **Trusted.**
- `linkedPlayerIds` naming the athlete's own `userId` — preserves the legacy
  `linkChild` path. **Trusted only in that form.**
- `linkedPlayerIds` naming a roster entry id — **deliberately rejected.**

Trade-off accepted: `users.linkedPlayerIds` remains client-writable and is now only
partly load-bearing. Making it server-written (or dropping it in favour of
`guardianUserIds` everywhere) is the follow-up that removes the ambiguity for good.

### Behavioural verification — RUN 2026-11-21 against deployed rules

Executed with real ID tokens (Identity Toolkit sign-in) against the live project, using
the existing fixture: team `ThX1C2rqdiTltVEORf8R`, roster entry `2bpqIPNdScB854xYq7Js`
(`guardianUserIds: [sTlC…]`), form `Vboc5vEiUBD2zuy1PFjo`.

| Test | Expected | Actual | Result |
|---|---|---|---|
| Guardian reads own athlete's form | 200 | 200 | **PASS** |
| Guardian reads another athlete's form | 403 | 403 | **PASS** |
| Guardian writes submission `status: 'submitted'` | 200 | 200 | **PASS** |
| Guardian writes submission `status: 'approved'` | 403 | 403 | **PASS** |
| Unrelated follower reads the form | 403 | 403 | **PASS** |
| AD reads the form | 200 | 200 | **PASS** |
| Athlete writes own submission | 200 | — | **NOT RUN** (password differs from the test set) |
| Athlete writes `status: 'approved'` | 403 | — | **NOT RUN** (same) |

**6 of 8 executed, 6 passed.** The two athlete cases are the same code path as the
guardian cases (`isRosterAssignee` self-branch) but have not been proven; they stay
open until an athlete login is available. The submission written during the test was
deleted afterwards.

Defect #24 is therefore closed, and the read/write path the portal depends on is real —
not merely plausible.

---

## PHASE C — STEP 2 SHIPPED (pure logic)

`web/lib/portal.mjs`:

1. **`myAthletes` now trusts `guardianUserIds` first.** That field is set by
   `acceptInvitation` server-side and roster entries are writable only by coaches/AD,
   so it is the one marker a guardian cannot write. `linkedPlayerIds` is retained as a
   fallback for rows written before the field existed, and matching its `userId` keeps
   the legacy `linkChild` path alive.

   Known consequence, accepted deliberately: a guardian holding only a forged or stale
   `linkedPlayerIds` will be *shown* an athlete whose data the rules then refuse. The
   failure mode is an empty panel, not a leak — denial, never widening.

2. **Requirement vocabulary** — `REQUIREMENT_STATUS` (required, completed,
   pending_approval, rejected, expired, overdue) with `REQUIREMENT_LABELS`, plus
   `requirementStatus(form, submission, now)`, `isOutstanding`, and
   `outstandingRequirements`.

   Precedence decisions worth keeping:
   - An **approval lapses**: approved + past `expiresAt` returns `Expired`, because an
     expired physical makes the athlete ineligible again. Showing "Completed" here
     would be the most damaging possible answer.
   - A **passed due date outranks "Pending approval"** — three weeks late is Overdue.
   - An **approved form is never Overdue**, even past its due date.
   - Rows with **no deadline sort last**, so they cannot jump the queue.

**Tests: `node --test lib/portal.test.mjs` → 39 passing, 0 failing** (was 22; 17 added:
4 guardian-matching, 13 requirement-status).

Not yet done: the requirements panel and submit flow in `portal.js`, multi-athlete
switching with `?athlete=`, and an end-to-end browser run.

