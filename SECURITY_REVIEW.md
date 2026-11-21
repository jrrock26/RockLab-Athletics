# Security Review

Living document. Findings below are from direct inspection and from tests actually run
against the deployed rules, not from assumption.

## Findings

### S-1 — Privilege escalation to athletic director (CRITICAL, FIXED)

`users/{uid}.role` was client-writable with no validation beyond "it's your own
document", and `isAd()` was defined as `role() == 'ad'` with **global** reach. Any
signed-in account could write `role: 'ad'` to itself and then read every user record,
edit any school and create or delete teams anywhere.

**Fix (deployed):** AD standing is now ownership of the school you belong to —
`ownsSchool()` compares `schools/{schoolId}.adUserId` with the caller. All 43 `isAd()`
call sites inherit the restriction. Also scoped: `schools` update/delete to
`resource.data.adUserId == uid()`, `teams` create/delete to the caller's own school,
and `users` read for coach/staff to the same `schoolId`.

**Verified** against live rules with two accounts, 11/11: follower cannot self-promote,
cannot name a victim school, cannot edit school/team, cannot write plays; the real AD
keeps full access; a follower still reads games and plays.

### S-2 — Cross-tenant reach in `manageUserRole` (HIGH, FIXED)

The callable authorised on `callerRole === 'ad'` alone, so any AD could manage users in
any school. Now requires the target to share the caller's `schoolId`, and refuses
`newRole: 'ad'` outright because AD moves by handoff only.

### S-3 — AD is a single-owner role (design, RESOLVED)

An AD leaving a school had no successor path. Implemented `inviteAdSuccessor` +
`acceptAdTransfer`: two-step, transactional, stale-invite-proof, supersedes earlier
pending handoffs, demotes the outgoing AD to follower while preserving team
memberships. Verified 14/14 with two live accounts.

### S-4 — Client-writable coach/staff labels (OPEN, MEDIUM)

`role` is still written by the client. A user can claim `coach` or `staff`. After S-1
this only unlocks same-school data, but it is still a claim, not a grant. Durable fix:
move AD/staff to custom claims set by a Cloud Function, or derive authority from
memberships only.

### S-5 — Rules versus claims divergence (OPEN, LOW)

`syncUserRoleClaims` mirrors `users.role` into a custom claim by trigger. Rules read
Firestore, so a lagging claim cannot grant access — but code that trusts the token
could disagree with the rules for a moment.

### S-6 — Storage and document access (REVIEWED, ADEQUATE)

- Game film: read limited to AD/members/followers of that team; write to AD/coach/staff;
  size capped at 4 GB in both app and rules.
- No signed URLs or expiring links are used; access is rule-checked on every read.
- Medical/physical documents are not yet stored (Feature 9). When they are, they need
  rule-scoped access, per-user download links, and an audit trail — **do not reuse the
  team-media pattern for them.**

## Practices that held up

- Booking enforcements happen inside a transaction (`partitionCandidates`), so overlap
  cannot be raced.
- Passwords and mail: no credentials in the repo; secrets go through
  `firebase functions:secrets:set`.
- The Stripe webhook fails closed (503) when secrets are absent rather than accepting
  unsigned events.
- Play writes are batched with score and stat, so a partial write cannot desync a box
  score.

## Open actions before any school onboards

1. Third-party review of `firestore.rules` and `storage.rules` (they are the real
   perimeter; the app UI is not).
2. Decide and document minor-consent rules before Feature 3 (player accounts).
3. Add App Check attestation for callables if not already enabled in the console.
4. Define retention and deletion for film and (later) medical documents.
5. Record an audit-log review screen so admins can actually see `auditLogs`.
