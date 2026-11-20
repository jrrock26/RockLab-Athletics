# Data Processing Agreement (template)

> **Not legal advice.** This is a starting draft for counsel to review, not a
> document to sign as-is. Bracketed items need your real details. Many states
> add mandatory clauses (e.g. CA SOPIPA, NY Ed. Law 2-d, IL SOPPA) — have a
> lawyer localize it before the first district signature.

This Data Processing Agreement ("DPA") is entered into by **[SCHOOL/DISTRICT]**
("School") and **RockLab Technologies** ("Provider") and governs Provider's
processing of Student Data on behalf of School under the RockLab Athletics
service ("Service").

## 1. Roles and scope

Provider acts as a **school official** with a legitimate educational interest
under FERPA (34 CFR § 99.31(a)(1)), and as a **service provider** under
applicable state student-privacy law. Provider processes Student Data only to
deliver the Service, and not for any other purpose.

## 2. Data ownership

School owns all Student Data. Provider claims no ownership, license, or right
to use Student Data for advertising, profiling, model training, resale, or
product development. Provider does not sell Student Data and does not disclose
it except as required to deliver the Service or by law.

## 3. What is processed

| Category | Examples | Purpose |
| --- | --- | --- |
| Roster | name, jersey, position, team | team management |
| Guardian contact | name, email, phone | invitations, emergency contact |
| Forms & signatures | consent, physical, conduct acknowledgments | eligibility determination |
| Medical & emergency | allergies, conditions, medications, contacts | emergency response |
| Injury records | status, description, return-to-play | athlete safety |
| Account data | email, role, sign-in timestamps | authentication, audit |
| Usage media | photos/video uploaded by staff | team media |

Special-category (health) data is limited to what is necessary for emergency
response and return-to-play decisions.

## 4. Permitted use and personnel

Provider access is limited to personnel who need it to operate the Service, who
are bound by confidentiality, and who complete annual privacy training. Access
is logged in the Service's append-only audit trail.

## 5. Security

Provider maintains: role-based access control enforced server-side; encryption
in transit (TLS) and at rest (Google Cloud defaults); an append-only audit trail
for privileged actions and protected-record access; unique accounts (no shared
credentials); and a documented incident-response process.

## 6. Subprocessors

| Subprocessor | Purpose | Location |
| --- | --- | --- |
| Google Cloud / Firebase | hosting, database, storage, auth, messaging | US |
| Resend | transactional email (invitations) | US |
| Stripe | payment processing (no card data stored by Provider) | US |

Provider will give 30 days' notice before adding a subprocessor that processes
Student Data, and School may object.

## 7. Breach notification

Provider will notify School without undue delay and **within 72 hours** of
confirming a breach affecting Student Data, including known scope, data
categories, and remediation. Provider will cooperate with School's notification
obligations at no additional charge.

## 8. Requests from students and guardians

FERPA rights are exercised through School. Provider will forward any direct
request to School within 5 business days and will not respond substantively
without School's instruction. Provider supports access/export and deletion
requests through built-in tooling.

## 9. Return and destruction of data

On termination, School may self-export all Student Data at no charge in a
standard, machine-readable format (implemented: `exportSchoolData`). Provider
will delete Student Data within **60 days** of termination, including backups on
their normal cycle, and certify deletion in writing on request.

## 10. Audit and compliance

On reasonable notice, no more than once per year (or after a confirmed breach),
School may review Provider's relevant security documentation and, where
required by law, request completion of a security questionnaire. Provider will
answer the questionnaire in `docs/SECURITY-QUESTIONNAIRE.md`.

## 11. Term, termination, survival

This DPA runs with the Service agreement. Sections on confidentiality, data
return/destruction, and audit survive termination.

## 12. Signatures

School: ______________________ Title: ____________ Date: ________

Provider: RockLab Technologies — ______________________ Date: ________

**Security contact:** [email] · **Privacy contact:** [email]
