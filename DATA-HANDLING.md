# RockLab Athletics — Data Handling & Privacy

**Last updated:** November 2026
**Applies to:** the RockLab Athletics iOS app and its Firebase backend (`rocklab-athletics`).

This document describes what the system collects, why, who can see it, how long it is kept, and
what third parties process it. It is written for school administrators reviewing the product
(FERPA / COPPA / state student-data-privacy review) and for our own engineering reference.

---

## 1. Who the data subjects are

| Group | What it means here |
|---|---|
| **Student-athletes (minors)** | Roster entries, injury records, emergency contacts, form signatures |
| **Parents / guardians** | Account holders linked to one or more athletes |
| **Staff** | AD, coaches, and staff members with scoped team permissions |
| **Followers** | Community members who follow a team without roster access |

Most records concern **minors**, so the default posture is *minimum necessary*: collect only what a
specific athletic-department workflow requires, and show it only to the roles that workflow needs.

---

## 2. What is collected and why

| Data | Purpose | Linked to identity | Notes |
|---|---|---|---|
| Name, email, phone | Account, invitations, emergency contact | Yes | Phone is optional at sign-up |
| Firebase user ID | Identity, authorization | Yes | Opaque UID; used in security rules |
| Role & team membership | Access control | Yes | AD / coach / staff / player / parent / follower |
| Roster data (jersey, position, grade) | Team management | Yes | Coach-managed |
| **Injury status & injury reports** | Athlete safety, return-to-play | Yes | Body part, description, severity, who reported/cleared |
| **Medical & emergency info** | Emergency response | Yes | Allergies, conditions, medications, emergency contacts |
| Form submissions & signatures | Compliance (physicals, concussion, conduct) | Yes | Typed legal name + timestamp |
| Attendance | Eligibility & participation records | Yes | Per event, staff-scoped |
| Photos & team video | Team media, highlight reels | Yes | Uploaded by staff/athletes |
| Chat messages | Team communication | Yes | Channel-scoped |
| Product analytics events | Product improvement | Pseudonymous | See §5 — no names or emails |
| Crash reports | Stability | Pseudonymous | Stack traces, device model, app version |

We do **not** collect: precise location, advertising identifiers, contacts, browsing history,
biometrics, or health data from HealthKit.

---

## 3. Who can see what (enforced server-side)

Access is enforced by Firestore security rules **and** Cloud Functions — not by the UI alone.

| Data | AD / Coach | Staff | Player | Parent | Follower |
|---|---|---|---|---|---|
| Roster (name, number, position) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Eligibility status** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Injury status** | ✅ | ✅ | ✅ (badge) | ✅ (badge) | ✅ (badge) |
| Injury report detail & history | ✅ | ✅ | ❌ | ❌ | ❌ |
| Emergency contacts | ✅ | ✅ w/ permission | ❌ | ❌ | ❌ |
| Attendance | ✅ | ✅ w/ permission | ❌ | ❌ | ❌ |
| Forms & submissions | ✅ | ✅ w/ permission | ✅ (own) | ✅ (linked) | ❌ |
| **Profile / showcase editing** | ❌ **never** | ❌ **never** | ✅ (own) | ✅ (linked) | ❌ |
| Jerseys & positions | ✅ (edit) | ❌ | 👁 view | 👁 view | ❌ |
| Highlight reels (published) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Direct messages | own conversations only | | | | |

Two rules are worth calling out because they are deliberate:

1. **Coaches and ADs cannot edit an athlete's profile/showcase.** That content belongs to the
   athlete and their guardian. The ownership check is enforced in the security rules by comparing
   the roster entry's `userId` against the caller and their `linkedPlayerIds`.
2. **Eligibility is never shown to students, parents, or followers.** It is staff-only.

---

## 4. Third parties / subprocessors

| Vendor | Role | Data exposed | Region |
|---|---|---|---|
| **Google Firebase** (Auth, Firestore, Storage, Cloud Functions, Cloud Messaging) | Core backend | All app data | `us-central1` |
| **Google Analytics for Firebase** | Product analytics | Pseudonymous events, device model, app version, opaque UID | US |
| **Firebase Crashlytics** | Crash diagnostics | Stack traces, device state, opaque UID | US |
| **OpenAI** (optional, coach-initiated only) | Drafting form text | The coach's own prompt + school/team name. **No student data is sent.** | US |

No data is sold. No advertising SDKs are present. `NSPrivacyTracking` is **false** and there are no
tracking domains.

---

## 5. Analytics & crash reporting specifics

* Attached: opaque Firebase UID, role, opaque school ID, app version, device model, and coarse
  event parameters (e.g. `clip_count: 4`, `duration_bucket: 5_15m`).
* **Never attached:** names, email addresses, phone numbers, roster IDs, medical details, chat
  content, or free-text form answers.
* Crash reports use the same UID so a support engineer can correlate a report with an account when
  the school asks — not to build a profile.

---

## 6. Retention

| Data | Retention |
|---|---|
| Account & profile | Until the account is deleted |
| Roster & forms | Life of the team + current school year |
| Injury reports | Life of the team; treated as a medical record |
| Medical/emergency info | Current school year; refreshed annually |
| Chat & media | Until deleted by team staff |
| Analytics events | 14 months (Google Analytics default) |
| Crash reports | 90 days |

**Deletion:** a school administrator may request deletion of a team's data or a user's account.
Deletion removes Firestore documents, Storage objects, and the Firebase Auth user. Analytics and
Crashlytics records expire on the schedule above and are not individually addressable.

---

## 7. FERPA / COPPA posture

* **FERPA:** the school is the data controller; RockLab acts as a school official with a legitimate
  educational interest, under the school's direct control. Records are not redisclosed except to
  the roles in §3.
* **COPPA:** accounts are created by adults (parents, staff) or by students at the direction of the
  school. We do not knowingly collect personal information from a child under 13 outside a school
  context, and we do not serve advertising.
* **Consent:** legal consent language lives in the form library (20 templates, including FERPA
  release, media release, and concussion acknowledgment) and is captured with a timestamped
  e-signature.
* **Data minimization:** the app stores no more than the athletic workflow requires.

### Known gaps (be honest with reviewers)
* No SIS (PowerSchool / Infinite Campus / Skyward) integration yet — rosters are entered in-app.
* Retention is documented, not enforced by code.
* Self-service account deletion is not yet exposed in the UI; deletions are administrator-run.

---

## 8. Security

* Firebase Authentication (email + password) with **email verification required** before app access.
  Internal `@rocklabathletics.com` accounts are exempt for testing.
* Password reset via Firebase's verified email link.
* Every privileged write (team creation, invitations, roles, injuries, volunteer sign-ups,
  form publishing) goes through a **Cloud Function** with explicit role checks; clients cannot
  bypass them.
* Security rules deny by default and were reviewed per collection.
* Media lives in Firebase Storage under team-scoped paths.

---

## 9. Contact

Data requests, deletion, or security questions: **privacy@rocklabathletics.com**
Security disclosures: **security@rocklabathletics.com**

