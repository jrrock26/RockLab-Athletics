# Technical Decisions

Decisions with a technical reason attached. Superseded entries stay for history.

## D-1 — AD authority is school ownership, not a role label

`users.role` is written by the client, so it cannot be a privilege source. `isAd()` is
now `role() == 'ad' && ownsSchool()`, where ownership compares
`schools/{schoolId}.adUserId` with the caller. Chosen over custom claims because it
required no new infrastructure and closed the escalation immediately; claims remain the
better long-term home (see S-4/S-5).

## D-2 — Play-by-play is written in one batch with score and stat

`recordPlay` commits the play document, the game score and the player's stat together.
Reason: a play that scores without crediting the stat corrupts a season line, and a
score that moves without a play cannot be undone. Set-based sports pass
`movesScore: false` because their score lives in `sets`.

## D-3 — The live clock is derived, not broadcast

The scorer writes `clockSeconds` + `clockStartedAt` + `clockRunning`; every device
computes `clockSeconds - (now - clockStartedAt)`. A per-second write to Firestore was
rejected: it is one write per second per live game for a value anyone can compute. Cost:
device clocks must agree within a few seconds, which a scoreboard tolerates.

## D-4 — Clip limits enforced in rules, not only in the UI

`clips.size() <= 20` lives in `firestore.rules`. A client can lie; rules cannot. The
rule also permits *shrinking* an over-limit reel, because otherwise any legacy reel
above 20 clips would be permanently uneditable — even deleting a clip is an update.

## D-5 — Film uploads capped at 4 GB, matching rules exactly

`HighlightService.maxUploadBytes` and `storage.rules` must move together; changing one
alone only relocates the rejection. Uploads report progress because a multi-gigabyte
upload with no feedback is killed by the user mid-flight.

## D-6 — Renderer split into planning logic + executor

`functions/reel.js` builds the ffmpeg argv and filtergraph with no process spawning, so
17 tests cover timeline maths, colour parsing, drawtext escaping and clip limits on a
machine with no ffmpeg. The executor is deliberately minimal. Rationale: an untested
one-shot spawn-and-hope function would have shipped blind.
Command is always an **argv array, never a shell string** — player names flow through it.

## D-7 — Reels are muted

Game audio is wind, whistles and parents; a track that jumps at every cut is worse than
silence. Highlights get music from the user.

## D-8 — Two hosting sites, one project

`rocklab-technologies` (marketing, static, no build step) and `rocklab-athletics` (the
app) deploy independently. A broken npm dependency cannot take down the company's front
door.

## D-9 — Contact addresses come from one constant

`web/lib/contact.js` holds `SUPPORT_EMAIL` / `PRIVACY_EMAIL`. Role addresses
(support@, privacy@) are labels on the page; the real mailbox is `info@`. Chosen because
an address that looks right and does not exist bounces silently — worse than a plain one.

## D-10 — Plan limits live in two places on purpose

`PLAN_LIMITS` in `functions/index.js` is the authority; `web/lib/plans.js` mirrors it so
the pricing page cannot promise more than the backend enforces. Both files carry a
comment to change them together.

## D-11 — No catch-all rewrite on the app site; the client recovers from a stale build

The app is `output: 'export'`, so every route is its own `index.html` and every page its
own chunk file. Hosting used to rewrite `**` to `/index.html`, which meant any missing
file answered **200 with HTML**. A tab left open across a deploy asks for the previous
build's chunk, gets HTML, fails to parse it as JavaScript, and the click does nothing —
the page only appears after a reload. That is the "I have to refresh to make pages load"
report, and it was intermittent because `next/link` prefetches the routes in view: only
the un-prefetched, replaced chunks failed.

Removed the rewrite (unknown paths now 404 to `404.html`) and added `routeChangeError`
recovery in `web/pages/_app.js`: the router reports the failed chunk, the app navigates to
the URL the user actually clicked, and a 10-second `sessionStorage` guard stops a loop if
that chunk is genuinely gone. Do not re-add the catch-all to "fix" a 404 — it hides every
missing asset behind a 200 and makes navigation fail in a way that looks like the app.

Related: `web/lib/useAuth.js` keeps one auth listener and one cached `users/{uid}` profile
per tab. Before, each page ran its own listener and re-read the profile, so every click
flashed "Loading…" for a network round trip and any failed read left the page on that
flash forever.

## D-12 — One rail for every role, defined in one place

The rail used to be an array inside `AppShell` rendered only when `role === 'ad'`.
Coaches, players and parents got a two-link header and no navigation at all, so the pages
that exist for them (portal, team, calendar, records, profile) were reachable only from
whatever link a page happened to render.

`web/lib/nav.js` is now the single map: each item declares the roles entitled to it and
`railFor(role)` filters. iOS is five tabs (Home, Teams, Schedule, Chat, Settings) and the
rail follows that shape so a person using both apps is not learning two products.

Deliberately explicit roles, not "everyone except": a new role gets an empty rail that
someone has to think about, rather than automatic access to a page whose rules were never
considered. `family` is normalised to `parent` because iOS shipped that spelling.

Gaps this exposed, left as gaps rather than faked: `/forms` is player/parent only, because
signing belongs to a roster entry and the coach's iOS screen is the review side (who has
not signed), which the web does not have. Staff and coaches therefore have no Forms link
instead of a link to a page that would be empty for them.

## D-13 — One loader for team data, because the rules depend on the query shape

`web/lib/myTeams.js` owns every read that the portal and the rail's Teams/Schedule/
Messages/Forms pages share: the team document, the roster (including the guardian
fallback to `guardianUserIds` + direct gets when the staff-only list is refused), the
`type`-filtered event query, games, and the per-athlete requirement documents.

The first cut of the rail pages copied those queries into the new module while `portal.js`
kept its own, which is exactly the wrong duplication: each shape is chosen to satisfy a
specific branch of firestore.rules (a list query is rejected outright unless one branch
does not read the document), so two copies means a rule change fixes one screen and
silently breaks the other. Presentation stays per page — the portal still decides how a
requirement row is rendered — and the shared vocabulary that has to match an iOS enum
(`FORM_LABELS`, `RSVP_CHOICES`) moved into `lib/portal.mjs` for the same reason.
