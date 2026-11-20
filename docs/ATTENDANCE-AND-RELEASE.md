# Attendance and athlete release

Design note, 2026-11-20. Nothing implemented yet.

---

## 1. Two different things, deliberately kept apart

| | **Attendance** | **Travel & release** |
| --- | --- | --- |
| Question | Was the athlete there? | Who is this minor leaving with, and with whose permission? |
| Recorded by | Coach / staff (a direct observation) | Guardian (an authorization), confirmed by coach (a handoff) |
| Timing | During or after the event | Before departure, finalised at handoff |
| Failure mode | Admin error | **A child released to the wrong adult** |
| Retention | Season | Safety record — keep per district policy, not purged with the season |

Attendance already exists (`events/{eventId}/attendance/{entryId}`, staff-only
write, gated by the `attendance` staff permission). **This document is about the
second column**, which does not exist yet.

Calling it "attendance per game" invites building the wrong thing: a single
present/absent flag cannot express "riding the bus home, unless Grandma picks him
up, and she is authorised." Guard against that in the UI language too — parents
should see *Travel & pickup*, not *Attendance*.

## 2. What the feature has to do

1. Before the event, each guardian declares for their athlete:
   - travelling to the event (bus / own transport / not attending)
   - travelling home (bus / picked up by guardian / picked up by an authorised adult / driving self, where policy allows)
   - for pickups: **who** is collecting them
2. The coach opens the event and sees a **release manifest**: every athlete, their
   plan, and a clear flag for **anyone with no plan**.
3. At handoff the coach marks each athlete released, to whom, and when. That
   confirmation is the liability record.
4. A guardian can change the plan up to the last minute — and the coach's screen
   must show that it changed and when.

## 3. The safety defaults I would insist on

- **No plan is not "bus".** An athlete with no declared plan appears in a
  *cannot release* state and must be resolved before the bus leaves. Defaulting
  to "rides the bus" is how a kid ends up somewhere nobody expected.
- **Only a guardian can authorise a release.** Not the athlete (minors cannot
  self-release), not another parent, not staff on a guardian's behalf. An AD
  override exists but is a distinct, audited action with a reason.
- **Authorisation is per athlete, never per adult.** Being on Grandma's pickup
  list for one child does not authorise her for a sibling's teammate. A shared
  "authorised adults" pool would be the single easiest way to get this wrong.
- **Saved list plus per-game selection.** Guardians maintain an authorised-adult
  list (name, relationship, phone); for a given game they select from it. Ad-hoc
  text messages must not be the system of record.

  **Revised per product owner (2026-11-20):** no separate registry. Parents on the
  same team routinely carpool, so the guardian simply picks **another parent from
  the team list**, and that selection *is* the consent. The app stores
  `declaredByUserId` + a timestamp as the consent record. Simpler for parents and
  it matches existing behaviour; the trade-off is that consent is per game rather
  than standing, which is arguably safer anyway.

  Implementation note: the picker is built from the roster's `parentName` values,
  not the team member list. Team membership documents are not readable by parents
  (that rule protects every member's email), and the roster is already the team's
  parent directory.
- **Every handoff is an immutable record**: athlete, event, released to, by whom,
  when, and which plan version was in force. This is what protects a coach.
- **Staff-only visibility.** The manifest contains guardian phone numbers and
  third-party names. Never visible to other parents, players, or followers.

## 4. Data model

Per athlete per event, not per team — because two siblings may have different
plans on the same night.

```
events/{eventId}/releasePlans/{rosterEntryId}
  athleteName, rosterEntryId, teamId
  travelTo:      "bus" | "own" | "not_attending"
  travelHome:    "bus" | "guardian" | "authorized" | "self_drive"
  pickup:        { authorizedAdultId, name, relationship, phone }
  declaredByUserId, declaredByName, declaredAt
  guardianStatementVersion          // which consent wording they attested
  updatedAt, version                // so the coach can see "changed 4 min ago"

events/{eventId}/releases/{rosterEntryId}
  status:        "pending" | "released" | "no_show"
  releasedTo:    name + relationship + authorizedAdultId (where applicable)
  confirmedByUserId, confirmedByName, confirmedAt
  planVersionAtRelease, note
```

No separate authorised-adult collection. The pickup target is stored as a name on
the plan itself (`pickupName`), chosen from the roster's parent names. That keeps
the consent explicit and per-game, and avoids a standing permission that a parent
forgets they granted.

Status: **Phases 1 and 2 implemented.**

- Phase 1: guardians set a plan per athlete per event; staff see a manifest with
  "No plan" flags and a relative timestamp on every plan ("Set by J. Smith 12 min
  ago"), so a plan changed as the bus was loading is visibly different from one set
  last Tuesday.
- Phase 2: the coach records the handoff (`confirmRelease`) with who released the
  athlete, to whom, and when — including which plan version was in force. A
  correction is a separate audited action (`reopenRelease`) that keeps the original
  record rather than deleting it.
- Staff edits to a guardian's plan go through `setReleasePlanOverride`, which
  requires a written reason and writes to the audit log. The rules no longer allow
  a coach to write a plan directly.

Still to build: the offline manifest and queued sync (Phase 3) — **dropped by
decision (2026-11-20).** A coach may instead release an athlete on a **verbal
agreement** when the guardian is not on the app or the network is down:

- `confirmRelease` accepts `verbalConsent` plus a required `consentNote` ("mom
  called at 8:40pm") when no plan exists on file.
- The release record stores `verbalConsent`, `consentNote`, and
  `planHomeWith: 'verbal'`, and the audit entry says "verbal consent".
- An athlete with **no plan and no verbal consent still cannot be released** — the
  safety default is unchanged; the coach simply has a documented way through it
  instead of being blocked at the field, which is what we actually needed.

## 5. Enforcement, not just UI

Every rule below belongs in `firestore.rules` and in a callable, because hiding a
button is not a control.

- `releasePlans` write: only a guardian linked to **that** roster entry
  (`linkedPlayerIds` contains the athlete's `userId`) — or an AD override callable
  that stamps `overriddenBy`, `overrideReason` and is audited.
- `releases` write: only AD, the team's coach, or staff holding the `attendance`
  permission. Guardians may never mark their own child released — that is the
  coach's handoff to confirm.
- `authorizedAdults` write: guardians only, and only for athletes they are linked
  to.
- An AD override must always log to `auditLogs` (already implemented) with the
  athlete, event and reason.

## 6. The offline problem — the one that decides whether this works

Most high school fields and gyms have no usable signal. A manifest that only
works online will fail exactly when it is needed: at the bus, at 9:40pm, away.

Design consequences:

- The manifest (roster + plans + authorised adults) must be **pre-fetched and
  cached** before departure, and explicitly downloadable: "Save for offline".
- Coach confirmations must queue locally and sync later, each carrying its real
  **device timestamp** — not the sync time. A record that says a child was
  released at 11:42pm because that is when the phone reconnected is worthless.
- Conflicts on sync (two staff confirming the same athlete): last write wins *per
  athlete*, but both attempts are retained in the audit trail.
- Show a clear "offline — changes will sync" state. Silent queueing is worse than
  a visible warning.

This is the same constraint that will eventually matter for live scoring, so it is
worth solving once, properly.

## 7. Build order

| Phase | Scope | Why this order |
| --- | --- | --- |
| **1** ✅ | Per-athlete travel/release plan for events; guardian picks bus / self / another parent from the team list; coach manifest with *no plan* flags | Delivers the core safety value with no third-party registry |
| **2** ✅ | Coach handoff confirmation with an immutable release record | The full chain: who physically released the athlete, to whom, when |
| ~~3~~ | Offline manifest + queued sync — **dropped**; replaced by verbal-consent release | A coach is never blocked at the field |
| **4** | Reconciliation counts (bus manifest vs pickups), guardian change notifications, 18+ self-release under district policy | Operational polish |

Phase 1 alone is useful; phases 1–3 are what make it trustworthy in the field.

## 8. Decisions I need from you

1. **Who may authorise a pickup — guardian only, or may an AD/staff member record a
   verbal authorisation?** Legally the guardian is the authority; practically,
   coaches get phone calls. I would implement guardian-only plus an audited AD
   override, but this is your policy call. (Phase 1 currently lets AD/coach write a
   plan as well; that is the override path and should be audited explicitly.)
2. **May students drive themselves?** Many districts forbid it for underclassmen
   and allow it for seniors with a signed form. This changes the `travelHome`
   options.
3. **Does this apply to every event (practices too) or games and trips only?**
   Practices usually just need attendance, not release.
4. **Retention**: how long does a release record need to be kept? This is an
   insurance/legal question, not a technical one.

## 9. Non-goals

- Not a child-tracking or geolocation feature. We record declared intent and the
  coach's handoff; we do not track anyone's location.
- Not replacing the school's own sign-out sheet where district policy requires a
  physical signature. We can print the manifest, but the paper may still govern.

