# Known Issues

Ordered by how much they block the pilot. Every entry is something observed, not
suspected.

## Blocks pilot adoption

| # | Issue | Where | Impact |
|---|---|---|---|
| 1 | **No email is sent for invitations** — `deliveryStatus: not_configured` on every invitation; SMTP secrets unset | `functions/index.js` `onInvitationCreated`, `docs/RELEASE-CHECKLIST.md` | ADs invite parents, nothing arrives. Onboarding fails at step one. |
| 2 | **No Android or web access for parents** — the web app is 11 admin-only pages; iOS is the sole way in | `web/pages/`, `RockLabAthletics.xcodeproj` | ~Half of families cannot participate at all. Blocks replacing Band. |
| 3 | **Billing cannot collect money** — no prices defined anywhere, Stripe secrets unset, `createCheckoutSession` throws "not configured" | `functions/index.js`, `web/lib/plans.js` | Pilot cannot convert to paid. |
| 4 | **Team and reel limits advertised but unenforced** — only video storage is checked | `functions/index.js` `entitlementFor` | A Free school can exceed every advertised limit. |
| 5 | **Free plan cannot accept a game film** — 1 GB allowance vs 4 GB upload cap | `PLAN_LIMITS` vs `HighlightService.maxUploadBytes` | The headline workflow fails on Free. |

## Feature defects

| # | Issue | Where | Impact |
|---|---|---|---|
| 6 | Parent invitations record no athlete link | invitation accept path | A parent cannot be tied to the player they were invited for (directive §1C). |
| 7 | No `expiresAt` on invitations, yet "expired" is a required state | `invitations` docs | Stale invites stay actionable forever. |
| 8 | No resend audit (`lastSentAt`, send count) | `invitations` docs | "Resend" cannot be tracked or rate-limited. |
| 9 | Duplicate invitations allowed for one email | `createInvitation` | Two accepted coach invites observed for the same address. |
| 10 | Schema drift in `invitations` (`token` vs `code`, empty `schoolName` on older rows) | live data | Acceptance must tolerate both shapes or old invites break. |
| 11 | **Highlight reels never render** — no MP4, no export; `ShareLink` shares text | `Models/HighlightReel.swift`, `ReelPlayerView` | Cannot publish to social. Renderer exists as tested planning logic only. |
| 12 | Full game film is retained forever; no purge | storage | Unbounded cost; contradicts the produce-then-delete model. |
| 13 | Clip ranges depend on the source video | `ReelClip` | Deleting an upload silently breaks every highlight made from it. |

## Security & correctness

| # | Issue | Where | Impact |
|---|---|---|---|
| 14 | `role` remains client-written for coach/staff labels | `firestore.rules` | Forgeable, now confined to same-school data after the AD fix. |
| 15 | No third-party security review or pen test | — | Release gate, not a nice-to-have. |
| 16 | Role claims and `users.role` can diverge (claims sync is a trigger) | `syncUserRoleClaims` | Rules read Firestore, tokens carry claims; drift is possible. |
| 17 | `manageUserRole` was globally scoped | `functions/index.js` | Fixed this session: now same-school only. |

## Process / infrastructure

| # | Issue | Impact |
|---|---|---|
| 18 | **No user has ever run this.** All verification is tests, rules and scripted API calls | Usability and trust are unproven |
| 19 | No CI; tests are run by hand | Regressions can land unnoticed |
| 20 | No monitoring/alerting or crash triage on functions | Failures are silent |
| 21 | No data import path from DragonFly/FinalForms/MaxPreps | Switching cost blocks deals |
| 22 | App Store submission not started (UGC app → moderation must be demonstrable) | Cannot ship to parents via TestFlight alone |

## Parent portal blockers (Feature 2 discovery, 2026-11-21)

Both verified by reading the rule and every writer, not by guesswork. Detail and plan:
`docs/PARENT-PORTAL.md`.

| # | Issue | Where | Impact |
|---|---|---|---|
| 23 | **`linkedPlayerIds` is client-writable and holds two different kinds of id** — `acceptInvitation` stores a roster entry id, `linkChild` stores a player UID. Rules now trust only `guardianUserIds` plus a `linkedPlayerIds` entry naming the athlete's own uid; a roster entry id confers nothing, because it is guessable and appears in URLs | `functions/index.js`, `firestore.rules` `linkedToAthlete` | Resolved for authorization. Remaining debt: the field is still client-writable and only partly load-bearing — make it server-written as follow-up |
| 24 | **Parents were given membership role `follower`**, which `isTeamMember` does not accept, so `forms`/`submissions` were unreadable | `functions/index.js` `acceptInvitation`, `firestore.rules` | **FIXED and VERIFIED** — guardian read on per-athlete forms and submissions via `isGuardianOf`; 6/6 executed cases pass against deployed rules (`docs/PARENT-PORTAL.md`). Athlete-writes-own case not run (no athlete login) |

## Recorded but out of scope (do not fix mid-feature)

- Opponent plays cannot be logged in scoring (only "Correct score"), so half of a
  game's plays are invisible to the spectator feed.
- `spectator` home list loads on open rather than listening, so a game flipping to live
  appears on the next open.
- Transfers copy roster entries but not injury history.
- The stadium poster used on the auth screen contains baked-in text that collides with
  the overlaid title.
