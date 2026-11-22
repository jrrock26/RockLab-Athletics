#!/usr/bin/env node
/**
 * One-time migration: guardians stored as `follower` become `parent`.
 *
 * Background: acceptInvitation used to write
 *   membershipRole = role === 'parent' ? 'follower' : role
 * Everything downstream read that membership role — firestore.rules (practice
 * events, comm-board categories) and TeamAccess.isParent on iOS — so a real parent
 * was treated as a community follower: no practice details, no coach announcements,
 * and the parent channel closed to them.
 *
 * The code is fixed. Rows already written are not, so this backfills them. It only
 * touches memberships whose *user* role is a guardian, so a genuine follower (joined
 * by code, follows a team without an athlete) is left alone.
 *
 * Idempotent: re-running changes nothing.
 *
 * Usage (from the `functions` directory):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrate-guardian-roles.js --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrate-guardian-roles.js
 */
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');

/// Stored roles that mean guardian. iOS shipped `family` before the rename.
const GUARDIAN_ROLES = new Set(['parent', 'family']);

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'rocklab-athletics' });
  }
  const db = admin.firestore();

  const users = await db.collection('users').get();
  const guardians = users.docs.filter((d) => GUARDIAN_ROLES.has(d.get('role')));

  let memberships = 0;
  let upgraded = 0;
  let roleFixes = 0;

  for (const user of guardians) {
    // users.role === 'family' would not decode as UserRole on iOS, so normalise it.
    if (user.get('role') !== 'parent') {
      roleFixes += 1;
      if (!DRY_RUN) await user.ref.set({ role: 'parent' }, { merge: true });
    }

    const teamIds = Array.isArray(user.get('teamIds')) ? user.get('teamIds') : [];
    for (const teamId of teamIds) {
      const memberRef = db.collection('teams').doc(teamId)
        .collection('members').doc(user.id);
      const member = await memberRef.get();
      memberships += 1;
      if (!member.exists) continue;
      if (member.get('role') === 'parent') continue;
      upgraded += 1;
      if (!DRY_RUN) {
        await memberRef.set({
          role: 'parent',
          migratedFrom: member.get('role') || null,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }

  console.log(
    `[guardian-roles] guardians=${guardians.length} memberships=${memberships} ` +
    `upgraded=${upgraded} roleFixes=${roleFixes} dryRun=${DRY_RUN}`
  );
}

main().catch((err) => {
  console.error('[guardian-roles] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
