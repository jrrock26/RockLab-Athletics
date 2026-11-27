/**
 * The Storage counterpart of the Firestore AD-versus-AD suite.
 *
 * Every path in this bucket keys on a team or a school, so every one of them can be
 * reached from another district by an AD whose role is genuine. These assertions exist
 * because the previous rules OR'd a school-blind `isAd()` in front of the correct
 * check, which made the first disjunct decide the outcome.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { freshEnv } from './_env.mjs';
import { ENTRY_KID_A, SCHOOL_A, TEAM_A, seedFixtures } from './fixtures.mjs';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe('cross-school isolation in Storage', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const storage = (uid) => env.authenticatedContext(uid).storage();
  const upload = (uid, path, bytes = PNG, contentType = 'image/png') =>
    uploadBytes(ref(storage(uid), path), bytes, { contentType });

  test('the owning AD manages team media and film', async () => {
    await assertSucceeds(upload('adA', `teams/${TEAM_A}/media/logo.png`));
    await assertSucceeds(upload('adA', `teams/${TEAM_A}/videos/film.mp4`, PNG, 'video/mp4'));
  });

  test('another school AD cannot upload to team media, film or paperwork', async () => {
    await assertFails(upload('adB', `teams/${TEAM_A}/media/hijack.png`));
    await assertFails(upload('adB', `teams/${TEAM_A}/videos/hijack.mp4`, PNG, 'video/mp4'));
    await assertFails(upload('adB', `teams/${TEAM_A}/roster/${ENTRY_KID_A}/documents/physical.pdf`, PDF, 'application/pdf'));
  });

  test('another school AD cannot read team media, film or paperwork', async () => {
    // Something real to read: upload as the owner first.
    await assertSucceeds(upload('adA', `teams/${TEAM_A}/media/readable.png`));
    await assertSucceeds(upload('coachA', `teams/${TEAM_A}/roster/${ENTRY_KID_A}/documents/review.pdf`, PDF, 'application/pdf'));

    await assertFails(getBytes(ref(storage('adB'), `teams/${TEAM_A}/media/readable.png`)));
    await assertFails(getBytes(ref(storage('adB'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}/documents/review.pdf`)));
  });

  test('school logos belong to that school only', async () => {
    await assertSucceeds(upload('adA', `schools/${SCHOOL_A}/logo.png`));
    await assertFails(upload('adB', `schools/${SCHOOL_A}/logo.png`));
  });

  test('team members keep their own access', async () => {
    await assertSucceeds(upload('coachA', `teams/${TEAM_A}/media/practice.png`));
    // Direct guardian uploads were removed with the create-only workflow; the guardian
    // keeps read standing, which the paperwork suite asserts.
    await assertFails(upload('guardianA', `teams/${TEAM_A}/roster/${ENTRY_KID_A}/documents/clearance.png`));
    await assertFails(upload('followerX', `teams/${TEAM_A}/media/follower.png`));
  });
});
