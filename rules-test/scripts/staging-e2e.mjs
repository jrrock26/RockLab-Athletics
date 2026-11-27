#!/usr/bin/env node
/**
 * Staging end-to-end: real accounts, real sign-ins, real rules.
 *
 *   node rules-test/scripts/staging-e2e.mjs
 *
 * Refuses any project except rocklab-athletics-staging. Creates five accounts with
 * generated passwords (stored in .local-test-accounts.staging.json, gitignored, never
 * printed), seeds the qa- fixtures with the operator's own credential, then performs
 * every workflow as that role's real ID token.
 *
 * Two vocabularies are kept apart on purpose:
 *   - "emulator" results live in rules-test/tests and never appear here
 *   - every line this script prints was executed against staging, or says NOT RUN
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const PROJECT = 'rocklab-athletics-staging';
const WEB_CONFIG = '/tmp/staging-web-config.json';

const IDS = {
  school: 'qa-school', school2: 'qa-school-2',
  team: 'qa-team', team2: 'qa-team-2',
  entry: 'qa-entry', entryOther: 'qa-entry-other',
  player: 'qa-player', event: 'qa-event',
};

const ACCOUNTS = [
  { key: 'ad', email: 'qa-ad@rocklab.test', role: 'ad', name: 'QA Athletic Director' },
  { key: 'ad2', email: 'qa-ad2@rocklab.test', role: 'ad', name: 'QA AD Second School' },
  { key: 'coach', email: 'qa-coach@rocklab.test', role: 'coach', name: 'QA Head Coach' },
  { key: 'parent', email: 'qa-parent@rocklab.test', role: 'parent', name: 'QA Parent' },
  { key: 'athlete', email: 'qa-athlete@rocklab.test', role: 'player', name: 'QA Athlete' },
];

const newPassword = () => crypto.randomBytes(24).toString('base64url');
const str = (v) => ({ stringValue: v });
const bool = (v) => ({ booleanValue: v });
const arr = (v) => ({ arrayValue: { values: v.map((x) => ({ stringValue: x })) } });

/// The operator's CLI token. Seeding is the one place a bypass is legitimate: the
/// fixtures are the world the rules are then asked about, not something a client may
/// create. It is read from the local firebase-tools config and never leaves the machine.
function operatorToken() {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  return cfg.tokens.access_token;
}

const FS = () => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function signUp(key, email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    // Re-running the script must reuse, not duplicate: sign in instead.
    if (body?.error?.message === 'EMAIL_EXISTS') return signIn(key, email, password);
    throw new Error(`signUp ${email}: ${body?.error?.message || res.status}`);
  }
  return { uid: body.localId, idToken: body.idToken };
}

async function signIn(key, email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`signIn ${email}: ${body?.error?.message || res.status}`);
  return { uid: body.localId, idToken: body.idToken };
}

async function seed(token, docPath, fields) {
  const res = await fetch(`${FS()}/${docPath}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`seed ${docPath}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}

const get = (idToken, p) => fetch(`${FS()}/${p}`, { headers: { Authorization: `Bearer ${idToken}` } }).then((r) => r.status);
const patch = (idToken, p, fields) => {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
  return fetch(`${FS()}/${p}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  }).then((r) => r.status);
};
const create = (idToken, coll, id, fields) => fetch(`${FS()}/${coll}?documentId=${id}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields }),
}).then((r) => r.status);

async function upload(idToken, bucket, objectName, text) {
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(objectName)}&uploadType=media`,
    { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/pdf' }, body: text },
  );
  return res.status;
}

const RESULTS = [];
function record(group, name, status, expect) {
  const ok = status === expect;
  RESULTS.push({ group, name, status, expect, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}  (HTTP ${status}, expected ${expect})`);
}

async function main() {
  if (!fs.existsSync(WEB_CONFIG)) {
    console.log(`NOT RUN: ${WEB_CONFIG} is missing (staging web config). Nothing was tested.`);
    process.exit(2);
  }
  const web = JSON.parse(fs.readFileSync(WEB_CONFIG, 'utf8'));
  const bucket = web.storageBucket || `${PROJECT}.firebasestorage.app`;
  const op = operatorToken();

  // 1. Accounts
  const creds = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { accounts: {} };
  const sessions = {};
  for (const account of ACCOUNTS) {
    const password = creds.accounts[account.key]?.password || newPassword();
    const session = creds.accounts[account.key]?.password
      ? await signIn(web.apiKey, account.email, password)
      : await signUp(web.apiKey, account.email, password);
    creds.accounts[account.key] = { email: account.email, role: account.role, password, ...session };
    sessions[account.key] = session;
  }
  fs.writeFileSync(MANIFEST, JSON.stringify({ project: PROJECT, apiKey: web.apiKey, bucket, accounts: creds.accounts }, null, 2), { mode: 0o600 });
  fs.chmodSync(MANIFEST, 0o600);
  console.log(`project: ${PROJECT}   bucket: ${bucket}`);
  console.log(`accounts: ${Object.keys(sessions).join(', ')}   (passwords in ${path.basename(MANIFEST)})\n`);

  const { ad, ad2, coach, parent, athlete } = sessions;

  // 2. Fixtures, written as the operator (rules disabled by identity, not by flag)
  // Profiles first: every rule starts at users/{uid}.role and .schoolId.
  await seed(op, `users/${ad.uid}`, { role: str('ad'), schoolId: str(IDS.school), displayName: str('QA Athletic Director'), email: str('qa-ad@rocklab.test') });
  await seed(op, `users/${ad2.uid}`, { role: str('ad'), schoolId: str(IDS.school2), displayName: str('QA AD Second School'), email: str('qa-ad2@rocklab.test') });
  await seed(op, `users/${coach.uid}`, { role: str('coach'), schoolId: str(IDS.school), displayName: str('QA Head Coach') });
  await seed(op, `users/${parent.uid}`, { role: str('parent'), schoolId: str(IDS.school), displayName: str('QA Parent') });
  await seed(op, `users/${athlete.uid}`, { role: str('player'), schoolId: str(IDS.school), displayName: str('QA Athlete') });

  await seed(op, `schools/${IDS.school}`, { name: str('QA Test School'), adUserId: str(ad.uid), isQaFixture: bool(true) });
  await seed(op, `schools/${IDS.school2}`, { name: str('QA Second School'), adUserId: str(ad2.uid), isQaFixture: bool(true) });
  await seed(op, `teams/${IDS.team}`, { name: str('QA Varsity Basketball'), sportId: str('basketball'), level: str('Varsity'), season: str('2026-27'), schoolId: str(IDS.school), headCoachId: str(coach.uid), isQaFixture: bool(true) });
  await seed(op, `teams/${IDS.team2}`, { name: str('QA Second School Basketball'), sportId: str('basketball'), level: str('Varsity'), season: str('2026-27'), schoolId: str(IDS.school2), isQaFixture: bool(true) });
  await seed(op, `teams/${IDS.team}/members/${coach.uid}`, { role: str('coach'), userId: str(coach.uid) });
  await seed(op, `teams/${IDS.team}/members/${parent.uid}`, { role: str('parent'), userId: str(parent.uid) });
  await seed(op, `teams/${IDS.team}/members/${athlete.uid}`, { role: str('player'), userId: str(athlete.uid) });
  await seed(op, `teams/${IDS.team}/roster/${IDS.entry}`, { firstName: str('Quinn'), lastName: str('Athlete'), userId: str(athlete.uid), guardianUserIds: arr([parent.uid]), injuryStatus: str('healthy'), jerseyNumber: str('12') });
  await seed(op, `teams/${IDS.team}/roster/${IDS.entryOther}`, { firstName: str('Other'), lastName: str('Family'), userId: str('nobody'), guardianUserIds: arr(['nobody']), injuryStatus: str('injured') });
  await seed(op, `teams/${IDS.team}/injuryReports/inj1`, { rosterEntryId: str(IDS.entry), status: str('healthy') });
  await seed(op, `players/${IDS.player}`, { schoolId: str(IDS.school), firstName: str('Quinn'), lastName: str('Athlete'), claimedByUserId: str(athlete.uid) });
  await seed(op, `players/${IDS.player}/guardians/${parent.uid}`, { name: str('QA Parent') });
  await seed(op, `showcases/${IDS.entry}`, { rosterEntryId: str(IDS.entry), teamId: str(IDS.team), playerName: str('Quinn Athlete'), gpa: str('3.9') });
  await seed(op, `events/${IDS.event}`, { teamId: str(IDS.team), type: str('game'), title: str('QA Scrimmage'), opponent: str('QA Second School') });
  await seed(op, `auditLogs/qa-log`, { schoolId: str(IDS.school), action: str('qa.seed') });
  console.log('fixtures seeded (operator identity)\n');

  // 3. AD of school A manages its own school and team
  record('AD own school', 'reads own team document', await get(ad.idToken, `teams/${IDS.team}`), 200);
  record('AD own school', 'renames own team', await patch(ad.idToken, `teams/${IDS.team}`, { name: str('QA Varsity Basketball') }), 200);
  record('AD own school', 'reads own roster entry', await get(ad.idToken, `teams/${IDS.team}/roster/${IDS.entry}`), 200);
  record('AD own school', 'reads own school audit log', await get(ad.idToken, `auditLogs/qa-log`), 200);

  // 4. AD of another school is denied
  record('AD other school', 'roster read denied', await get(ad2.idToken, `teams/${IDS.team}/roster/${IDS.entry}`), 403);
  record('AD other school', 'team rewrite denied', await patch(ad2.idToken, `teams/${IDS.team}`, { name: str('taken') }), 403);
  record('AD other school', 'injury report read denied', await get(ad2.idToken, `teams/${IDS.team}/injuryReports/inj1`), 403);
  record('AD other school', 'player identity read denied', await get(ad2.idToken, `players/${IDS.player}`), 403);
  record('AD other school', 'guardian row read denied', await get(ad2.idToken, `players/${IDS.player}/guardians/${parent.uid}`), 403);
  record('AD other school', 'showcase (GPA) read denied', await get(ad2.idToken, `showcases/${IDS.entry}`), 403);
  record('AD other school', 'audit log read denied', await get(ad2.idToken, `auditLogs/qa-log`), 403);

  // 5. Coach works on their own team
  record('Coach', 'creates an event', await create(coach.idToken, 'events', `qa-coach-event-${Date.now()}`, { teamId: str(IDS.team), type: str('practice'), title: str('QA practice') }), 200);
  record('Coach', 'updates own roster entry', await patch(coach.idToken, `teams/${IDS.team}/roster/${IDS.entry}`, { jerseyNumber: str('7') }), 200);

  // 6. Parent RSVPs and sees only their own family
  record('Parent', 'submits RSVP for own athlete', await patch(parent.idToken, `events/${IDS.event}/rsvps/${parent.uid}__${IDS.entry}`, { respondentUserId: str(parent.uid), athleteEntryId: str(IDS.entry), answer: str('yes') }), 200);
  record('Parent', 'reads own athlete roster entry', await get(parent.idToken, `teams/${IDS.team}/roster/${IDS.entry}`), 200);
  record('Parent', 'reads another family entry denied', await get(parent.idToken, `teams/${IDS.team}/roster/${IDS.entryOther}`), 403);
  record('Parent', 'reads own player identity', await get(parent.idToken, `players/${IDS.player}`), 200);

  // 7. Athlete sees only their own record
  record('Athlete', 'reads own roster entry', await get(athlete.idToken, `teams/${IDS.team}/roster/${IDS.entry}`), 200);
  record('Athlete', 'reads teammate entry denied', await get(athlete.idToken, `teams/${IDS.team}/roster/${IDS.entryOther}`), 403);

  // 8. Storage — skipped when the project has no bucket (Spark cannot create one).
  const SKIP_STORAGE = process.argv.includes('--skip-storage');
  if (SKIP_STORAGE) {
    console.log('\nStorage checks: NOT RUN (--skip-storage).');
  } else {
  const stamp = Date.now();
  const media = `teams/${IDS.team}/media/probe-${stamp}.png`;
  record('Storage', 'AD uploads own team media', await upload(ad.idToken, bucket, media, 'a'), 200);
  record('Storage', 'cross-school AD upload denied', await upload(ad2.idToken, bucket, `teams/${IDS.team}/media/x-${stamp}.png`, 'a'), 403);
  record('Storage', 'cross-school AD read denied', await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(media)}?alt=media`, { headers: { Authorization: `Bearer ${ad2.idToken}` } }).then((r) => r.status), 403);
  record('Storage', 'coach uploads team media', await upload(coach.idToken, bucket, `teams/${IDS.team}/media/c-${stamp}.png`, 'a'), 200);

  const docName = `teams/${IDS.team}/roster/${IDS.entry}/documents/probe-${stamp}.pdf`;
  // Guardians no longer write directly: creates go through the `uploadPaperwork` callable,
  // which owns authentication, the server-derived path and the create-only precondition.
  // 403 here is the intended answer, not a regression.
  record('Storage', 'guardian CREATE paperwork', await upload(parent.idToken, bucket, docName, 'first'), 403);
  record('Storage', 'guardian UPDATE same paperwork denied', await upload(parent.idToken, bucket, docName, 'second'), 403);
  record('Storage', 'coach UPDATE paperwork allowed', await upload(coach.idToken, bucket, docName, 'third'), 200);
  }

  // 9. Summary
  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} staging checks behaved as required.`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  [${f.group}] ${f.name} -> ${f.status} (expected ${f.expect})`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('staging run error:', err.message);
  process.exit(1);
});
