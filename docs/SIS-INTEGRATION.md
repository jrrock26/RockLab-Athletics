# SIS integration — scope

**Goal:** close the one gap that loses demos against Rank One and FinalForms —
academic eligibility sourced from the district's student information system.

Status: **DEFERRED — post-launch.** Decision made 2026-11-20: do not build SIS
or grade integration now. Ship the sports-management core first; academic
eligibility follows after production release. This document is retained as the
completed research so the work does not restart from zero later.

Rationale for deferring: academic eligibility is a *credibility* feature, while
a complete sports-management system is the *product*. SIS integration puts
district procurement and per-district onboarding in the critical path, and none
of that work is reusable for teams that are not yet using the app at all.

---

## 1. The problem, stated precisely

"Eligibility" in this market means two different things, and we only do one:

| | What it is | Where it comes from | RockLab today |
| --- | --- | --- | --- |
| **Paperwork eligibility** | physical on file, consents signed, conduct acknowledged | our own forms | ✅ built, tested |
| **Academic eligibility** | passing enough courses, GPA threshold, attendance, credits | **the district's SIS** | ❌ nothing |

An AD hearing "eligibility" assumes both. If we only mean paperwork we get found
out in the first demo — so this is a credibility gap, not just a feature gap.

Academic eligibility is **not** a national rule. It is set by each state's
athletic association (NFHS members) and varies: minimum courses passed, GPA
floor, attendance, credit progress, age/semester limits, transfer and residency
rules. Any rule we hardcode will be wrong in 49 states. The rules must be data.

## 2. What the data actually requires

Minimum viable verdict needs, per athlete per term:

- `coursesEnrolled`, `coursesPassed`
- `gpa` (term and/or cumulative)
- `attendanceRate` or absence count
- `creditsEarned` (for grade-level progress, if the state requires it)

**Not needed:** individual grades, test scores, IEP/504 status, discipline
records. Excluding these is a deliberate design choice, see §5.

## 3. Options

| Option | How it works | Coverage | Effort | Verdict |
| --- | --- | --- | --- | --- |
| **Direct vendor APIs** | PowerSchool API, Infinite Campus API, Synergy… each bespoke, each gated by a partner program and per-district licensing | 1 vendor each | months per vendor | ❌ reject |
| **OneRoster 1.2 REST** | district exposes a standard endpoint; we read `/students`, `/enrollments`, and (1.2) gradebook `lineItems`/`results` | many vendors *claim* it | ~1 week client code | ✅ later |
| **Broker** (Edlink / Wonde / ClassLink) | one API in front of ~35 SIS products; district self-service onboarding | very broad | ~1 week client code | ✅ buy |
| **Ed-Fi** | state-level data exchange, common in state agencies | state, not district | large | ⏸ defer |
| **CSV / SFTP grade export** | district exports a grade file; we ingest | universal | ~1 week | ✅ **first** |

### On OneRoster specifically

OneRoster 1.2 does define a Gradebook Service, but **gradebook support in the
field is far less reliable than rostering support**. Rostering (`students`,
`enrollments`, `classes`, `orgs`) is widely implemented and trustworthy.
Gradebook is not. Do not architect as if gradebook-over-OneRoster will just work.

### On the broker

Edlink's PowerSchool onboarding is genuinely self-service for the district:
install a plugin, enable it, copy the OAuth client ID/secret into our flow,
grant "Full Access" on the v1 APIs, validate, and data syncs within 24 hours.
That is one integration for us and a 20-minute task for a district admin — versus
a bespoke project per SIS. It also already covers Aeries, Alma, Aspen, Aspire,
Blackbaud, Bromcom, eSchoolPlus, FACTS, Focus, Genesis, Infinite Campus, iSAMS,
Pinnacle, PowerSchool, ProgressBook, Qmlativ, Rediker, Sapphire, SchoolTool,
SIMS, Skyward, Synergy and Veracross.

Wonde and ClassLink are credible alternatives; the choice is commercial, not
technical. **Everything below is written against an interface so the broker is
swappable and no vendor is baked into the data model.**

## 4. Recommendation

Build **one adapter interface with three implementations, CSV first**:

1. **CSV/SFTP ingestion** — ships first. Works with every district, needs no
   procurement, and closes deals this term.
2. **OneRoster 1.2 REST** — for districts that already expose it.
3. **Broker** — sign the contract in parallel, implement behind the same
   interface once pricing is agreed.

Rationale for CSV first, which is the counter-intuitive call: the hard part is
**not** transport. It is student matching, the rule engine, the override
workflow, and staleness handling — roughly 70% of the work and identical
regardless of transport. CSV lets us build and validate that against a real
pilot school immediately, with zero vendor negotiation in the critical path.
The broker then becomes a data source swap, not a project.

---

## 5. Privacy design: store verdicts, not grades

This is the most important decision in the document.

**We do not store grades.** We store a derived eligibility verdict plus the
minimum facts required to justify it:

```
eligibilityResults/{schoolId}_{studentKey}_{termId}
  verdict:        "eligible" | "ineligible" | "unknown"
  reasons:        [{ code: "gpa_below", observed: 1.8, required: 2.0 }]
  ruleSetId, ruleSetVersion
  computedAt, asOf, sourceId, stale: boolean
```

Why:

- **Shrinks the FERPA blast radius.** A grade table in a third-party app is the
  most sensitive artifact a school could hand us. A verdict is still protected,
  but it is one derived flag, not a year of academic performance.
- **Makes the DPA defensible.** "We never store grades" is a sentence a privacy
  officer can approve; "we store grades, encrypted" invites six months of review.
- **State law.** Several states restrict third-party storage of grade data for
  minors. Verdict-only sidesteps much of that.
- **Reduces liability on error.** If our math is wrong we show a wrong badge and
  can recompute; we have not corrupted a record of record.

If a district insists on visible grade detail, the answer is an AD-facing deep
link into their SIS, not a copy in our database.

Retention: verdicts kept for the term plus one, then purged. Raw imports are
deleted after evaluation (the source file itself is kept 30 days for dispute
resolution, then deleted).

## 6. Data model (additive — no migration of existing data)

| Collection | Purpose |
| --- | --- |
| `sisConnections/{schoolId}` | provider (`csv`/`oneroster`/`edlink`), mode, secret ref, enabled, lastSyncAt, syncStatus, termId |
| `sisImportRuns/{runId}` | one per sync: counts, duration, errors[], unmatched keys |
| `academicSnapshots/{schoolId}_{studentKey}_{termId}` | only the four facts from §2, plus `asOf` and `sourceId` |
| `eligibilityResults/{...}` | verdict + reasons + ruleSetVersion |
| `eligibilityOverrides/{...}` | AD override: verdict, reason, actor, expiresAt |
| `ruleSets/{stateCode}_{version}` | declarative rules per state, immutable once used |

Roster gains one field: `sisStudentId` (nullable). Everything else hangs off the
existing `teams/{id}/roster` documents.

**Student matching** is the most common source of real-world breakage:

1. Primary: `roster.sisStudentId` ↔ SIS `sourcedId`. Set once, stored.
2. Fallback: exact `(lastName, firstName, dateOfBirth)`. On a unique match, write
   `sisStudentId` back to the roster entry and log it as auto-matched.
3. Otherwise → **unmatched queue** for the AD. Never guess, and never auto-create
   roster entries from the SIS in v1 — that is how you get duplicate athletes.

## 7. Sync design

- **Schedule:** nightly via Cloud Scheduler (one job per enabled school), plus an
  AD-triggered "Sync now", rate-limited to once an hour.
- **Idempotent:** snapshots keyed by student+term and written only when a content
  hash changes, so re-running a sync is always safe.
- **Fail closed, never silently optimistic:** if the SIS is unreachable or data is
  older than N days, verdicts carry `stale: true` and the UI reads "as of <date>".
  **A stale verdict never silently flips to eligible** — that is the failure that
  puts an ineligible athlete on a field and gets a school sanctioned. Unknown
  renders as unknown, never as green.
- **Reproducible:** every verdict records the ruleset version that produced it, so
  any historic decision can be reconstructed during an audit or appeal.
- **Audited:** connections, sync runs, overrides, and every staff read of an
  academic verdict flow through the existing `writeAudit` / `recordAccess` path.

## 8. The rule engine

Rules are data, versioned per state, and composable with school-level policy:

```json
// ruleSets/GA_2026.1   (illustrative)
{
  "state": "GA",
  "effectiveFrom": "2026-07-01",
  "requirements": [
    { "code": "courses_passed", "type": "minValue", "field": "coursesPassed", "value": 5,
      "message": "Must pass at least 5 courses in the previous term." },
    { "code": "gpa_minimum", "type": "minValue", "field": "gpa", "value": 2.0,
      "message": "Minimum 2.0 term GPA." }
  ]
}
```

- A school may add **stricter** requirements, never looser ones.
- Unknown state → `verdict: unknown` with reason `no_ruleset`, never a default pass.
- Evaluation is a pure function, so it is table-tested exactly like the existing
  `EligibilityEngine` (which already has 49 passing tests covering ordering,
  expiry, and parent co-signature).

## 9. AD override workflow

Schools need an escape hatch for clerical SIS errors and mid-term transfers.
Overrides are AD-only (never coach), require a written reason and an expiry date,
retain both the computed and overridden verdict, and appear on a dashboard so a
district can see every active override. This exists so "the SIS is wrong" doesn't
push a school back to spreadsheets, and so an override can never be quiet.


## 10. Effort and cost

Engineering estimates for one experienced iOS/backend generalist (me), assuming
no unfamiliar technology in the critical path:

| Phase | Scope | Est. |
| --- | --- | --- |
| **P1 — CSV** | adapter interface, CSV ingest (column mapping UI), matching + unmatched queue, snapshots, sync runs, idempotency | 8–10 d |
| **P2 — Rules + verdicts** | ruleset model + versioning, evaluation function, table tests, reasons, staleness | 5–7 d |
| **P3 — Surfaces** | iOS eligibility detail w/ academic reasons, web `/sis` page, override workflow, audit wiring | 5–7 d |
| **P4 — OneRoster REST** | `/students`, `/enrollments`, paging, token handling, gradebook-optional path | 4–5 d |
| **P5 — Broker** | contract, credentials in Secret Manager, adapter impl, onboarding runbook | 5–7 d |
| **P6 — Ed-Fi** | deferred | — |

**≈ 4–6 weeks of engineering** to a credible academic-eligibility story for a
pilot district, of which P1–P3 is the irreducible core.

Costs beyond engineering, which are the ones people forget:

- **Broker licensing** — priced per district/student; unknown until quoted, and it
  may exceed the price point at a 300-student school. Price accordingly or pass
  through. Wonde and ClassLink are the comparison quotes.
- **Onboarding is a service, not a feature.** Budget 1–2 hours per school per term
  for the first year. This — not code — is why incumbents win: they staff it.
- **Support load** rises the moment we display a red badge a parent disagrees with.
  The override workflow and "we never store grades" answer most of it.

## 11. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Wrong verdict puts an ineligible athlete on the field | School sanctioned, trust destroyed | fail-closed, `unknown` never green, AD override, full audit, "as of" always visible |
| **We become the arbiter of eligibility** | Disputes, liability, parent anger | We display and record; the **AD decides**. Every screen says "school decision of record" |
| Gradebook data unreliable/inconsistent | Wrong math | start with term-level summaries (courses passed, GPA), not per-assignment |
| Per-district onboarding doesn't scale | Growth ceiling | broker + self-service CSV + written runbook; hire onboarding before scaling sales |
| Broker pricing kills small-school margin | Unit economics | CSV tier stays free of broker cost |
| FERPA incident | Existential | verdict-only, staff-only, audited, DPA addendum naming the broker as subprocessor |
| State rules change mid-season | Stale verdicts | versioned rulesets, recompute on ruleset change, effective dates |

## 12. Build order (concrete, in this repo)

1. `functions/index.js` — `sisIngestCsv` (callable, AD), `sisSync` (scheduled),
   `evaluateAcademicEligibility` (pure), `overrideEligibility` (callable, AD).
2. `firestore.rules` — new collections: AD-readable, function-write-only, mirroring
   the `auditLogs` pattern.
3. `functions/test` — table-driven rule tests; parity with `EligibilityEngineTests`.
4. `web/pages/sis.js` — connect, upload, unmatched queue, override list.
5. iOS — eligibility row gains academic reasons; "as of" + stale state.
6. `docs/DPA.md` — add the broker to the subprocessor table.
7. Update `docs/SECURITY-QUESTIONNAIRE.md` Q5/Q8 with the real SIS answer.

## 13. Definition of done for the pilot

- One real school, one term, CSV ingest.
- ≥95% of roster auto-matched; remainder resolved by the AD in the queue.
- Verdicts reproducible from a recorded ruleset version.
- Every override audited and listed.
- No grade value stored anywhere in our database — verifiable by inspecting the
  collections after a full term.
- An AD can answer "who is academically ineligible this week?" in under 10 seconds.

## 14. Decision

Three viable paths — see the question posed alongside this document.

