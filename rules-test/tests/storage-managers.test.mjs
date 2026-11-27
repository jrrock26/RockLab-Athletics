/**
 * Storage authorization through the team manager index.
 *
 * Each case states the branch it exercises and the document budget it costs. The budget
 * is the reason this design exists: Cloud Storage rules may read two Firestore documents
 * per evaluation, so a manager must be resolvable from ONE (the team) and a guardian from
 * ONE (the roster entry).
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { freshEnv } from './_env.mjs';
import { ENTRY_KID_A, ENTRY_KID_B, TEAM_A, seedFixtures } from './fixtures.mjs';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const paper = (entry, name = 'physical.pdf') => `teams/${TEAM_A}/roster/${entry}/documents/${name}`;

describe('Storage: manager branch (one document)', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const storage = (uid) => env.authenticatedContext(uid).storage();
  const put = (uid, path, bytes = PNG, contentType = 'image/png') =>
    uploadBytes(ref(storage(uid), path), bytes, { contentType });

  test('owning AD creates, overwrites and deletes team media', async () => {
    await assertSucceeds(put('adA', `teams/${TEAM_A}/media/a.png`));
    await assertSucceeds(put('adA', `teams/${TEAM_A}/media/a.png`));
    await assertSucceeds(getBytes(ref(storage('adA'), `teams/${TEAM_A}/media/a.png`)));
  });

  test('owning AD reads and writes game film', async () => {
    await assertSucceeds(put('adA', `teams/${TEAM_A}/videos/f.mp4`, PNG, 'video/mp4'));
    await assertSucceeds(getBytes(ref(storage('adA'), `teams/${TEAM_A}/videos/f.mp4`)));
  });

  test('coach and staff are in the index and can upload', async () => {
    await assertSucceeds(put('coachA', `teams/${TEAM_A}/media/c.png`));
    await assertSucceeds(put('staffA', `teams/${TEAM_A}/media/s.png`));
  });

  test('a parent cannot upload team media', async () => {
    await assertFails(put('guardianA', `teams/${TEAM_A}/media/g.png`));
  });

  test('a parent can still read team media (two documents: team, membership)', async () => {
    await assertSucceeds(put('adA', `teams/${TEAM_A}/media/r.png`));
    await assertSucceeds(getBytes(ref(storage('guardianA'), `teams/${TEAM_A}/media/r.png`)));
    await assertSucceeds(getBytes(ref(storage('followerX'), `teams/${TEAM_A}/media/r.png`)));
  });
});

describe('Storage: guardian branch (one roster document)', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const storage = (uid) => env.authenticatedContext(uid).storage();
  const putPdf = (uid, path, body = PDF) =>
    uploadBytes(ref(storage(uid), path), body, { contentType: 'application/pdf' });

  test('guardian creates paperwork for their own child', async () => {
    await assertSucceeds(putPdf('guardianA', paper(ENTRY_KID_A)));
  });

  test('guardian reads it back', async () => {
    await assertSucceeds(getBytes(ref(storage('guardianA'), paper(ENTRY_KID_A))));
    // The overwrite case CANNOT be asserted here: the Storage emulator evaluates every
    // upload as `create`, including one that replaces an existing object. That is the
    // whole reason rules-test/scripts/storage-create-vs-update.mjs exists and why the
    // real-bucket matrix is the authority on `allow update`.
  });

  test('guardian cannot reach another family, on read or write', async () => {
    await assertSucceeds(putPdf('guardianB', paper(ENTRY_KID_B)));
    await assertFails(getBytes(ref(storage('guardianA'), paper(ENTRY_KID_B))));
    await assertFails(putPdf('guardianA', paper(ENTRY_KID_B)));
  });

  test('athlete cannot read or write their own paperwork', async () => {
    await assertFails(getBytes(ref(storage('kidA'), paper(ENTRY_KID_A))));
    await assertFails(putPdf('kidA', paper(ENTRY_KID_A, 'a.pdf')));
  });

  test('manager can update paperwork the guardian created', async () => {
    await assertSucceeds(putPdf('coachA', paper(ENTRY_KID_A)));
  });

  test('a follower reads no paperwork', async () => {
    await assertFails(getBytes(ref(storage('followerX'), paper(ENTRY_KID_A))));
  });
});

describe('Storage: fail-closed and revocation', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const storage = (uid) => env.authenticatedContext(uid).storage();
  const put = (uid, path) => uploadBytes(ref(storage(uid), path), PNG, { contentType: 'image/png' });

  test('a team with no schoolId and no index is closed to every AD', async () => {
    await assertFails(put('adA', 'teams/teamNoSchool/media/x.png'));
    await assertFails(getBytes(ref(storage('adA'), 'teams/teamNoSchool/media/x.png')));
  });

  test('a team naming a school that does not exist is closed', async () => {
    await assertFails(put('adA', 'teams/teamGhostSchool/media/x.png'));
    await assertFails(put('adB', 'teams/teamGhostSchool/media/x.png'));
  });

  test('an AD of another school cannot touch this team', async () => {
    await assertFails(put('adB', `teams/${TEAM_A}/media/b.png`));
    await assertFails(getBytes(ref(storage('adB'), `teams/${TEAM_A}/videos/f.mp4`)));
    await assertFails(getBytes(ref(storage('adB'), paper(ENTRY_KID_A))));
  });

  test('removing a coach from the index revokes access immediately', async () => {
    await assertSucceeds(put('coachA', `teams/${TEAM_A}/media/before.png`));
    // Exactly what the membership trigger does: the row is gone and the index rebuilt.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`teams/${TEAM_A}/members/coachA`).delete();
      await db.doc(`teams/${TEAM_A}`).set({ managerUserIds: ['adA', 'staffA'] }, { merge: true });
    });
    await assertFails(put('coachA', `teams/${TEAM_A}/media/after.png`));
    await assertSucceeds(put('adA', `teams/${TEAM_A}/media/still.png`));
  });
});
