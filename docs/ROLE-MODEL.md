# Role model and gaps

Audited 2026-11-20 against the stated goal: a complete sports-management system
covering **teams, coaches, players, parents, family, followers, and staff**.

This is a code-grounded audit, not an aspiration list. Everything marked ✅ is
enforced in `firestore.rules`, not just hidden in the UI.

---

## 1. Roles that exist

`UserRole` (`Models/UserRole.swift`) has six cases:

| Role | Intended for | Sees | Cannot see |
| --- | --- | --- | --- |
| `ad` | Athletic director | whole school: all teams, rosters, staff, reports, audit log, exports | — |
| `coach` | Head/assistant coach | own teams: roster, forms, injuries, schedule, staff chat, parent chat | other schools/teams |
| `staff` | Trainer, media, boosters | own teams, **granular**: only the permissions granted (`forms`, `staffChat`, `commBoardPost`, `fundraising`) | anything not granted |
| `player` | Student-athlete | own teams, own forms, own profile/showcase | eligibility status, other athletes' medical data |
| `parent` | Parent/guardian | child's teams, own forms, emergency/medical contact updates | eligibility status, team staff chat |
| `follower` | Fans, community | public comm-board only (live game, gameday, fundraiser), public games/scores | practice details, rosters, chat, medical |

Multi-team is handled throughout: a coach or athlete can hold memberships on
several teams (fall + winter sport), and `linkedPlayerIds` lets one guardian
account follow multiple children.

## 2. The gap you named: `family`

**There is no `family` role.** Today a grandparent, sibling, or aunt is a
`follower` — they can follow a *team*, but they cannot express "I am family of
this athlete."

That distinction matters because it is the difference between:

- a follower who watches whatever team they happen to follow, and
- family who should reliably see **their** athlete's schedule, results, photos
  and public highlights across every team that athlete plays on — without ever
  seeing team chat, medical data, or eligibility.

### Recommendation: family = follower *scoped to an athlete*

Do not build a seventh role with a new permission set. Instead:

1. Add `family` to `UserRole`, with **identical read permissions to `follower`**.
   This keeps the rules surface unchanged and is why it is low-risk.
2. Family members link to a roster entry (`linkedPlayerIds`), exactly the way
   parents already do, via the existing `requestParentLink` / `approveParentLink`
   flow.
3. The link earns them one extra thing followers don't get: their athlete's
   **public** profile, per-team jersey/position, and highlights.

Why not just let them be parents? Because parent grants forms, medical edits and
eligibility-adjacent visibility. A grandparent must not receive a consenting
adult's authority over a student's records — that is a FERPA problem, and schools
will ask.

Effort: ~1–2 days (enum + rules lists + invitation role + HomeView section).

## 3. Other gaps for a complete system

Ordered by operational pain, with honest size:

| # | Gap | Why it hurts | Size |
| --- | --- | --- | --- |
| 1 | ~~No season rollover~~ | **Closed this pass.** Teams + rosters + staff now roll forward; forms and injury clearances reset by design. | done |
| 2 | No athlete-centric profile | Parents see a *team list*, not *my child*: one card across sports with jersey, position, status per team | 2–3 d |
| 3 | No "follow an athlete" | The family use case above; also lets relatives find a kid without knowing the team | 2 d |
| 4 | No graduation / roster pruning | Rollover copies seniors too; need a "graduated" flag and a prune step at rollover | 1 d |
| 5 | No school-wide staff directory | Staff are managed per team; an AD cannot see "who are my 14 coaches and what can they do" in one place | 2–3 d |
| 6 | No season archive | Old teams stay forever; need archive/read-only by season | 1–2 d |
| 7 | No tryout/cut workflow | HS reality: 60 try out, 18 make it. Today that's manual list management | 3–4 d |
| 8 | No equipment/uniform inventory | Issuance forms exist, but nothing tracks who has which jersey | 3 d |

## 4. What "complete" means for the pilot

A school can run a full season end to end today: create teams, import a roster,
invite parents (links work without email configured), publish schedules, post
announcements, collect and sign forms, compute paperwork eligibility, log
injuries and clearances, score games, share media, and **now** roll the whole
thing into next season without re-entering a single athlete.

What it cannot yet do is the human layer around the roster: represent
non-parent family, show one athlete across sports, run tryouts, and let an AD see
their staff as a roster. Those are the next four items, in that order.
