# Release checklist

Two tracks: what **I can finish in code**, and what **only you can do** because it
needs an account, a payment method, or a signature.

Last reviewed: 2026-11-20

---

## A. Configuration you must supply

### 1. Email (blocker for onboarding, not for shipping)

Without this, invitations are created and carry working links, but nothing is
emailed. The console shows the links so an AD can send them manually — so this is
no longer a hard blocker, just friction.

```bash
firebase functions:secrets:set RESEND_API_KEY     # from resend.com
firebase functions:secrets:set RESEND_FROM        # e.g. "RockLab <invites@yourdomain.com>"
```

`RESEND_FROM` must be a domain you have verified in Resend (SPF + DKIM). Sending
from an unverified domain fails at the provider, and we record that failure on
the invitation as `deliveryStatus: failed` rather than pretending it sent.

Optional fallback (used only if Resend is absent):

```bash
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
```

### 2. Stripe (blocker for revenue)

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Until both exist, the webhook returns **503 by design** (fail closed) — it will
not accept unsigned events.

### 3. Install link for the invite page

```bash
# web/.env.local
NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/app/id<YOUR_APP_ID>
```

Leave it empty until the app is live; the invite page degrades to "your athletic
director will send the install link".

---

## B. App Store submission — remaining steps

Code-side is done. What is left is metadata and your Apple account.

1. **Archive and upload** in Xcode (Release scheme, automatic signing).
   TestFlight internal testing first.
2. **App Privacy nutrition labels** — must match `DATA-HANDLING.md`. Declare:
   contact info, user content, identifiers, diagnostics. Declaring fewer
   categories than you collect is the usual rejection.
3. **Age rating** — chat + user-generated media means you are not 4+.
4. **Screenshots** — 6.9" iPhone and 13" iPad are the current required sizes
   (both captured and re-verified under the restored bundle ID).
5. **Privacy Policy URL** — `https://rocklab-athletics.web.app/privacy/`
6. **Support URL** — `https://rocklab-athletics.web.app/support/`
7. **Export compliance** — `ITSAppUsesNonExemptEncryption = NO` is already set.
8. **Demo account for review** — reviewers must be able to sign in and see a
   populated team. Create a review account with a school, a team, and a roster;
   put the credentials in the review notes. A reviewer who lands on an empty
   first-run screen rejects the app for "incomplete".
9. **Guideline 1.2 notes** — the app has report, block, and a moderation queue;
   say so explicitly in the review notes, with where to find each.

---

## C. Deploy order (after tests pass)

```bash
firebase deploy --only functions        # new callables + email/audit layer
firebase deploy --only firestore:rules  # auditLogs + invitations lockdown
cd web && npm run build && firebase deploy --only hosting
```

Rules must go out with the functions: the tightened `invitations` read rule is
what protects parent email addresses, and `recordAccess` is what writes the
audit trail the rule then exposes to the AD.

---

## D. Still missing for a district-wide sale

Ordered by how often it loses deals.

1. **SIS integration** (PowerSchool / Infinite Campus / Synergy) — without it,
   "eligibility" is paperwork-only, and Rank One beats you in the demo.
2. **External physician signing** on the physical form.
3. **State-specific form templates** (the library is generic-but-solid).
4. **District-level admin** (one pane for many schools).
5. **SOC 2** — the gate on larger districts. Expect to lose those until you have it.
6. **Penetration test** and an accessibility audit.
7. **Automated retention + grade rollover.**

## E. What changed in this pass

- Invitations carry a shareable link; email uses Resend (preferred) or SMTP, and
  reports true delivery state instead of failing silently.
- `resendInvitation` callable for retries.
- Append-only `auditLogs`, written only by Cloud Functions; AD-readable, with CSV
  export at `/audit`.
- `recordAccess` callable for staff access to protected records.
- `exportSchoolData` callable + dashboard button (FERPA portability).
- Invitation documents no longer readable by every signed-in user.
- Invite email matching normalized end to end (silent "no invitations" bug).
- Adaptive auth layout for iPad; opaque form card; high-contrast fields.
- `docs/DPA.md`, `docs/SECURITY-QUESTIONNAIRE.md`, `docs/COMPLIANCE-READINESS.md`.
