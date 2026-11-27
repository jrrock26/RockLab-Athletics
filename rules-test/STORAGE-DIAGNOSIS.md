# Storage rules: why nine real-bucket tests fail

Measured on `rocklab-athletics-staging`, 2026-11-27. No production IAM, rules or data touched.

## The ceiling

Google documents it plainly: *"No more than two Firestore documents may be accessed in a single Rules evaluation."*
<https://firebase.google.com/docs/storage/security/rules-conditions>

Proven on the bucket with a temporary diagnostic ruleset (since removed; reviewed rules re-verified byte-identical):

| Documents read in one rule | Result |
|---|---|
| `users` + `teams` | **200** |
| `users` + `teams` + `schools` | **403** |
| `users` + `teams` + `schools` + `members` | **403** |

The third lookup does not fail because a document is missing. It fails because the evaluation is
already over budget, and an over-budget evaluation returns deny — indistinguishable from a real denial.

## Lookup count per composed path

Distinct documents accessed through `firestore.get()` / `firestore.exists()`:

| Function | Documents | Count |
|---|---|---|
| `role()` | `users/{uid}` | 1 |
| `schoolOfTeam(t)` | `teams/{t}` | 1 |
| `membership(t)` | `teams/{t}/members/{uid}` (exists + get, same doc) | 1 |
| `isCoachOf` / `isTeamMember` / `isFollower` | `teams/{t}/members/{uid}` | 1 |
| `guardianOfEntry()` | `teams/{t}/roster/{e}` | 1 |
| **`adOfTeam(t)`** | `users/{uid}` + `teams/{t}` + `schools/{schoolId}` | **3** |
| **`staffOfTeam(t)`** | the above + `teams/{t}/members/{uid}` | **4** |

| Rule | Chain | Worst case | Verdict |
|---|---|---|---|
| media read | `adOfTeam` + member + follower | AD: 4 · coach/parent: 2 | AD over |
| media write | `adOfTeam` + coach + staff | AD: 4 · coach: 2 | AD over |
| film read/write | same as media | AD: 4 | AD over |
| paperwork read/create/delete | `staffOfTeam` + `guardianOfEntry` | AD: 5 · guardian: 3 · coach: 2 | AD and guardian over |

## Why the pattern looked strange

`adOfTeam` short-circuits at `role() == 'ad'` for anyone who is not an AD. So a coach or a parent
costs one document there, and their paths land on exactly 2 — which is why coach and member tests
passed while the AD's failed. The guardian's paperwork path is the only one where a non-AD
legitimately needs three documents: `users` (role) + `members` (not staff) + `roster` (guardian).

## What the nine failures actually are

| # | Test | Count | Kind |
|---|---|---|---|
| 1–3 | AD team media create / overwrite / delete | 4 | over budget |
| 4–5 | AD film read | 4 | over budget |
| 6, 7 | guardian paperwork create / delete | 3 | over budget |
| 8, 9 | parent / athlete media read → **404** | 2 | **permitted; the object was never created** because test 1 was denied |

Tests 8 and 9 are not authorization failures. They are the visible consequence of test 1.

## Proposed correction (not applied — needs approval)

**A. A per-team manager list, maintained server-side.** Add `managerUserIds` to the team document:
the AD of the owning school, plus every coach and staff member. Then:

| Rule | Documents |
|---|---|
| media / film, staff branch | `teams/{t}` → 1 |
| paperwork staff branch | `teams/{t}` → 1 |
| paperwork guardian branch | `teams/{t}/roster/{e}` → 1 |
| paperwork either branch | 2 |

No path exceeds 2, school ownership stays explicit (`teams/{t}.schoolId`), and the list is
team-scoped so a cross-school AD cannot appear in it. Cost: server code to maintain it on
staff/coach/AD/team-school changes, plus a one-off backfill, plus a drift test.

**B. Cheaper, partial, no new fields.** Re-point `adOfTeam` at `users/{uid}.schoolId` compared with
`teams/{t}.schoolId` — both are server-controlled, and `firestore.rules` already forbids a client
from asserting its own `schoolId`. That is exactly 2 documents and fixes the AD media and film paths.
It does **not** fix guardian paperwork, where the chain is `users` + `members` + `roster` = 3, and
reordering the disjuncts only moves the overrun onto the coach. B is a stopgap, not a solution.

## What was ruled out

- **IAM.** The narrow `roles/firebaserules.firestoreServiceAgent` binding gives identical results to
  the broader `roles/datastore.viewer` (31/40 both). `roles/datastore.viewer` has been removed;
  `roles/firebasestorage.serviceAgent` retained.
- **Fixture data.** Field names, types and relationships verified directly against Firestore for the
  team, roster entry and user documents.
- **Path construction.** `2 documents (users+teams)` proved the dynamic paths resolve correctly.
- **Missing documents.** A missing document would deny on the first lookup, not after two successes.
