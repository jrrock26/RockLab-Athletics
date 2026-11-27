#!/usr/bin/env node
/**
 * Audit teams for schema drift: missing schoolId, sportId, headCoachId.
 * Reports which teams are invisible to schoolId-filtered queries.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/audit-teams.js
 */
const admin = require('firebase-admin');

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'rocklab-athletics' });
  }
  const db = admin.firestore();

  const teams = await db.collection('teams').get();
  console.log(`Total teams: ${teams.docs.length}\n`);

  let missingSchoolId = 0;
  let missingSportId = 0;
  let missingHeadCoachId = 0;
  let missingAll = 0;

  for (const doc of teams.docs) {
    const data = doc.data();
    const missing = [];
    if (!data.schoolId) missing.push('schoolId');
    if (!data.sportId) missing.push('sportId');
    if (!data.headCoachId) missing.push('headCoachId');

    if (missing.length === 3) missingAll++;
    if (missing.includes('schoolId')) missingSchoolId++;
    if (missing.includes('sportId')) missingSportId++;
    if (missing.includes('headCoachId')) missingHeadCoachId++;

    if (missing.length > 0) {
      console.log(`TEAM ${doc.id}: missing [${missing.join(', ')}] | present: ${Object.keys(data).join(', ')}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Missing schoolId: ${missingSchoolId}`);
  console.log(`Missing sportId: ${missingSportId}`);
  console.log(`Missing headCoachId: ${missingHeadCoachId}`);
  console.log(`Missing all three: ${missingAll}`);

  const schools = await db.collection('schools').get();
  console.log(`\nTotal schools: ${schools.docs.length}`);
  for (const doc of schools.docs) {
    const d = doc.data();
    console.log(`  SCHOOL ${doc.id}: name="${d.name}" adUserId="${d.adUserId}" district="${d.district}"`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });