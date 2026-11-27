#!/usr/bin/env node
/**
 * Create (or remove) the four dedicated QA accounts used to test cross-platform
 * workflows. Run it yourself; no credential is ever pasted into a chat.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/create-test-accounts.js
 *
 *   ... --cleanup     removes ONLY what this script created
 *
 * What it makes, all under a "qa-" id prefix so nothing can collide with a real
 * school, team or person:
 *
 *   schools/qa-school              "QA Test School", adUserId = the QA AD
 *   teams/qa-team                  schoolId qa-school, basketball, headCoachId set
 *   teams/qa-team/members/…        coach, athlete and parent memberships
 *   teams/qa-team/roster/qa-entry  the athlete, guarded by the parent
 *   players/qa-player              durable identity, owned by the school
 *   players/qa-player/guardians/…  parent → child link
 *   users/{uid}                    one per account, with role + schoolId
 *
 * Credentials land in .local-test-accounts.json (gitignored, mode 0600) and are
 * never printed. Existing users and documents are never touched: every email and
 * id is checked first and the script aborts rather than merge over one.
 *
 * It refuses to run twice. If the manifest exists, use --cleanup first: a second
 * run would mint another set of accounts that nothing tracks.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const PROJECT = 'rocklab-athletics';
const MANIFEST = path.join(__dirname, '..', '..', '.local-test-accounts.json');
const EMAIL_DOMAIN = 'rocklab.test'; // reserved TLD: cannot receive mail by accident

const IDS = {
  school: 'qa-school',
  team: 'qa-team',
  player: 'qa-player',
  entry: 'qa-entry',
  event: 'qa-event',
  // A second school exists purely so the cross-school probe has a real counterparty:
  // an AD who is genuinely an AD, genuinely of somewhere else.
  school2: 'qa-school-2',
  team2: 'qa-team-2',
};

const ACCOUNTS = [
  { key: 'ad', email: `qa-ad@${EMAIL_DOMAIN}`, role: 'ad', name: 'QA Athletic Director' },
  { key: 'coach', email: `qa-coach@${EMAIL_DOMAIN}`, role: 'coach', name: 'QA Head Coach' },
  { key: 'parent', email: `qa-parent@${EMAIL_DOMAIN}`, role: 'parent', name: 'QA Parent' },
  { key: 'athlete', email: `qa-athlete@${EMAIL_DOMAIN}`, role: 'player', name: 'QA Athlete' },
  { key: 'ad2', email: `qa-ad2@${EMAIL_DOMAIN}`, role: 'ad', name: 'QA Athletic Director (Second School)' },
];

const newPassword = () => crypto.randomBytes(24).toString('base64url');

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function writeManifest(data) {
  fs.writeFileSync(MANIFEST, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(MANIFEST, 0o600);
}

async function findUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return null;
    throw err;
  }
}

async function assertNothingExists(db, auth) {
  const checks = [
    ['schools', IDS.school],
    ['teams', IDS.team],
    ['players', IDS.player],
    ['teams/' + IDS.team + '/roster', IDS.entry],
    ['schools', IDS.school2],
    ['teams', IDS.team2],
    ['events', IDS.event],
  ];
  for (const [collection, id] of checks) {
    const snap = await db.doc(`${collection}/${id}`).get();
    if (snap.exists) {
      console.error(`[qa] ${collection}/${id} already exists — refusing to overwrite.`);
      process.exit(1);
    }
  }
  for (const account of ACCOUNTS) {
    if (await findUser(auth, account.email)) {
      console.error(`[qa] ${account.email} already exists — refusing to modify an existing account.`);
      process.exit(1);
    }
  }
}

async function create() {
  if (readManifest()) {
    console.error('[qa] .local-test-accounts.json already exists. Run with --cleanup first.');
    process.exit(1);
  }

  const db = admin.firestore();
  const auth = admin.auth();
  await assertNothingExists(db, auth);

  const passwords = {};
  const uids = {};

  for (const account of ACCOUNTS) {
    const secret = newPassword();
    const user = await auth.createUser({
      email: account.email,
      password: secret,
      emailVerified: true, // QA accounts skip the verification gate; no mailbox exists
      displayName: account.name,
    });
    passwords[account.key] = secret;
    uids[account.key] = user.uid;
  }
  console.log(`[qa] ${ACCOUNTS.length} auth accounts created`);

  // `${collection}/${id}` in creation order; cleanup walks it backwards.
  const docs = [];
  const write = async (docPath, data) => {
    await db.doc(docPath).set(data);
    docs.push(docPath);
  };

  await write(`schools/${IDS.school}`, {
    name: 'QA Test School',
    mascot: 'QA',
    adUserId: uids.ad,
    sports: ['basketball'],
    isQaFixture: true,
  });

  await write(`teams/${IDS.team}`, {
    name: 'QA Varsity Basketball',
    sportId: 'basketball',
    sportName: 'Basketball',
    level: 'Varsity',
    season: '2026-27',
    gender: 'Girls',
    schoolId: IDS.school,
    headCoachId: uids.coach,
    isQaFixture: true,
  });

  for (const [key, role] of [['coach', 'coach'], ['athlete', 'player'], ['parent', 'parent']]) {
    await write(`teams/${IDS.team}/members/${uids[key]}`, { role, userId: uids[key] });
  }

  await write(`schools/${IDS.school2}`, {
    name: 'QA Second School',
    mascot: 'QA2',
    adUserId: uids.ad2,
    sports: ['basketball'],
    isQaFixture: true,
  });

  await write(`teams/${IDS.team2}`, {
    name: 'QA Second School Basketball',
    sportId: 'basketball',
    sportName: 'Basketball',
    level: 'Varsity',
    season: '2026-27',
    gender: 'Boys',
    schoolId: IDS.school2,
    isQaFixture: true,
  });

  // One event, so a parent RSVP has something real to answer.
  await write(`events/${IDS.event}`, {
    teamId: IDS.team,
    type: 'game',
    title: 'QA Scrimmage',
    opponent: 'QA Second School',
    isHome: true,
    isQaFixture: true,
  });

  await write(`teams/${IDS.team}/roster/${IDS.entry}`, {
    firstName: 'Quinn',
    lastName: 'Athlete',
    playerName: 'Quinn Athlete',
    jerseyNumber: '12',
    position: 'Guard',
    userId: uids.athlete,
    guardianUserIds: [uids.parent],
    injuryStatus: 'healthy',
    seasonId: IDS.team,
  });

  await write(`players/${IDS.player}`, {
    schoolId: IDS.school,
    firstName: 'Quinn',
    lastName: 'Athlete',
    claimedByUserId: uids.athlete,
    isQaFixture: true,
  });

  await write(`players/${IDS.player}/guardians/${uids.parent}`, {
    name: 'QA Parent',
    phone: '555-0100',
  });

  const profile = {
    ad: { role: 'ad', schoolId: IDS.school },
    coach: { role: 'coach', schoolId: IDS.school, teamIds: [IDS.team] },
    parent: { role: 'parent', schoolId: IDS.school, linkedPlayerIds: [IDS.player], teamIds: [IDS.team] },
    athlete: { role: 'player', schoolId: IDS.school, teamIds: [IDS.team] },
    ad2: { role: 'ad', schoolId: IDS.school2 },
  };
  for (const account of ACCOUNTS) {
    await write(`users/${uids[account.key]}`, {
      email: account.email,
      displayName: account.name,
      ...profile[account.key],
      isQaFixture: true,
    });
  }

  writeManifest({
    project: PROJECT,
    createdAt: new Date().toISOString(),
    docs,
    accounts: Object.fromEntries(
      ACCOUNTS.map((a) => [a.key, { email: a.email, uid: uids[a.key], role: a.role, password: passwords[a.key] }]),
    ),
  });

  console.log('[qa] relationships written:');
  console.log(`     AD      ${uids.ad}  owns schools/${IDS.school}`);
  console.log(`     Coach   ${uids.coach}  head coach of teams/${IDS.team}`);
  console.log(`     Parent  ${uids.parent}  guardian of roster/${IDS.entry} + players/${IDS.player}`);
  console.log(`     Athlete ${uids.athlete}  userId on roster/${IDS.entry}`);
  console.log(`     AD #2   ${uids.ad2}  owns schools/${IDS.school2} (the intruder for the probe)`);
  console.log(`[qa] credentials written to ${path.basename(MANIFEST)} (mode 0600, gitignored). Not printed here.`);
}

async function cleanup() {
  const manifest = readManifest();
  if (!manifest) {
    console.error('[qa] no manifest — nothing to clean up.');
    process.exit(1);
  }

  const db = admin.firestore();
  const auth = admin.auth();

  let docsRemoved = 0;
  for (const docPath of [...manifest.docs].reverse()) {
    try {
      await db.doc(docPath).delete();
      docsRemoved += 1;
    } catch (err) {
      console.warn(`[qa] could not delete ${docPath}: ${err.message}`);
    }
  }

  let usersRemoved = 0;
  for (const account of Object.values(manifest.accounts)) {
    try {
      await auth.deleteUser(account.uid);
      usersRemoved += 1;
      console.log(`[qa] removed account ${account.email}`);
    } catch (err) {
      console.warn(`[qa] could not delete ${account.email}: ${err.message}`);
    }
  }

  fs.unlinkSync(MANIFEST);
  console.log(`[qa] cleanup complete: ${docsRemoved} documents, ${usersRemoved} accounts, manifest removed.`);
}

async function main() {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
  if (process.argv.includes('--cleanup')) await cleanup();
  else await create();
}

main().catch((err) => {
  console.error('[qa] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
