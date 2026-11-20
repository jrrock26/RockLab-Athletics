#!/usr/bin/env node
/**
 * LOCAL-ONLY test data seeder. This is deliberately NOT deployed as a Cloud
 * Function — the production HTTP seeders were removed because they could
 * create accounts with a known password and (in one case) delete every user.
 *
 * Usage (from the `functions` directory, with Application Default Credentials):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/seed-local.js
 *
 * Or after `firebase login`:
 *   firebase functions:config:get > /dev/null && node scripts/seed-local.js
 */
const admin = require('firebase-admin');

const PASSWORD = 'RockLabDev!2026';
const USERS = [
  { email: 'coach@rocklabathletics.com', role: 'coach', name: 'Coach Test' },
  { email: 'player@rocklabathletics.com', role: 'player', name: 'Player Test' },
  { email: 'parent@rocklabathletics.com', role: 'parent', name: 'Parent Test' },
  { email: 'follower@rocklabathletics.com', role: 'follower', name: 'Follower Test' },
  { email: 'staff@rocklabathletics.com', role: 'staff', name: 'Staff Test' },
];

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const db = admin.firestore();

  const schools = await db.collection('schools').limit(1).get();
  const schoolId = schools.docs.length ? schools.docs[0].id : null;
  const teams = schoolId
    ? await db.collection('teams').where('schoolId', '==', schoolId).limit(1).get()
    : { docs: [] };
  const teamId = teams.docs.length ? teams.docs[0].id : null;

  console.log('school:', schoolId, 'team:', teamId);
  const results = [];

  for (const u of USERS) {
    try {
      let uid;
      try {
        const existing = await admin.auth().getUserByEmail(u.email);
        uid = existing.uid;
        if (!existing.emailVerified) {
          await admin.auth().updateUser(uid, { emailVerified: true });
        }
      } catch {
        const created = await admin.auth().createUser({
          email: u.email, password: PASSWORD, emailVerified: true,
        });
        uid = created.uid;
      }

      await db.collection('users').doc(uid).set({
        email: u.email,
        displayName: u.name,
        role: u.role,
        schoolId: schoolId,
        linkedPlayerIds: [],
        teamIds: teamId ? [teamId] : [],
      }, { merge: true });

      await admin.auth().setCustomUserClaims(uid, { role: u.role });

      if (teamId) {
        await db.collection('teams').doc(teamId).collection('members').doc(uid).set({
          teamId, userId: uid, role: u.role, name: u.name, email: u.email, permissions: [],
        }, { merge: true });
      }

      results.push({ email: u.email, uid, ok: true });
    } catch (err) {
      results.push({ email: u.email, ok: false, error: String(err) });
    }
  }

  console.table(results);
  console.log(`\nDone. Password for all seeded accounts: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
