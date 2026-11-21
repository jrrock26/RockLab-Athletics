# RockLab Athletics — Development Master Plan

Created: 2026-11-21. Scope: the 12-feature directive.
Status vocabulary: NOT STARTED · DISCOVERY · PLANNED · IMPLEMENTING · TESTING · NEEDS FIXES · COMPLETE · BLOCKED

## 0. Where the product actually is (verified, not assumed)

Verified this session by building, deploying and testing:

- iOS app builds; **60 unit tests pass**; installs and launches in the simulator.
- `functions/`: **31 tests pass** (10 booking, 17 reel planning, 4 reel CLI).
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
| 1 | Invitations & onboarding | **DISCOVERY DONE / PLANNED** | SMTP credentials | ~70% built; see §2 |
| 2 | Parent web portal | NOT STARTED | A non-admin web shell | No parent/coach web pages exist |
| 3 | Player web portal | NOT STARTED | #2 (shell + consent model) | Minor-consent rules needed first |
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


## 3. Industry benchmark (initial pass — re-verify before each feature)

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
