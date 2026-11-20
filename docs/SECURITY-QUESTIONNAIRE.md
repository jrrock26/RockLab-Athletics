# Security questionnaire (pre-answered)

Answers to the questions districts actually send. Written to be pasted into a
vendor security form. Where the honest answer is "not yet", it says so — a
surprise in a procurement meeting costs the deal.

Last reviewed: 2026-11-20

---

**1. Where is data hosted?**
Google Cloud (Firebase), United States. Firestore, Cloud Storage, Cloud
Functions in `us-central1`.

**2. Is data encrypted in transit and at rest?**
Yes, both. TLS for all transport; Google-managed encryption at rest for
Firestore and Cloud Storage. No customer-managed keys.

**3. Who can access student records?**
Only staff of the school, scoped by role, enforced server-side in Firestore
security rules — not in the UI. Students, parents, and followers can never read
eligibility, medical, or injury data.

**4. Is there an audit trail?**
Yes for privileged actions (role assignment, invitations, exports) and for staff
opening protected records, in an append-only `auditLogs` collection. Clients
cannot write to it; rules deny all client writes, and the backend never updates
or deletes an entry. It is exportable as CSV by the school's AD.
**Limitation:** this is application-level logging. Firestore cannot log raw
reads, so an actor who bypasses the app is not captured. We do not claim
database-level read audit.

**5. Do you support multi-party signatures (parent + student + physician)?**
Parent and student acknowledgment are implemented. **External physician signing
is not.** Physicals are captured as a parent-uploaded form and recorded as
cleared by staff.

**6. How is coach access scoped?**
A coach sees only teams where they hold a membership document with role
`coach`. Staff permissions are granular (e.g. `staffChat`, `fundraising`,
`commBoardPost`). ADs are school-scoped.

**7. Does data carry forward year over year?**
Roster entries and form submissions persist across seasons. There is **no
automated grade progression or graduation rollover yet** — this is manual.

**8. What is the parent experience on mobile?**
Native iOS app with a single sign-in, one place for schedules, forms, chat, and
payments. Parents sign up with the email the school has on file and the
invitation appears automatically.

**9. Will you sign a DPA?**
Yes — see `docs/DPA.md`. Counsel review required before the first signature.

**10. How does a school get its data back if it cancels?**
Self-service export from the dashboard produces a JSON file with teams, rosters,
events, and invitation status, at no charge, while the account is active. On
termination, data is deleted within 60 days and deletion can be certified.

**11. Do you sell data or show ads?**
No. No advertising SDKs, no third-party analytics, no data sale. Ever.

**12. Do you have SOC 2 / ISO 27001?**
**No.** We can complete a security questionnaire and sign a DPA, but there is no
third-party audit report. Districts that require one will not be able to proceed
yet.

**13. What happens on a data breach?**
Notify the school within 72 hours of confirmation, with scope, categories, and
remediation, and cooperate with the school's own notification duties at no cost.

**14. Is the app penetration tested?**
**Not yet.** Security-relevant design decisions are documented (server-side
authorization, deny-by-default rules, App Check), but no independent pen test has
been performed.

**15. Minimum age?**
13. Accounts for younger students require the school to confirm it holds
appropriate parental consent.

**16. Accessibility?**
Native SwiftUI controls with Dynamic Type and VoiceOver labels on key flows, but
**no formal WCAG 2.1 AA audit** has been completed.
