#!/usr/bin/env node
/**
 * revokeTeamMember on staging: authority, atomicity, immediate revocation.
 *
 *   node rules-test/scripts/staging-revoke.mjs
 *
 * Seeding note: `assignTeamRole` is not deployed on staging, so the staff membership used as
 * the subject is written directly under Firestore rules (which permit the AD to write
 * teams/{id}/members/{uid}). That is a fixture, not the path under test — the removal itself
 * goes through the callable. The index is allowed to catch up BEFORE the removal, so the
 * post-removal 403 cannot be explained by a lagging seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const P = 'rocklab-athletics-staging';
const FN = `https://us-central1-${P}.cloudfunctions.net`;
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const TEAM = 'qa-team';
const rows = [];
const note = (n, ok, d) => { rows.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };

async function signIn(m, key) {
  const a = m.accounts[key];
  if (!a) throw new Error(`manifest has no account '${key}'`);
  const b = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password, returnSecureToken: true }),
  }).then((r) => r.json());
  return { idToken: b.idToken, uid: b.localId };
}

const call = async (name, tok, data) => {
  const r = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, result: b.result, error: b.error };
};

const storageRead = (m, tok, name) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(name)}?alt=media`,
  tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
).then((r) => r.status);

const getTeam = (tok) => fetch(`${FS}/teams/${TEAM}`, { headers: { Authorization: `Bearer ${tok}` } })
  .then((r) => r.json());

async function seedMember(tok, uid, role) {
  // Upsert: the row may already exist from an earlier run, so clear it first.
  await fetch(`${FS}/teams/${TEAM}/members/${uid}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
  });
  return fetch(`${FS}/teams/${TEAM}/members?documentId=${uid}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      teamId: { stringValue: TEAM }, userId: { stringValue: uid },
      role: { stringValue: role }, name: { stringValue: 'QA' }, email: { stringValue: 'qa@rocklab.test' },
    } }),
  }).then((r) => r.status);
}

async function waitForIndex(tok, uid) {
  for (let i = 0; i < 20; i += 1) {
    const t = await getTeam(tok);
    const ids = (t.fields?.managerUserIds?.arrayValue?.values || []).map((v) => v.stringValue);
    if (ids.includes(uid)) return i;
    await new Promise((r) => setTimeout(r, 400));
  }
  return -1;
}

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== P) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }

  const ad = await signIn(m, 'ad');
  const ad2 = await signIn(m, 'ad2');
  const parent = await signIn(m, 'parent');
  const coach = await signIn(m, 'coach');
  const team = await getTeam(ad.idToken);
  const headCoachId = team.fields?.headCoachId?.stringValue || '';
  console.log(`team ${TEAM}: headCoach=${headCoachId.slice(0, 6)}, members seeded below`);

  // Fixture: the AD writes a staff membership for the parent account.
  const seed = await seedMember(ad.idToken, parent.uid, 'staff');
  note('AD can seed a staff membership under rules', seed === 200, `HTTP ${seed}`);
  const idx = await waitForIndex(ad.idToken, parent.uid);
  note('the index catches up before the removal (so the seed is not the lag)',
    idx >= 0, idx >= 0 ? `indexed after ~${idx * 400} ms` : 'never indexed');

  const probe = `teams/${TEAM}/media/probe-${Date.now()}.mov`;
  const before = await storageRead(m, parent.idToken, probe);
  note('the target is a Storage manager before revocation', before === 404,
    `HTTP ${before} (404 = authorised read of a missing object, 403 = not authorised)`);

  // Authority.
  const crossSchool = await call('revokeTeamMember', ad2.idToken, { teamId: TEAM, targetUid: parent.uid });
  note('cross-school AD cannot revoke', crossSchool.error?.status === 'PERMISSION_DENIED', `${crossSchool.error?.status}`);
  const anon = await call('revokeTeamMember', null, { teamId: TEAM, targetUid: parent.uid });
  note('anonymous caller is refused', anon.status === 401, `${anon.error?.status || anon.status}`);
  const self = await call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: ad.uid });
  note('nobody can revoke themselves', self.error?.status === 'FAILED_PRECONDITION', `${self.error?.status}`);
  const headCoach = await call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: headCoachId });
  note('the head coach cannot be removed without a handoff', headCoach.error?.status === 'FAILED_PRECONDITION', `${headCoach.error?.status}`);
  const sittingAd = await call('revokeTeamMember', coach.idToken, { teamId: TEAM, targetUid: ad.uid });
  note('a coach cannot remove the sitting AD (no membership row exists, and nothing is removed)',
    sittingAd.result?.removed !== true, `removed=${sittingAd.result?.removed}, error=${sittingAd.error?.status}`);

  // Removal, timed from the call to the very next Storage request.
  const t0 = Date.now();
  const revoke = await call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: parent.uid });
  const tCommit = Date.now();
  note('AD revokes staff', revoke.status === 200 && revoke.result?.removed === true,
    `HTTP ${revoke.status}, managers ${JSON.stringify(revoke.result?.managerUserIds)}`);
  const after = await storageRead(m, parent.idToken, probe);
  note('removed member is denied Storage immediately', after === 403,
    `before ${before}, after ${after}, ${Date.now() - tCommit} ms after the callable returned (${tCommit - t0} ms call)`);

  // Duplicate and delayed retry.
  const dup = await call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: parent.uid });
  const afterDup = await storageRead(m, parent.idToken, probe);
  note('a duplicate revoke is idempotent and restores nothing',
    dup.status === 200 && dup.result?.removed === false && afterDup === 403,
    `removed=${dup.result?.removed}, storage ${afterDup}`);

  // Concurrency: re-seed, wait for the index, then two simultaneous revokes.
  await seedMember(ad.idToken, parent.uid, 'staff');
  await waitForIndex(ad.idToken, parent.uid);
  const [c1, c2] = await Promise.all([
    call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: parent.uid }),
    call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: parent.uid }),
  ]);
  const removedOnce = [c1, c2].filter((r) => r.result?.removed === true).length;
  const absent = [c1, c2].filter((r) => r.result?.alreadyAbsent === true).length;
  note('concurrent revokes remove exactly once', removedOnce === 1 && absent === 1, `${removedOnce} removed, ${absent} absent`);
  const afterRace = await storageRead(m, parent.idToken, probe);
  note('member stays denied after concurrent revokes', afterRace === 403, `HTTP ${afterRace}`);

  // Restore the fixture to its pre-test shape: a plain 'parent' membership, no manager standing.
  const cleanup = await seedMember(ad.idToken, parent.uid, 'parent');
  note('fixture restored to a plain parent membership', cleanup === 200, `HTTP ${cleanup}`);

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} revocation cases behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('revoke harness error:', e.message); process.exit(1); });
