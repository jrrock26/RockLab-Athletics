# RockLab Athletics — Development Master Plan

Created: 2026-11-21. Scope: the 12-feature directive.
Status vocabulary: NOT STARTED · DISCOVERY · PLANNED · IMPLEMENTING · TESTING · NEEDS FIXES · COMPLETE · BLOCKED

## 0. Where the product actually is (verified, not assumed)

Verified this session by building, deploying and testing:

- iOS app builds; **60 unit tests pass**; installs and launches in the simulator.
- `functions/`: **42 tests pass** (31 at baseline; 11 added for the invitation rules).
- Firestore + Storage rules compile and are **deployed**.
- Two real accounts created and used to test permissions end to end.
- Live data inspected through the Firebase MCP server (invitations, schools, teams,
  games, plays, roster) — the schema is real and populated.

Working subsystems: rosters, eligibility-from-forms, schedules, attendance, release
plans, live scoring per sport, spectator view, facility/bus booking (transactional),
verified stats, career records, AD succession, film upload + clip markup (no
rendering), invitations with codes/links/statuses.

**Caveat that governs every estimate below:** no feature has been exercised by a real,
untrained user. Everything is verified by tests, rules and scripted runs. That is not
the same as usability.

## 1. Feature register

| # | Feature | Status | Hard dependency | Reality check |
|---|---|---|---|---|
| 1 | Invitations & onboarding | **IMPLEMENTING (1–4 done)** | SMTP credentials | Expiry, athlete link, resend tracking, schema tolerance shipped; email half blocked |
| 2 | Parent web portal | **DISCOVERY DONE, PLANNED — see `docs/PARENT-PORTAL.md`** | 2 rules defects (below) before any UI | Portal shell + accept + athlete view live; requirements/submit blocked by rules |
| 3 | Player web portal | **DISCOVERY DONE, PLANNED — see `docs/PLAYER-PORTAL.md`** | Rules fix (minor-can-consent hole) + an athlete credential | A player can currently sign their own consent forms |
| 4 | Data imports | NOT STARTED | — | Existing MaxPreps importer must be audited first |
| 5 | Group chat, media, polls | NOT STARTED | #2 for web; web push | Largest build in the list |
| 6 | Email + SMS notifications | BLOCKED | SMTP, then an SMS provider | 10DLC/STOP compliance is process, not code |
| 7 | Scheduling, RSVP, calendar | NOT STARTED | #2 | `.ics` feed is the cheapest high-value win |
| 8 | State rules & eligibility | NOT STARTED | Legal review of sources | Highest liability per line of code |
| 9 | Physicals & expiry | NOT STARTED | #8, and #6 for reminders | Reminders need the notification layer |
| 10 | Bulk import & management | NOT STARTED | #4 | Needs background jobs + job status |
| 11 | Facility/bus gap analysis | **DISCOVERY NOT DONE** | — | Works today; audit before touching |
| 12 | Web visual identity | NOT STARTED | #2–#7 exist to style | Deliberately last |

## 2. Feature 1 discovery (complete, evidence-based)

Inspected live `invitations` documents through the Firebase MCP server.

**Already implemented**

- Documents carry `email`, `role` (ad/coach/staff/player/parent/follower), `schoolId`,
  `teamId`, `sportNames`, `code`, `token` (older rows), `createdAt`,
  `invitedBy`/`invitedByName`, `status`, `acceptedBy`, `acceptedAt`.
- **Generated invite URL**: `https://rocklab-athletics.web.app/invite/?email=…&code=…`
  with a matching `web/pages/invite.js`.
- **Delivery tracking that admits failure**: `deliveryStatus: not_configured` plus
  `deliveryNote: "No email provider configured. Copy the invite link and send it
  directly."` That is the right pattern — degrade honestly, never pretend to send.
- Callables: `createInvitation`, `acceptInvitation`, `rejectInvitation`,
  `deleteInvitation`, `onInvitationCreated` (nodemailer), `inviteAdSuccessor`,
  `acceptAdTransfer`, `manageUserRole`.
- iOS: `MyInvitationsView`, team invites in `TeamDetailView`, AD handoff screen.
- Rules: readable only by the invitee (token-email match), the school AD, or the team
  coach; `role: 'ad'` invitations cannot be created by a client.

**Defects found**

1. `deliveryStatus` is `not_configured` on every document — **no email is ever sent.**
   Your three pilot ADs will report "I invited them and nothing arrived."
2. Schema drift: older rows carry `token`, newer rows `code` + `inviteUrl`; older rows
   have empty `schoolName`. Acceptance must tolerate both shapes.
3. No `expiresAt` field, yet "expired" is a required state. Status is time-blind.
4. No send tracking (`lastSentAt`, send count), so "resend" cannot be audited.
5. **No parent↔player link on acceptance** — a parent invitation does not record which
   athlete it authorises. Directive §1C requires this.
6. Duplicate *invitations* are possible for the same email (two accepted coach invites
   were observed), even though duplicate *memberships* are prevented by doc ID.

**Blocking dependency:** `SMTP_HOST/PORT/USER/PASS/FROM` are unset
(`docs/RELEASE-CHECKLIST.md`). A credential, not a build. Feature 1 cannot pass its
completion criterion until it exists.


## 2b. Feature 2 discovery (complete)

Inspected the existing `web/` app, the rules, and the live test data. Feature 2 is
**not** a from-scratch build: a Next.js 14 static-export app already exists
(`output: 'export'`, deployed via Hosting from `web/out`), sharing the same Firebase
project and its `lib/firebase.js` SDK init.

**Already exists**

- Shell: `pages/index.js` (sign-in + `useAuth` hook, reused by other pages),
  `pages/dashboard.js` (AD-only console), `pages/import.js`, `reports.js`, `audit.js`,
  `records.js`, `billing.js`, `support.js`, `privacy.js`, `pages/invite.js` (public).
- `lib/firebase.js` exports `auth`, `db`, `functions`; `httpsCallable` is already used,
  so the parent portal can call the existing `acceptInvitation` rather than reimplement
  acceptance on the web.
- Shared styles in `styles/`; cards/nav conventions in `dashboard.js` to follow.

**What the rules already permit a parent** (membership role `parent` is stored as
`follower` by `acceptInvitation` — deliberate, not a bug):

| Data | Parent (follower) access |
|---|---|
| `teams/{t}` | any signed-in user |
| `teams/{t}/roster` | **listing is staff-only.** A guardian may read only the specific entries that name them (`guardianUserIds`) |
| `events` | **only** `type in ['game','meeting','meal','travel']` — "followers see the team calendar except practice details (item F)" |
| `games` | any signed-in user |
| chat `commBoard` | allowed for `follower`; `parent`/`team` channels are not |

**Hard constraint this creates:** the event rule depends on `resource.data.type`, so a
plain `where('teamId','==',id)` list query is **rejected** — Firestore cannot prove the
type predicate. The portal must query
`where('teamId','==',id).where('type','in',['game','meeting','meal','travel'])`.
Practice details are withheld architecturally, so the UI must not imply they are
missing by accident.

**Gaps that block a working portal**

1. **No parent page.** `invite.js` tells a parent to install the app and accept under
   *Settings → Invitations* — which dead-ends for the Android half of parents. This is
   the pilot blocker stated in §5.
2. **No web sign-up → accept path.** Parents invited with no existing account cannot
   create one and accept on the web; only iOS can.
3. **The athlete link is not reachable from any UI.** Feature 1 now writes
   `rosterEntryId` and links `linkedPlayerIds`, but both
   `createInvitation` call sites (`OnboardingViewModel`, `InviteCoachSheet`) omit it.
   The mechanism works when the field is present; nothing sets it yet. The natural
   origin is a roster entry's existing `parentEmail`, which is where an
   "invite this athlete's guardian" action belongs.
4. **Test data has no parent relationship.** The test parent account holds only
   `schoolId` + `role: follower`, with no team membership and no `linkedPlayerIds` —
   so any portal built against it would render empty and prove nothing.

**Sequencing consequence:** build the smallest honest portal (sign in → accept
invitation → see linked athlete → upcoming games/events → roster), and seed a real
guardian↔athlete link first, or the feature cannot be verified as working.

### 2c. Corrections from building it (items that were wrong above)

Walking the real path with a brand-new account contradicted the discovery in three
places. The corrections matter more than the original notes:

1. **Roster was NOT readable by a follower.** The first pass cited line 189, which is
   the `videos`/`reels` rule; the actual roster rule is `isAd() || isTeamMember()`, and
   `isTeamMember` excludes `follower`. Listing the roster is staff-only — correctly so,
   because an entry carries the guardian's contact details.
   **Resolved by narrowing rather than widening:** a guardian may read only entries
   whose `guardianUserIds` contains them, written by `acceptInvitation`. Verified against
   deployed rules: own child 200, roster list 403, another family 403.
2. **A single denied read blanked the whole team card.** `Promise.all` rejected on the
   roster 403, so the page claimed "no team has been shared". Reads are now settled
   independently and the roster falls back to per-document reads.
3. **Every real invitation was rejected as expired.** iOS writes `expiresAt` in epoch
   *seconds*; the comparison was against `Date.now()` in *milliseconds*. The unit is now
   inferred and pinned by a regression test written from the client's write path. This
   was shipped in the previous commit and only a live acceptance exposed it.

Also confirmed live: the events rule **rejects** an unfiltered `where('teamId','==',id)`
(403) and accepts it with the type filter (200). A parent's "Next up" shows the game and
not the practice, which is the intended privacy behaviour, not a bug.




| Product | What they do well | What to avoid | Where RockLab can beat them |
|---|---|---|---|
| **Band** | Free; NFHS-exclusive partner; iOS+Android+web; chat, schedule, photos, polls; publishes DPAs | Chat-first, so rosters/eligibility/stats are absent; no verified records | Game day: live scoring, spectator feed, verified career stats |
| **TeamSnap / ONE** | Excellent family model (one guardian, many athletes); registration; availability | Youth/club oriented; shallow school compliance | School-grade eligibility tied to state rules |
| **SportsEngine HQ** | Org websites, registration, tournaments, DPA process | Heavy, dated UX; admin-only feel | Coaches and parents in one coherent app |
| **GameChanger** | Live scoring families actually watch; strong scorekeeping UX | Score-first; no AD or compliance layer | Verified stats → career records; multi-sport |
| **Stack Team App** | Simple team comms + schedule + media | Generic; no school records | Integrated compliance and logistics |

**Sequencing conclusion:** RockLab's defensible wedge is *game day + eligibility +
verified records*. Communication is table stakes that must reach parity but will never
be the reason a school switches.

## 4. Sequence, and why

1. **Feature 1** — nothing else onboards without it; blocked only on SMTP.
2. **Feature 2** (parent web) — unlocks Android/web reach, the pilot's real blocker.
   One codebase covers Android; no Android build required.
3. **Feature 6, email half** — reminders depend on it; SMS deferred (10DLC).
4. **Feature 7** (schedule/RSVP/ics) — best value per day after #2.
5. **Feature 3** (player web) — reuses #2's shell; settle consent first.
6. **Feature 5** (chat/media/polls) — Band parity, but *after* parents already log in
   for #2/#7, so chat is additive rather than the reason to install.
7. **Feature 9** (physicals) then **8** (state rules) — expiry needs reminders; state
   rules need legal review, so mechanics come first.
8. **Feature 4** then **10** (imports, bulk) — migration tooling sells the switch.
9. **Feature 11** (booking audit, then repair) — it works today; audit before edits.
10. **Feature 12** (visual identity) — last, because there must be pages to style.

## 5. Standing risks

- **Reach:** iOS-only excludes roughly half of parents. Until Feature 2 ships, no school
  can *replace* Band with RockLab.
- **Legal:** Features 8 and 9 carry liability (eligibility, medical documents, minor
  consent). Rule sources must be authoritative and versioned; AI-derived readings must
  never be presented as official rules.
- **Comms compliance:** SMS requires consent records, STOP/HELP handling and 10DLC
  registration — a business process, not a sprint task.
- **Trust:** this session found and fixed a privilege escalation. Assume more exist;
  a third-party security review is a release gate.

## 6. Definition of done (applies to every feature)

A feature is COMPLETE only when: implemented end to end · permissions enforced
server-side · tests executed (output recorded) · regression suite still green · works
for every in-scope role · documents updated · a real user path has been walked.
