# Database Migrations

No destructive migrations have been run. Every schema change to date is **additive**
(new fields with defaults, new subcollections), so old documents continue to parse.

## Practice

1. Additive first: new field + default in the reader, never a rename in one step.
2. Readers must tolerate missing fields — `as?` with a default, never a force unwrap.
3. Backfills are written as a scripted, idempotent pass, run with owner credentials
   (rules bypassed), and logged here before execution.
4. `PATCH` against Firestore REST **must** carry `updateMask`, or it replaces the whole
   document and silently deletes fields. This bit during testing and wiped
   `schools.adUserId`; recovered from known values.
5. Destructive work (delete/backfill over existing rows) requires a written rollback
   and a data export first.

## Applied so far (additive)

| Date | Collection | Change | Backfill needed |
|---|---|---|---|
| 2026-11-21 | `games` | `clockRunning` (Bool), `clockStartedAt` (Double) | No — absent reads as not running |
| 2026-11-21 | `games/{id}/plays` (new) | Play-by-play documents | No |
| 2026-11-21 | `schools` | `adTransferredAt`, `adTransferredFrom` | No |
| 2026-11-21 | `invitations` | `adTransfer`, `invitedBy`, `invitedByName`, `inviteUrl`, `deliveryStatus`, `deliveryNote` | No — older rows lack them and must stay readable |
| 2026-11-21 | `teams/{id}/roster` | `movedFromTeamId` on transferred entries | No |

## Pending (planned, not applied)

| Feature | Change | Notes |
|---|---|---|
| 1 | `invitations.expiresAt` | Time-blind status today; sweep needed for "expired" |
| 1 | `invitations.lastSentAt`, `sendCount` | Audit trail for resend |
| 1 | `invitations.rosterEntryId` | Parent↔athlete link at acceptance |
| 9 | `physicals` collection | Medical documents need their own access rules, not the team-media pattern |

## Rollback notes

Every change above is additive, so rollback is "stop reading the field" rather than a
data operation. The only irreversible action taken this session was in *test* data
(seeded school/team/game), which can be deleted wholesale by its known document IDs.
