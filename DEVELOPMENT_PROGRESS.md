# Development Progress

Chronological log. Only executed work is recorded; intentions go in the plan.

## 2026-11-21 — Baseline established, Feature 1 discovery

### Executed and verified this session

| Area | Work | Verification |
|---|---|---|
| Asset booking | Recurring series, open hours, event linkage, overlap transaction | 10 unit tests; deployed |
| Live scoring | Play-by-play, per-sport actions, undo, clock overtime | Build + 60 tests |
| Spectator view | Read-only live game, derived clock, real-time feed | Build + 11 tests |
| Clock contract | `clockRunning` / `clockStartedAt` derivation | 4 tests incl. negative clamp |
| Roster | Transfer between teams/sports (move vs multi-sport) | Build + rules test |
| Volunteer scorer | Discoverable request row (was swipe-only) | Build |
| Invitations | AD succession: invite + transactional transfer | 14/14 live checks |
| Security | AD escalation fixed; `manageUserRole` scoped | 11/11 live checks |
| Film | Upload cap 600 MB → 4 GB, progress reporting, 20-clip cap | 9/9 live rule checks |
| Reels | Burned-in banner renderer as tested planning logic + CLI | 21 tests |
| Web | Landing site on custom domain; plan tiers explained | Live URLs verified |
| Docs | Landing page, asset booking, scoring, role model | Committed |

### Test results (actual output)

```
functions:  31 tests, 31 pass, 0 fail
iOS:        60 tests, 60 pass, 0 fail   (RockLabAthleticsTests)
rules:      11/11 role-escalation checks, 14/14 AD handoff checks,
            9/9 reel-cap checks — all run against deployed rules
```

### Feature 1 — status: DISCOVERY DONE, PLANNED

Discovery performed against live data via the Firebase MCP server. Findings and
defects recorded in `DEVELOPMENT_MASTER_PLAN.md` §2 and `KNOWN_ISSUES.md` §Feature
defects.

Decision: implementation of Feature 1 does **not** start until SMTP credentials exist,
because the completion criterion ("recipient receives an invitation and self-serves")
cannot be met or tested without a mail path. Everything else in Feature 1 can be built
before then, and will be, in this order:

1. `expiresAt` + expiry sweep (no dependency)
2. Parent↔player link captured at acceptance (no dependency)
3. Resend tracking fields + duplicate-invite guard (no dependency)
4. Schema-drift tolerance for `token` vs `code` (no dependency)
5. Branded email template + delivery status wiring — **blocked on SMTP**

### Notes on method

- Rules changes were verified by attempting the forbidden action with a real account and
  asserting the 403, not by reading the rule and assuming.
- One self-inflicted incident: a test script used Firestore REST `PATCH` without
  `updateMask`, which replaces the document and wiped `adUserId` from the test school.
  Restored via owner access; the harness now always sends masks. Production data was
  never touched.
- Two test failures were traced to wrong test expectations (clip 1 shows the matchup,
  not the player; banner text is uppercased) rather than wrong code. Both were fixed in
  the tests, which is the point of writing them.

## Next up

Feature 1 items 1–4 (unblocked), then Feature 2 (parent web) which is the pilot's real
blocker.
