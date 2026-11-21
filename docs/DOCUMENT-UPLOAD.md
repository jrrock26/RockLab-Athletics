# Document Upload (physicals, waivers)

## Finding: there is no upload path for families at all

`storage.rules` defines exactly four paths: `users/{uid}`, `schools/{schoolId}`,
`teams/{teamId}/media`, `teams/{teamId}/videos`. Everything else is **closed**
(`match /{allPaths=**} { allow read, write: if false; }`).

Every existing path is written by staff (`isCoachOf` / `role == 'staff'`) or by the
account owner for a profile photo. **No guardian and no athlete can write any file
anywhere.** So "upload your physical" is not a UI task with a rules footnote — it is a
rules and data-model project.

## Why it must not be rushed

Sports physicals are medical records about minors. A path opened carelessly leaks them;
a path opened as "any signed-in user can read" leaks them to every school on the
platform. This is the one feature in Feature 2 where a mistake is a breach rather than a
bug, so it gets designed before it gets built.

## Design (proposed, not implemented)

**Path**
```
teams/{teamId}/roster/{entryId}/documents/{fileId}
```
Scoped to the athlete, not the team, so a guardian's access can be expressed as "my
child" rather than "this team".

**Write** — the guardian of THAT entry, or staff:
```
allow write: if signedIn()
  && ( isAd() || isCoachOf(teamId) || memberRole(teamId) == 'staff'
       || request.auth.uid in firestore.get(
            /databases/(default)/documents/teams/$(teamId)/roster/$(entryId)).data.guardianUserIds )
  && request.resource.size < 10 * 1024 * 1024
  && request.resource.contentType in ['application/pdf', 'image/jpeg', 'image/png'];
```
The `guardianUserIds` check is the same authority the Firestore rules use — server-written,
not client-writable. Note Storage rules can read Firestore; they cannot read the
`users.linkedPlayerIds` field safely because it is client-writable.

**Read** — guardian of that entry, coaching staff, AD. **Never** a follower, and never a
player. A teammate must not be able to open another child's physical.

**Record** — the upload must also write the form document
(`teams/{t}/roster/{e}/forms/{formId}`) with `status: 'submitted'`,
`documentPath`, `submittedBy`, `signedAt`. A file with no record is invisible to staff.

## Two defects found while checking

1. **`storage.rules` uses custom claims (`request.auth.token.role`) while
   `firestore.rules` reads the user document.** The two can disagree — a stale token
   grants Storage access that Firestore would refuse. Both should read the same source.
2. **`isAd()` in Storage has no school-ownership check.** The Firestore fix that closed
   the AD escalation was never mirrored here, so a token carrying `role: 'ad'` passes
   Storage `isAd()` regardless of owning a school.

Neither is exploited today only because no sensitive path is open. Opening document
upload without fixing them first would make both exploitable.

## Sequencing

1. Fix the two `storage.rules` defects above (small, and they gate everything else).
2. Add the documents path and its rules.
3. Web upload on the physical requirement, with the form write.
4. Verify: guardian uploads for own child (200); guardian uploads for another child
   (403); player reads a teammate's document (403); coach reads (200).
