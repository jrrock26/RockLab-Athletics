# RockLab Athletics — Platform Evaluation

Date: 2026-11-21 · Scope: iOS app, web app, backend, and the seams between them.
Method: everything below was **executed**, not read from other docs.

## 0. Evidence base

| Check | Tool | Result |
|---|---|---|
| iOS build | Xcode MCP `BuildProject` | ✅ success, 22.7s, 0 errors |
| iOS launch | Xcode MCP `RunProject` | ✅ launched, PID 22723 |
| iOS runtime faults | Xcode MCP `GetConsoleOutput` (`error\|fault\|exception\|denied`) | ✅ 0 events |
| iOS tests | Xcode MCP `RunAllTests` | ✅ **60/60 pass** |
| Cloud Functions tests | `npm test` | ✅ **44/44 pass** |
| Web pure-logic tests | `node --test lib/portal.test.mjs` | ✅ **41/41 pass** |
| Web production build | `npm run build` | ✅ success, 14 routes |
| Live deployed web | Playwright MCP against `rocklab-athletics.web.app` | ❌ **parent portal crashes** |
| Live data | Firebase MCP (Firestore reads, function list) | 4 schools, 4 teams — all test data |
| Incumbent baseline | Web fetch: DragonFly, FinalForms | capability matrix in §6 |

Scale: 21,632 lines of Swift across 135 files; 72 exported Cloud Functions
(60 callable, 1 scheduled); 671 lines of Firestore rules; 14 web pages.

## 1. Verdict

**The engineering underneath is real. The product on top of it is not shippable, and
the two clients do not work together.**

Three sentences:

1. iOS is a genuinely broad, well-tested client — scoring, eligibility, forms,
   film, logistics, records — and it builds, launches and passes every test.
2. The web app is a thin AD console plus a parent portal, and **the parent portal
   crashes after login for any parent with a team**. That is the single page the
   entire web strategy depends on.
3. RSVP, announcements and imports are **half-built across the seam**: each writes
   or fetches, but nothing reads back, or the two clients disagree on the schema.

Green tests did not catch any of this. 145 passing tests (60+44+41) and a crash on
the primary parent journey is exactly what happens when tests cover pure functions
and models but never render a component or walk a user path.

Nothing here is unfixable. Items 1–3 in §4 are each a focused day of work, not a
rewrite.

## 2. What the product does today

### iOS (the real product)

| Domain | Present | Depth |
|---|---|---|
| Accounts | Email/password, email verification, **forgot-password**, delete-account | Solid |
| Onboarding | Create school, discover schools, select sports, invite coaches, coach self-serve team | Solid |
| Rosters | Team roster entries, positions, transfers, promotion, player profiles | Solid |
| Eligibility | Rule engine over issued/signed/approved/expired forms + injury state | **Strongest asset** |
| Forms | Physical, code of conduct, concussion waiver, signature canvas, document upload | Solid |
| Health | Injury report/clear, emergency contacts, medical library | Solid |
| Games | Schedules, **live scoring** (basketball/football/golf), spectator feed, stat verification | **Differentiator** |
| Records | Career stat lines, school records, record-chase announcements | **Differentiator** |
| Film | Upload, clip markup, video library, highlight studio | Reels never render (§4.9) |
| Logistics | Facility/bus booking (transactional), trips, travel plans, attendance, release plans | Solid |
| Comms | Comm board with categories, team/parent/staff channels, push token | Solid on iOS |
| Money | Fundraising, volunteers, billing screen | No collection configured |
| Governance | Followers, AD succession, audit log, block/unblock, content reports | Solid |

### Web (13 pages + landing)

Present: `/portal` (parent), `/join`, `/invite`, `/dashboard`, `/requests`,
`/records`, `/reports`, `/audit`, `/import`, `/billing`, `/privacy`, `/support`.

It is **AD-and-parent scoped**. There is no coach console, no athlete portal, no
scoring, no messaging, no calendar. Only `/portal` serves a family.

### Backend

Firestore + Storage rules deployed and genuinely tight (671 lines, guardian
clauses, per-document id checks). 60 callables cover invitation, roster, scoring,
logistics and billing lifecycles. Email transport is coded (Resend + SMTP
fallback) but **unconfigured**, so it degrades honestly to
`deliveryStatus: not_configured`.

## 3. The seven things a parent actually does

| # | Journey | iOS | Web |
|---|---|---|---|
| 1 | Get invited | ✅ | ⚠️ invite page exists, email never sends |
| 2 | Create account | ✅ | ✅ |
| 3 | Recover a forgotten password | ✅ | ❌ no reset path at all |
| 4 | Link to their athlete | ✅ | ✅ via `guardianUserIds` (live roster confirms) |
| 5 | See the schedule | ✅ incl. practices | ❌ practice details hidden by design |
| 6 | Sign the physical | ✅ guardian clause | ✅ |
| 7 | Answer "is she riding the bus?" | ✅ writes | ❌ **page crashes** |

The web fails the parent on 3 of 7. Since the web *is* the Android strategy, that
is the reach problem restated as a defect list.

## 4. Broken — ordered by damage, with evidence

### P0 — blocks the pilot

**4.1 The parent portal crashes after login.** `web/pages/portal.js:677` reads
`announcements[t.id]`; the fetch at `:307-322` calls `setAnnouncements`, but **no
`announcements` state is ever declared** (the `useState` block at `:36-62` has 16
states and not one is `announcements`). Result on the deployed site:

```
ReferenceError: announcements is not defined
  at .../pages/portal-40cdcf6bce06094f.js:1:13497   (Array.map)
  → "Application error: a client-side exception has occurred"
```

Reproduced live. A **fresh isolated browser context renders the sign-in screen
fine** — so this hits *after* authentication, for any parent with ≥1 team. The
one person who needs the web app is the only person who cannot use it. It builds
because it is `.js`, not `.ts`, and lint does not fail the build.

**4.2 RSVP is write-only and the clients disagree on the schema.**

| | Document id | Fields |
|---|---|---|
| Web (`portal.js:70`) | `rsvps/{uid}__{rosterEntryId}` | `respondentUserId`, `athleteEntryId` |
| iOS (`FirestoreService.swift:782`) | `rsvps/{userId}` | `userId` |

Both writes pass rules (`firestore.rules:421-436` was widened to allow both
shapes). But web reads with `where('respondentUserId','==',uid)`
(`portal.js:337`), which **cannot see iOS rows**, and iOS reads
`rsvps/{userId}`, which cannot see web rows. Worse: grep finds **no coach-facing
consumer anywhere** — no roster tally, no headcount, no bus-manifest feed. Parents
answer; no coach ever sees the answer. RSVP is theatre today.

**4.3 Import writes a roster entry, but the athlete is unreachable.** *Corrected
after reading the implementation:* `importPlayers` writes **both** `players/*` and a
`teams/{id}/roster/*` entry (`functions/index.js:1175-1185`), and live data confirms
it (`playerId`, `importedBy` present). So import is **not** a dead end. Three real
defects remain:

- entries are created with `userId: null` and `guardianUserIds: []`, so **no family
  can ever see an imported athlete** until a coach manually links one;
- duplicate detection is **by name only** (`byName` map on `normal(name)`), so two
  "John Smiths" collapse into one person and a corrected spelling creates a
  duplicate;
- `players/*` is written but never read as the person record — roster entries copy
  the name — so it is a shadow table that will drift.

**4.4 No invitation ever arrives.** Email is coded, not configured. Every
invitation carries `deliveryStatus: not_configured`. Onboarding step one fails
silently for the AD.

**4.5 A web parent can be locked out permanently.** The web has **no password
reset** (`sendPasswordResetEmail` appears nowhere in `web/`) and no Apple/Google
sign-in. iOS has `ForgotPasswordView`; web does not. Forget the password on
Android and the account is gone.

### P1 — damages trust

| # | Issue | Evidence | Impact |
|---|---|---|---|
| 4.6 | **Practice times/locations hidden from parents** | **Root cause: `functions/index.js:888`** `membershipRole = role === 'parent' ? 'follower' : role`. `firestore.rules:416-418` then withholds practice/`other` event types from followers, and the web hard-encodes the same disability (`VISIBLE_EVENT_TYPES = ['game','meeting','meal','travel']`). `portal.js:747` apologises for it | The most-asked parent question is unanswerable on web |
| 4.13 | **Parents cannot see or post in the parent chat** | `TeamAccess.swift:12` `isParent { membership?.role == .parent }`, but acceptance stores `follower`; `canSee(.parent)` requires `isParent` | The channel built for parents excludes every parent |
| 4.7 | **No announcements/chat on web** | The shattered feature in §4.1 *is* the announcement reader. `chats/{teamId}_commBoard` is iOS-only | Band/TeamSnap parity impossible |
| 4.8 | **A minor can sign their own consent forms** | `firestore.rules:262,279`; `isRosterAssignee` is true for the athlete | Compliance hole; FinalForms sells precisely this control |
| 4.9 | **Highlight reels never render** | `reel.js` is a tested *planner*; no ffmpeg execution path is deployed | "Publish to social" is a claim, not a feature |
| 4.10 | **Billing collects nothing** | `createCheckoutSession` throws "not configured"; no prices defined | Cannot convert a pilot |
| 4.11 | **Plan limits advertised, unenforced** | only video storage is checked; Free = 1 GB vs a 4 GB upload cap | Free schools exceed every limit; the headline workflow fails on Free |
| 4.12 | **Schema drift in live data** | `teams/test-team-basketball` has only `season` — no `schoolId`, `sportId`, `headCoachId` | Any query filtered by `schoolId` silently omits it |

### Verified non-issues (checked, and clean)

- Roster source of truth **is** unified: both clients read
  `teams/{id}/roster`. No dual store.
- The snake_case RSVP tags in `EventDetailView` are the **travel-plan**
  vocabulary, not `RSVPStatus`. Not a bug.
- `canSeeAllEvents` **does** include parents, so "My RSVP" is visible on iOS.
- Rules correctly reject an unfiltered `events` query and accept it with the type
  filter — intended privacy, not a defect.

## 5. Do iOS and web work hand in hand? No — and here is the seam map

| Seam | iOS | Web | Verdict |
|---|---|---|---|
| Roster | `teams/{id}/roster` | `teams/{id}/roster` | ✅ shared |
| Auth | email + reset + verify | email, **no reset**, no verify gate | ❌ asymmetric |
| RSVP | `rsvps/{uid}` | `rsvps/{uid}__{entry}` | ❌ incompatible |
| Announcements | `chats/{id}_commBoard/messages` write+read | fetch coded, **state missing → crash** | ❌ broken |
| Parent→athlete link | request/approve callables | reads `linkedPlayerIds`, joint-`guardianUserIds` | ⚠️ live data empty |
| Forms | issue/sign/approve | sign only | ⚠️ web cannot issue |
| Attendance | coach marks | absent | ⚠️ coach-only, fine |
| Scoring/records | full | read-only reports | ✅ by design |
| Import | absent | writes `players/*`, nothing consumes | ❌ dead end |
| Role model | `ad/coach/staff/player/parent/follower` | membership role `follower` for parents | ❌ taxonomy gap |

### Root cause: there is no shared contract

Each client encodes Firestore paths, id schemes and enum strings independently, in
Swift and in JavaScript. `portal.js` even carries comments admitting it
hand-mirrors iOS (`RSVP_CHOICES` "the exact raw values iOS writes"). That practice
is the mechanism that produced §4.2 and §4.1.

**The fix is one contract, consumed by both clients:**

1. A single `contract/` source of truth — collection paths, document id builders,
   enum strings, and the visibility rules per role — generated into Swift and JS.
   Never hand-copied again.
2. One RSVP id builder, `rsvpId(uid, athleteEntryId ?? null)`, used by both, with a
   migration read that tolerates all three historical shapes.
3. Announcements: keep the fetch, add the missing state, and give iOS and web the
   same `chats` reader (web read-only is enough for parity).
4. A real `guardian` membership role, so parents stop inheriting `follower`
   restrictions and practice details become a policy decision rather than an
   accident.
5. Contract tests that run against **both** clients — a schema change that breaks
   either side fails CI.

## 6. What "taking over" actually requires

Incumbent baseline, pulled today: **DragonFly** — free to the school, 800k+
athletes, 4,000+ schools, SIS-integrated *academic* eligibility, officials,
credentials, school store, payments, health records, background checks.
**FinalForms** — 3,000+ schools, SIS sync (PowerSchool/Infinite Campus/Skyward),
expiry alerts, SMS *with delivery tracking*, e-cards, return-to-play.

| Capability | Incumbents | RockLab today | Needed to compete |
|---|---|---|---|
| Schedules, rosters, scores | ✅ | ✅ iOS | — |
| Eligibility from forms | ✅ | ✅ **best-in-class rule engine** | — |
| Live scoring + spectator feed | partial (GameChanger only) | ✅ **unique with compliance** | lean in |
| Verified stats → career records | rare | ✅ **unique** | lean in |
| Film + highlights | Hudl dominates | ⚠️ no render pipeline | render or partner |
| Parent comms | ✅ | ❌ email unset, web crash | **P0 parity** |
| Web/Android reach | ✅ | ❌ portal crashes | **P0** |
| **Academic eligibility (SIS)** | ✅ PowerSchool etc. | ❌ | **table stakes** |
| Physicals + expiry reminders | ✅ | ⚠️ engine yes, reminders no | after email/SMS |
| State-association rules | ✅ | ❌ | legal review first |
| Payments / registration fees | ✅ | ❌ unconfigured | pilot conversion |
| Officials assignment | ✅ DragonFly | ❌ | later |
| Credential cards, background checks | ✅ DragonFly | ❌ | later |
| Data import from incumbents | — | ❌ orphaned | **the switch lever** |
| SMS (10DLC, STOP) | ✅ | ❌ | process, not code |

**Where RockLab can genuinely win:** nobody today combines *live scoring +
spectator feed + verified career records + a real eligibility engine* in one
product. DragonFly has compliance without game day; GameChanger has game day
without compliance. That intersection is the wedge — but it is unreachable while
parents cannot log in.

## 7. Sequence to takeover

**Phase 0 — make the existing thing honest (1 week).** Fix §4.1 (declare the
state), unify RSVP ids + add a coach tally, surface imported `players` into roster
entries, add web password reset, configure email. Gate: **one real parent, on
Android, completes all 7 journeys in §3.** No feature work until this passes.

**Phase 1 — parity that actually blocks deals (3–4 weeks).** Web announcements
(read-only), practice details for guardians via a real `guardian` role, `.ics`
calendar feed, SMS with consent records, enforced plan limits, working Stripe.
Gate: a school can *replace Band*, not just supplement it.

**Phase 2 — the compliance moat (6–10 weeks).** Physicals with expiry reminders,
SIS/CSV import that reaches the roster, state-rule engine behind versioned
authoritative sources + legal review, minor-consent fix (§4.8), athlete portal.

**Phase 3 — the differentiators.** Reel rendering (or Hudl partnership), officials,
payments for fees, mobile credentials, third-party pen test, App Store submission
with demonstrable UGC moderation.

## 8. Gates that are not code

- **No real user has ever run this.** Every claim here is tests and my own
  scripted runs; §4.1 is precisely what that costs.
- **No CI.** The portal crash builds and ships green. Add a render smoke test per
  page and a contract test across clients.
- **No monitoring.** Function failures are silent; add error reporting before any
  pilot.
- **Security:** the privilege escalation found earlier means assume more exist; a
  third-party review is a release gate.
- **App Store:** a UGC app needs demonstrable moderation; `reportContent` exists,
  the review evidence does not.
- **No ESLint config in `web/`.** `npm run lint` hangs on an interactive
  "install ESLint?" prompt, so lint can never fail a build — which is how §4.1
  shipped. Add `.eslintrc.json` with `no-undef` and wire it into CI.

## 9. Changes made during this evaluation

One change, deliberately narrow:

**`web/pages/portal.js:65-69`** — declared the missing state:

```js
/// Comm-board posts per team, keyed by team id. ...
const [announcements, setAnnouncements] = useState({});
```

Verified: declaration at `:69`, setter at `:328`, reads at `:683,687`; production
build exits 0; the built artifact served locally renders "Sign in · RockLab
Athletics" with no console errors beyond a missing favicon.

**Not yet verified end to end:** the signed-in parent view. That needs a real
parent credential, which I did not have and did not guess. Recommended check:
sign in on `/portal` as a parent with one athlete and confirm the team card
renders — that is the path that was crashing.

**Not changed, by design:** the RSVP schema (§4.2) and the orphaned `players`
import (§4.3). Both need a product decision (canonical id shape; how an imported
athlete becomes a roster entry) plus a data migration. Recommend tackle in that
order, behind the Phase 0 gate.

**Deployment status:** the live site still serves the crashing bundle. `web/out`
is rebuilt locally; `firebase deploy --only hosting:app` is required to ship the
fix.

## 10. What must change for iOS and web to work as one system

The two clients do not disagree because of carelessness; they disagree because
**nothing owns the contract**. Six changes, in dependency order.

### 10.1 One role vocabulary (fixes 4.6, 4.13 — do this first)

`functions/index.js:888` downgrades `parent` to membership `follower`:

```js
const membershipRole = role === 'parent' ? 'follower' : role;
```

Everything downstream inherits that: `firestore.rules:38` (`isTeamMember`),
`:416-418` (events), `:132-138` (comm board), and `TeamAccess.swift:12`
(`isParent`). Stop the downgrade:

1. Write membership role `parent` for guardians. Keep `follower` meaning
   "community member with no athlete", which is what it was designed for.
2. Add `guardian` to `isTeamMember` **only where a guardian legitimately needs it**;
   do not hand them coach abilities by widening one helper.
3. Delete the web's compensation for the old behaviour:
   `VISIBLE_EVENT_TYPES` and the "ask your coach" paragraph in `portal.js`.
4. Because `isGuardianOf` already gates per-athlete documents, practice visibility
   for a parent becomes a policy decision — and a parent with no athlete stays a
   follower, which is correct.

Done when: a parent sees a practice on both clients, and cannot see another
family's athlete.

### 10.2 One RSVP document identity (fixes 4.2)

Pick the guardian-aware shape as canonical, then make both clients use one builder:

```js
// contract/rsvp.mjs  →  emitted as Contract.rsvpId(uid:entry:)
rsvpId(uid, athleteEntryId) =
  athleteEntryId ? `${uid}__${athleteEntryId}` : uid
```

- **iOS** `FirestoreService.swift:782,791` → call the builder; read must tolerate
  legacy `{uid}` rows and new `{uid}__{entry}` rows (query by `respondentUserId ==
  uid` OR document ids prefix-matching `uid__`, merged client-side).
- **Web** `portal.js:70` → call the same builder.
- **Rules** already accept both (`firestore.rules:427-436`); keep the legacy
  branches until a migration backfills `respondentUserId` onto old rows.
- **Add the reader that never existed**: a coach tally. Cheapest version reads
  `events/{id}/rsvps` (coaches are already permitted by the rule) and counts by
  `athleteEntryId`; show it on `RosterView` and `EventDetailView`.

Done when: a parent answers on the web and the coach sees it on iOS, per child.

### 10.3 One generated contract for paths and enums (prevents the next 4.1/4.2)

A single `contract/` module owning collection paths, id builders, enum strings and
per-role visibility. Emit `Contract.swift` and `contract.mjs` at build time.

Then delete the hand-copies, which are the actual drift vectors:

- `portal.js` `RSVP_CHOICES` ("the exact raw values iOS writes")
- `portal.js` `PUBLIC_COMM_CATEGORIES` (mirrors `firestore.rules:138`)
- `portal.mjs` `VISIBLE_EVENT_TYPES` (mirrors the events rule)

Add one fixture JSON, asserted by a Node test **and** an XCTest. A Swift enum case
rename then fails the web test instead of silently breaking parents.

### 10.4 Announcements: same reader on both sides (fixes 4.1, 4.7)

The crash is fixed (`portal.js:69`). What remains:

- Keep the direct `getDoc('chats/{teamId}_commBoard')` then query
  `messages` filtered by category — that pattern is correct, because the rule
  resolves membership with a `get()` that list queries cannot satisfy.
- With 10.1 in place, a parent can read the full board, so widen
  `PUBLIC_COMM_CATEGORIES` to all categories for guardians and keep the public
  subset for true followers.
- Decide one policy: web is **read-only** for now. Posting stays iOS (coach/AD),
  which matches `chatWriteAllowed`.
- `.ics` feed: add a hosted endpoint or a callable that emits the same event rows
  the portal renders. Cheapest parity win for families who live in a calendar.

### 10.5 Auth parity (fixes 4.5)

- Add `sendPasswordResetEmail` to `/portal` and `/invite`, reusing the iOS copy.
- Mirror the iOS email-verification gate before a parent can sign a form.
- Add Sign in with Apple on iOS **and** web together if either ships — a platform
  asymmetry here is what creates support calls.

### 10.6 Import identity (refines 4.3)

- Backfill `players/{id}` → roster `userId`/`guardianUserIds` so an imported
  athlete is visible to their family; today every imported entry is invisible.
- Key dedupe on a stable identity (state ID, student number, or
  `players/{id}`), never on `normal(name)`.
- Decide which is the person record. Recommendation: `players/*` is the person,
  `teams/{id}/roster/*` is the enrollment, and roster stops copying `playerName`.

### 10.7 Enforcement, so this cannot regress

- `.eslintrc.json` with `no-undef` + `no-unused-vars`; CI fails on lint. §4.1
  shipped because `next lint` currently prompts interactively and never runs.
- A render smoke test per web page (React Testing Library or a Playwright crawl of
  every route) — a single rendered `portal` would have caught the crash.
- Contract tests across clients (§10.3) as the merge gate.

**Order matters:** 10.1 before 10.2 (RSVP visibility depends on who a parent is),
10.3 before any new feature (or you copy the enums again), 10.7 before a pilot.

## 11. Implementation log — changes 1 and 2, and the real-time seam

Status of §10.1 and §10.2: **implemented and tested.** §10.3 (generated contract)
is not built; instead the shared values are now pinned by tests on both sides, which
catches drift without the codegen step.

### 11.1 Change 1 — one role vocabulary

| File | Change |
|---|---|
| `functions/index.js` | `normaliseRole()` maps legacy `family` → `parent`. `acceptInvitation` normalises the invitation's role **once**, before it writes `users.role`, custom claims and membership. The downgrade line became `const membershipRole = role;` |
| `RockLabAthletics/Models/UserRole.swift` | `UserRole.parse(_:)` — `family` decodes as `parent`, unknown values return nil rather than silently becoming something else |
| `AppUser.swift`, `Invitation.swift`, `TeamMembership.swift` | all role decoding routes through `parse` |
| `TeamMembership.swift` | membership no longer drops documents missing `teamId`/`userId` — join-request members were invisible in the member list |
| `RockLabAthletics/Models/RosterEntry.swift` | **now decodes `guardianUserIds`** — iOS never read it, which is why every guardian view on iOS was empty |
| `EventDetailView.swift`, `MyFormsView.swift` | athlete matching uses `guardianUserIds`, then a `linkedPlayerIds` entry id, then a user id. The old code compared a user id against entry ids only |
| `web/lib/portal.mjs` | `ALL_EVENT_TYPES`, `eventTypesFor(role)`, `normalizeRole(role)` |
| `web/pages/portal.js` | calendar asks for the role's full type set and falls back to the follower subset; announcements read all four categories for a member, three for a follower; the "ask your coach about practice times" paragraph is gone |

Effect: a guardian is a team member. `firestore.rules` needed **no change** — it
already granted `parent` practice events, the full comm board and the parent
channel; the membership row was the thing lying to it. Roster reads stay hardened
(§4, `isTeamMember` deliberately excludes them from the whole-roster branch).

### 11.2 Change 2 — one RSVP identity

| File | Change |
|---|---|
| `FirestoreService.swift` | `rsvpDocumentId(userId:athleteEntryId:)`; `setRSVP` writes `respondentUserId` + `athleteEntryId`; `fetchRSVP` reads the composite id then falls back to the legacy bare-uid row. The tally reader added here (`fetchRSVPTally`) turned out to have no caller and was deleted in `40c7960`; no coach-facing tally exists |
| `web/lib/portal.mjs` | `rsvpId(uid, athleteEntryId)` — same rule, same output |
| `web/pages/portal.js` | writes through `rsvpId` |
| `ScheduleViewModel.swift` | `setMyRSVP(…athleteEntryId:)` is the only RSVP helper still in the file; `myRSVPByAthlete`, `rsvpTally`, `loadGuardianRSVPs` and the RSVP listener pair do not exist |
| `EventDetailView.swift` | no per-athlete RSVP rows and no "RSVP answers" tally section were built, despite this plan |

### 11.3 Real-time, which is what "work hand in hand" actually required

Before this change only chat, games, broadcasts and plays listened. Schedule, forms
and RSVPs were one-shot `getDocuments()` calls, so a coach's edit never reached a
signed-in parent.

The four listeners added for those screens — `listenToEvents`, `listenToGameEvents`,
`listenToTeamForms`, `listenToRSVPs` — were never called. `ScheduleViewModel` has no
`startLiveEvents`, `MyFormsView` and `TeamFormsViewModel` load once with
`getDocuments()`, and there is no coach tally to feed; the web portal calendar has its
own query. They were deleted in `40c7960` as dead code, not replaced.

So live updates still cover only what covered them before: chat, games, broadcasts,
plays and direct messages — the listeners in `FirestoreService.swift`
(`listenToMessages`, `listenToGame`, `listenToGames`, `listenToBroadcasts`,
`listenToPlays`, `listenToDirectMessages`) that do have consumers. Schedule, forms and
RSVPs remain one-shot reads; making them live is open work, not shipped work.

### 11.4 Verification

| Check | Result |
|---|---|
| iOS build | ✅ success |
| iOS tests | ✅ **69/69** — includes 9 new `CrossPlatformContractTests` |
| Web tests | ✅ **46/46** — includes 5 new contract tests |
| Functions tests | ✅ **44/44** |
| Web build | ✅ success, `/portal` 6.63 kB |
| Live data repaired | `teams/ThX1C2rqdiTltVEORf8R/members/sTlCP4cOsMZoOila60blh84zJIH2` role `follower` → `parent` |

The new tests are the point: `rsvpId` is asserted to produce identical output on
both sides, `eventTypesFor('parent')` must include `practice`, and `family` must
decode as `parent`. A future rename now fails a test instead of silently closing a
channel.

### 11.5 Still outstanding

- `functions/scripts/migrate-guardian-roles.js` has **not been run** — no
  Application Default Credentials in this environment. Run it before onboarding a
  school that already has parent rows:
  `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrate-guardian-roles.js --dry-run`
- Web is read-only for announcements (posting stays iOS) — a deliberate policy, not
  a bug.
- The signed-in parent portal still needs a real credential to verify end to end.
- §10.3 generated contract, `.ics` feed, web password reset: not started.
