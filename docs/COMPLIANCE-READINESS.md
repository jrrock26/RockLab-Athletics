# Compliance readiness

Written for a district IT/procurement review, not for marketing. It states what
is implemented, what is procedural, and what is still missing. Anything marked
**Gap** should be treated as a blocker for a district-wide sale until closed.

Last reviewed: 2026-11-20

---

## 1. What is actually in place

| Control | Status | Where |
| --- | --- | --- |
| Role-based access (AD / coach / staff / player / parent / follower) | Implemented | `firestore.rules`, custom claims via `syncUserRoleClaims` |
| Eligibility is staff-only, never shown to students, parents, or followers | Implemented | `firestore.rules`, `DATA-HANDLING.md` §2 |
| Least-privilege reads: followers see only public comm-board categories | Implemented | `messageReadAllowed` in `firestore.rules` |
| Invitation records scoped to invitee / school AD / team staff | Implemented | `firestore.rules` (`invitations`) |
| Append-only audit trail for privileged actions and protected-record access | Implemented | `auditLogs` collection, written only by Cloud Functions |
| Audit entries cannot be forged or deleted by any client | Implemented | `auditLogs` rule: `allow write: if false` |
| School data export, free, self-service | Implemented | `exportSchoolData` callable, dashboard button |
| In-app account deletion + storage sweep | Implemented | `deleteMyAccount` Cloud Function |
| UGC safety: report, block, moderation queue (App Store 1.2) | Implemented | `reportContent`, `blockUser`, `web/pages/reports.js` |
| App Check (App Attest) registered | Implemented, **enforcement off** | Firebase console |
| Encryption in transit / at rest | Google-managed | Cloud Firestore / Cloud Storage defaults |
| No third-party analytics or ad SDKs | Verified | no ad/analytics SDK in the build |
| No third-party login (so no Apple 4.8 exposure) | Verified | email/password only |

## 2. What is procedural, not code

These are real controls, but they are things you do rather than things the app
enforces. A district will ask for them in writing.

- **Data Processing Agreement** — template in `docs/DPA.md`. Requires review by
  counsel before signature.
- **Breach notification** — 72-hour internal target; document the runbook.
- **Access review** — quarterly review of who holds `ad`/`staff` claims.
- **Retention** — no automated purge yet. Records persist until a school deletes
  them. Publish a retention schedule.

## 3. Gaps to close before a district-wide sale

1. **Reads are not audited at all.** Writes are (`writeAudit` → `auditLogs`), but
   Firestore cannot audit reads and no client call reports them: the
   `recordAccess` callable that was meant to is gone. A staff member opening a
   protected record leaves no trail. The rule set still prevents non-staff reads.
   Do not claim "access logging" or "complete audit coverage" for reads; if a
   district requires it, the callable has to be rebuilt and wired into every
   protected-record screen.
2. **No SIS integration.** "Eligibility" here means paperwork complete. It does
   **not** include academic eligibility from PowerSchool/Synergy/Infinite Campus.
   Rank One and FinalForms win on this. Say so before a demo, not after.
3. **No automated retention or legal hold.**
4. **No SOC 2 report.** Answer security questionnaires with the template in
   `docs/SECURITY-QUESTIONNAIRE.md`; expect to lose deals that require a report.
5. **Accessibility not audited.** No VoiceOver or WCAG 2.1 AA audit has been run.
6. **State student-data laws are state-specific.** California SOPIPA, New York
   Education Law 2-d, Illinois SOPPA, etc. each add contractual terms. Confirm
   per state before signing.
7. **COPPA**: most athletes are 13–18, but a school may add younger students on
   sub-varsity teams. Decide the minimum age and enforce it at signup.

## 4. Honest positioning language

Use: "RockLab records who may participate and who accessed what, with an
append-only audit trail and free export of your data."

Avoid: "FERPA certified" (nobody is), "complete audit logging", "academic
eligibility", "HIPAA compliant" (schools are generally not covered entities).
